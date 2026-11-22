import crypto from 'node:crypto';

import { env } from '#common/config/env.js';

// Security events and unexpected errors, one JSON line each (ADR 0043, ASVS
// V16.3.1–V16.3.4). Events go to stdout and errors to stderr, where the host
// collects them. A line carries what an investigation needs: when, what, from
// where, and which account. Never a password, a token, a cookie or an address.
//
// It lives in common/ because requireAuth, both rate limiters, the error handler
// and admin all write here, and it knows nothing about any of them (0003, rule
// three: common/ never imports from features/).

// The security events this platform defines (V16.3.3), and how serious each is.
// The documented list is this one; an event missing from it still logs, as a
// WARNING, so a typo never loses a line.
export const SECURITY_EVENTS = Object.freeze({
  'auth.login.success': 'INFO',
  'auth.login.failure': 'WARNING',
  'auth.google.success': 'INFO',
  'auth.google.failure': 'WARNING',
  'auth.logout': 'INFO',
  'auth.register.requested': 'INFO',
  'auth.email.confirmed': 'INFO',
  'auth.email.confirm_failed': 'WARNING',
  'auth.password_reset.requested': 'INFO',
  'auth.password_reset.completed': 'INFO',
  'auth.password_reset.failed': 'WARNING',
  'auth.password.changed': 'INFO',
  'auth.password.change_failed': 'WARNING',
  'auth.session.rejected': 'WARNING',
  'authz.denied': 'WARNING',
  'ratelimit.exceeded': 'WARNING',
  'request.too_large': 'WARNING',
  'admin.action': 'INFO',
});

// The only fields a caller can put on a line. Anything else is dropped, so a
// later caller can't log a password or a token by passing it (V16.2.5). An
// address is never one of them: `email` is turned into `emailHash` below.
const FIELDS = [
  'userId',
  'reason',
  'role',
  'required',
  'limiter',
  'kind',
  'action',
  'target',
  'status',
  'linked',
  'detail',
];

// Long enough for Google's refusal or a route; short enough that no one value
// can fill a line
const MAX_TEXT = 300;
const MAX_ERROR_TEXT = 8000;

// Keyed, so a reader of the log alone can't test an address against it, but
// the same address always gives the same hash and failures against one account
// group together. Derived with HKDF under its own label, so the key is
// independent of what else the secret does. From PASSWORD_PEPPER rather than
// JWT_SECRET: rotating JWT_SECRET is how everyone is signed out, which is what
// an incident calls for, and the hashes must still match across it. The pepper
// is never rotated (env.js).
const EMAIL_KEY = Buffer.from(crypto.hkdfSync('sha256', env.passwordPepper, '', 'gipdp:security-log:v1', 32));

/**
 * The hash a line carries instead of an address: what to search the log for
 * when investigating one account. 128 bits of HMAC-SHA256, normalised as
 * User.email is.
 *
 * @param {string} email
 * @returns {string} 32 hex characters
 */
export function emailHash(email) {
  return crypto
    .createHmac('sha256', EMAIL_KEY)
    .update(String(email).trim().toLowerCase())
    .digest('hex')
    .slice(0, 32);
}

const defaultSink = (line, stream) => {
  (stream === 'stderr' ? process.stderr : process.stdout).write(`${line}\n`);
};
let sink = defaultSink;

/**
 * Where lines go: a test captures them here instead of reading stdout. Pass
 * null to put the default back.
 *
 * @param {((line: string, stream: 'stdout' | 'stderr') => void) | null} next
 * @returns {Function} The sink it replaced
 */
export function setSecurityLogSink(next) {
  const previous = sink;
  sink = next ?? defaultSink;
  return previous;
}

const cut = (text, max = MAX_TEXT) => (text.length > max ? `${text.slice(0, max)}…` : text);

// Strings, finite numbers, booleans, and an ObjectId as its hex. Nothing else
// can reach a line, so no object can carry a field past the allowlist.
function scalar(value) {
  if (typeof value === 'string') return cut(value);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (value && typeof value.toHexString === 'function') return value.toHexString();
  return undefined;
}

// A flat object of scalars, for the few request fields an admin action names
function flat(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out = {};
  for (const [key, item] of Object.entries(value).slice(0, 10)) {
    const clean = scalar(item);
    if (clean !== undefined) out[key] = clean;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const TRACE_ID = /^[0-9a-f]{32}$/i;

/**
 * Where a request came from, taken now. A caller that logs later (when the
 * response closes) takes this first, because Express restores `baseUrl` and
 * `params` when a request leaves a router.
 *
 * - `ip` follows `trust proxy` (TRUST_PROXY_HOPS).
 * - `path` never has the query: the Google callback's carries the code.
 * - On Cloud Run, the request's trace id links the line to the platform's own
 *   request log, which needs the project id (GOOGLE_CLOUD_PROJECT).
 */
export function requestContext(req) {
  const context = {
    ip: typeof req.ip === 'string' ? req.ip : undefined,
    method: req.method,
    path: cut(`${req.baseUrl ?? ''}${req.path ?? ''}`),
  };
  const trace = String(req.get?.('x-cloud-trace-context') ?? '').split('/')[0];
  if (env.googleCloudProject && TRACE_ID.test(trace)) {
    context['logging.googleapis.com/trace'] = `projects/${env.googleCloudProject}/traces/${trace}`;
  }
  return context;
}

const contextOf = (req) => (req && typeof req.get === 'function' ? requestContext(req) : (req ?? {}));

function write(record, stream) {
  try {
    // JSON escapes \r, \n and every other control character, so no value can
    // start a line of its own (V16.4.1)
    sink(JSON.stringify(record), stream);
  } catch {
    // A log that fails must never turn a sign-in into a 500
  }
}

/**
 * Writes one security event.
 *
 * @param {object} req - The Express request, or what requestContext took from it
 * @param {string} event - One of SECURITY_EVENTS
 * @param {object} [fields] - Only the allowlisted keys are kept; `email` is hashed
 * @param {{ severity?: string }} [options] - Overrides the event's usual severity
 */
export function securityEvent(req, event, fields = {}, { severity } = {}) {
  try {
    const record = {
      time: new Date().toISOString(),
      severity: severity ?? SECURITY_EVENTS[event] ?? 'WARNING',
      message: event,
      event,
    };
    for (const key of FIELDS) {
      const value = key === 'detail' ? flat(fields[key]) : scalar(fields[key]);
      if (value !== undefined) record[key] = value;
    }
    if (typeof fields.email === 'string' && fields.email.trim()) record.emailHash = emailHash(fields.email);
    write({ ...record, ...contextOf(req) }, 'stdout');
  } catch {
    // As above: never thrown to the caller
  }
}

/**
 * Writes an unexpected error (status 500 and up) to stderr as one line, with
 * its stack, where `console.error(err)` used to print many (V16.3.4).
 *
 * @param {object} req
 * @param {unknown} err
 * @param {number} status
 */
export function logServerError(req, err, status) {
  try {
    const text = err instanceof Error ? (err.stack ?? err.message) : String(err);
    write(
      {
        time: new Date().toISOString(),
        severity: 'ERROR',
        message: cut(text, MAX_ERROR_TEXT),
        event: 'server.error',
        status,
        ...(scalar(req?.user?.id) ? { userId: scalar(req.user.id) } : {}),
        ...contextOf(req),
      },
      'stderr',
    );
  } catch {
    // As above
  }
}
