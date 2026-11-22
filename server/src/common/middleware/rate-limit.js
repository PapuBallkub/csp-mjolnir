import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

import { HttpError } from '#common/errors/http-error.js';
import { securityEvent } from '#common/logging/security-log.js';

// Counting mechanism only. It lives in common/ rather than in a feature because
// it knows nothing about what it is guarding — unlike requireAuth, which has to
// know how a session is signed. The policies (which routes, which numbers) are
// the feature's business. See 0003, rule three.
//
// Counters live in this process's memory. That is correct for one server and
// silently wrong for two: each process keeps its own count, so a limit of 5
// becomes 5 per process. Swapping the store is the fix, and passing `store`
// through here is what keeps it a one-line change. See 0007.

// Express only knows how many proxies sit in front of it if we tell it. Behind
// an unconfigured proxy every request reports the proxy's address, so the whole
// internet shares one bucket and the first burst locks out everyone.
//
// `name` is the limit's key in its feature's numbers (loginByIp, adminCostly),
// so a 429 in the log says which limit tripped.
function build({ name, windowMs, limit, message, keyGenerator, skip, skipSuccessfulRequests, store }) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator,
    skip,
    skipSuccessfulRequests,
    store,
    // draft-8 sends RateLimit-* and Retry-After, so a client can find out how
    // long to wait without us writing it into prose.
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // The library answers with plain text by default. Everything else in this
    // API fails as { error: { message } }, and a 429 is not the place to make a
    // client parse a second shape.
    handler: (req, res, next) => {
      // ASVS V16.3.3: a tripped limit is an attempt worth seeing
      securityEvent(req, 'ratelimit.exceeded', { limiter: name ?? 'unnamed', userId: req.user?.id });
      next(new HttpError(429, message ?? defaultMessage(windowMs)));
    },
  });
}

function defaultMessage(windowMs) {
  const minutes = Math.ceil(windowMs / 60_000);
  return `มีการพยายามทำรายการมากเกินไป กรุณาลองใหม่ในอีก ${minutes} นาที`;
}

// For routes anyone can reach, where the caller's address is all we have.
// ipKeyGenerator, rather than req.ip, because a single attacker owns every
// address in an IPv6 /64 — keying per address would hand them 2^64 buckets.
export function limitByIp(options) {
  return build({ ...options, keyGenerator: (req) => ipKeyGenerator(req.ip) });
}

// For routes behind requireAuth: one budget per account, wherever its requests
// come from, and one person's use never spends anyone else's. Mounted before
// requireAuth it has no account to count, which is a wiring mistake, so it
// fails loudly rather than leaving the route unlimited.
export function limitByUser(options) {
  return build({
    ...options,
    keyGenerator: (req) => {
      if (!req.user?.id) throw new Error('limitByUser must be mounted after requireAuth');
      return `user:${req.user.id}`;
    },
  });
}

