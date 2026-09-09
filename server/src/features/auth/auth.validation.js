import { badRequest } from '#common/errors/http-error.js';

import { MAX_PASSWORD_BYTES } from './password.js';

// Deliberately loose. The only address shape worth rejecting here is one that
// cannot be delivered to at all; everything subtler — a typo'd domain, a real
// domain with no mailbox — is only ever settled by sending mail to it, which is
// what the FR08 verification flow will do.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MIN_PASSWORD_LENGTH = 8;

// Errors come back keyed by field so the sign-up form can put each message
// under the input it belongs to, and both fields are checked before throwing so
// a form with two problems does not surface them one reload at a time.
export function parseCredentials(body) {
  const errors = {};

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!email) {
    errors.email = 'Email is required.';
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'That does not look like an email address.';
  }

  if (!password) {
    errors.password = 'Password is required.';
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  } else if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
    // Thai is three bytes a character in UTF-8, so a Thai passphrase reaches
    // this limit at around 24 characters while an English one takes 72. Saying
    // "characters" here would be a lie to half our users.
    errors.password = `Password must be at most ${MAX_PASSWORD_BYTES} bytes.`;
  }

  if (Object.keys(errors).length > 0) {
    throw badRequest('Check the details you entered.', errors);
  }

  return { email, password };
}
