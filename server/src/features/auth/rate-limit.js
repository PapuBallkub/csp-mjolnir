import { rateLimit } from 'express-rate-limit';

import { HttpError } from '#common/errors/http-error.js';
import { securityEvent } from '#common/logging/security-log.js';
import { limitByIp, limitByUser } from '#common/middleware/rate-limit.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// What the limits are, separate from how counting works. Two layers on login
// because they defend different things and neither one covers the other.
export const authRateLimits = {
  // Protects our CPU. bcrypt at cost 12 is deliberately slow, and that cost is
  // ours as much as the attacker's, so this counts successful logins too.
  // Generous on purpose: a university lab or a mobile carrier's NAT puts a lot
  // of unrelated people behind one address.
  loginByIp: { windowMs: 15 * MINUTE, limit: 30 },

  // Protects one account. An attacker spread across a botnet never trips the
  // limiter above, because no single address looks busy. Counts failures only,
  // so someone who types their password correctly never spends budget.
  //
  // 15 minutes. Password reset is the way out now (0042), so the lockout could
  // be longer, but a longer one is also a longer lockout for anyone a stranger
  // locks out on purpose with five bad guesses. See 0004 and 0007.
  loginByEmail: { windowMs: 15 * MINUTE, limit: 5 },

  // Caps mass account creation. Signing up is rare per person, so this can be
  // tight without anyone noticing.
  registerByIp: { windowMs: HOUR, limit: 10 },

  // Protects one inbox. Every registration sends an email to the address typed,
  // so this stops anyone flooding a stranger's inbox with confirm links. Counts
  // every request, and every address alike, whether it has an account or not,
  // so a 429 says nothing about who is registered (0041).
  registerByEmail: { windowMs: HOUR, limit: 3 },

  // Each confirmation is a bcrypt compare, like a login, so the same budget
  verifyByIp: { windowMs: 15 * MINUTE, limit: 30 },

  // Reset links (0042). Like registration: one budget per caller, and one per
  // inbox counting every request for every address alike, so a 429 says nothing
  // about who has an account.
  forgotByIp: { windowMs: HOUR, limit: 10 },
  forgotByEmail: { windowMs: HOUR, limit: 3 },
  // Using a link hashes a new password
  resetByIp: { windowMs: 15 * MINUTE, limit: 30 },

  // Changing a password while signed in: two bcrypt operations each
  passwordChangeByUser: { windowMs: HOUR, limit: 10 },
};

// Keyed on the address someone is trying to break into, not on who is asking.
// Normalised exactly as parseCredentials does, or Victim@x.com and victim@x.com
// would get a five-guess budget each.
//
// This one is not in common/ because an email key only makes sense on an
// unauthenticated request that carries one in its body.
function limitByEmail({ name, windowMs, limit }, { countSuccesses = false, message } = {}) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator: (req) => req.body.email.trim().toLowerCase(),
    // Validation has not run yet — it is the controller's first line. A request
    // with no usable email is left to fail there rather than poisoning a bucket
    // keyed on nothing.
    skip: (req) => typeof req.body?.email !== 'string' || req.body.email.trim() === '',
    // At login only 2xx is a success, so a 401 counts and so does a 400. A
    // missing account and a wrong password both return the same 401 from
    // signInWithPassword, which is what stops this becoming an oracle for which
    // addresses are registered. Registration counts everything (countSuccesses).
    skipSuccessfulRequests: !countSuccesses,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next) => {
      // The address the attempts were against, as its hash (ASVS V16.3.3)
      securityEvent(req, 'ratelimit.exceeded', { limiter: name, email: req.body.email });
      next(new HttpError(429, message ?? 'มีการพยายามเข้าสู่ระบบสำหรับบัญชีนี้มากเกินไป กรุณาลองใหม่ในอีก 15 นาที'));
    },
  });
}

// Built per app rather than at import time, so a test can drive the real
// middleware with its own numbers instead of the suite's traffic having to fit
// inside production limits.
//
// Merged over the defaults, so a test that names only the limits it is about
// still gets every limiter.
export function createAuthLimiters(overrides = authRateLimits) {
  const limits = { ...authRateLimits, ...overrides };
  // Each limit carries its key as its name, so a 429 in the log says which one
  const named = (key) => ({ ...limits[key], name: key });
  return {
    login: [limitByIp(named('loginByIp')), limitByEmail(named('loginByEmail'))],
    register: [
      limitByIp(named('registerByIp')),
      limitByEmail(named('registerByEmail'), {
        countSuccesses: true,
        message: 'สมัครด้วยอีเมลนี้หลายครั้งเกินไป กรุณารอ 1 ชั่วโมงแล้วลองใหม่',
      }),
    ],
    verify: [limitByIp(named('verifyByIp'))],
    forgot: [
      limitByIp(named('forgotByIp')),
      limitByEmail(named('forgotByEmail'), {
        countSuccesses: true,
        message: 'ขอลิงก์ตั้งรหัสผ่านสำหรับอีเมลนี้หลายครั้งเกินไป กรุณารอ 1 ชั่วโมงแล้วลองใหม่',
      }),
    ],
    reset: [limitByIp(named('resetByIp'))],
    // After requireAuth: it keys on the signed-in account
    passwordChange: [limitByUser(named('passwordChangeByUser'))],
  };
}
