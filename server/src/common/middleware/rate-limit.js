import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

import { HttpError } from '#common/errors/http-error.js';

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
function build({ windowMs, limit, message, keyGenerator, skip, skipSuccessfulRequests, store }) {
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
      next(new HttpError(429, message ?? defaultMessage(windowMs)));
    },
  });
}

function defaultMessage(windowMs) {
  const minutes = Math.ceil(windowMs / 60_000);
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

// For routes anyone can reach, where the caller's address is all we have.
// ipKeyGenerator, rather than req.ip, because a single attacker owns every
// address in an IPv6 /64 — keying per address would hand them 2^64 buckets.
export function limitByIp(options) {
  return build({ ...options, keyGenerator: (req) => ipKeyGenerator(req.ip) });
}

// For routes behind requireAuth. The account is a better key than the address:
// it follows someone between networks, and it does not punish everyone sharing
// an office or a mobile carrier's NAT for one person's behaviour.
//
// Mount it after requireAuth. Mounted before, req.user is undefined and every
// caller silently shares one bucket, which is worse than not limiting at all.
export function limitByUser(options) {
  return build({
    ...options,
    keyGenerator: (req) => req.user.id,
    skip: (req) => !req.user?.id,
  });
}
