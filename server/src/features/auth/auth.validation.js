import { badRequest } from '#common/errors/http-error.js';

import { MAX_PASSWORD_BYTES } from './password.js';

// Loose on purpose: only delivery settles whether an address is real, and that
// is the FR08 verification mail, not this regex.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MIN_PASSWORD_LENGTH = 8;

// Characters, not bytes. The password ceiling below is in bytes because bcrypt
// truncates at 72 of them; nothing truncates a name, and a byte limit would
// stop a Thai name at about 26 characters for no reason anyone could explain.
const MAX_NAME_LENGTH = 80;

// Shared by both entry points below, which is the point: login and register
// agree on what a credential is, and neither throws here, so each caller can
// finish collecting its own fields and report all of them in one 400.
function collectCredentials(body) {
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

  return { email, password, errors };
}

function throwIfAny(errors) {
  if (Object.keys(errors).length > 0) {
    throw badRequest('Check the details you entered.', errors);
  }
}

// Login. Deliberately does not look at `name`: the same body shape that
// registers has to keep working here, and a signed-in user sending one extra
// field is not an error.
export function parseCredentials(body) {
  const { email, password, errors } = collectCredentials(body);
  throwIfAny(errors);
  return { email, password };
}

// Registration. Every field is checked before throwing, and errors come back
// keyed by field so the form can put each message under the input it belongs to.
export function parseRegistration(body) {
  const { email, password, errors } = collectCredentials(body);

  const name = typeof body?.name === 'string' ? body.name.trim() : '';

  if (!name) {
    errors.name = 'Your name is required.';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `Your name must be at most ${MAX_NAME_LENGTH} characters.`;
  }

  throwIfAny(errors);

  return { email, password, name };
}
