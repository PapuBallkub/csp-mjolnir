import { badRequest } from '#common/errors/http-error.js';

import { MAX_PASSWORD_BYTES } from './password.js';

// Loose on purpose: only delivery settles whether an address is real, and that
// is the FR08 verification mail, not this regex.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MIN_PASSWORD_LENGTH = 8;

// Both fields are checked before throwing, and errors come back keyed by field
// so the form can put each message under the input it belongs to.
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
    // Bytes, not characters: Thai is three bytes each, so this arrives at ~24.
    errors.password = `Password must be at most ${MAX_PASSWORD_BYTES} bytes.`;
  }

  if (Object.keys(errors).length > 0) {
    throw badRequest('Check the details you entered.', errors);
  }

  return { email, password };
}
