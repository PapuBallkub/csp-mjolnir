import { badRequest, HttpError } from '#common/errors/http-error.js';

import { TOKEN_PATTERN } from './email-token.js';

// Loose on purpose: only delivery settles whether an address is real, and that
// is the confirm link (0041), not this regex.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MIN_PASSWORD_LENGTH = 8;

// Characters, not bytes, so a Thai password gets the same room as an English
// one. Nothing is cut off past bcrypt's 72 bytes any more, because the password
// is pre-hashed first (password.js). The ceiling is there only to bound the
// work a single request can ask for.
const MAX_PASSWORD_LENGTH = 128;

// Characters, not bytes, for the same reason: a byte limit would stop a Thai
// name at about 26 characters for no reason anyone could explain.
const MAX_NAME_LENGTH = 80;

// Shared by both entry points below, which is the point: login and register
// agree on what a credential is, and neither throws here, so each caller can
// finish collecting its own fields and report all of them in one 400.
function collectCredentials(body) {
  const errors = {};

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!email) {
    errors.email = 'กรุณากรอกอีเมล';
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'รูปแบบอีเมลไม่ถูกต้อง';
  }

  if (!password) {
    errors.password = 'กรุณากรอกรหัสผ่าน';
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `รหัสผ่านต้องมีความยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`;
  } else if ([...password].length > MAX_PASSWORD_LENGTH) {
    // Counted by code point, so an emoji is one character, not two.
    errors.password = `รหัสผ่านต้องมีความยาวไม่เกิน ${MAX_PASSWORD_LENGTH} ตัวอักษร`;
  }

  return { email, password, errors };
}

function throwIfAny(errors) {
  if (Object.keys(errors).length > 0) {
    throw badRequest('กรุณาตรวจสอบข้อมูลที่กรอก', errors);
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
    errors.name = 'กรุณากรอกชื่อของคุณ';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `ชื่อต้องมีความยาวไม่เกิน ${MAX_NAME_LENGTH} ตัวอักษร`;
  }

  throwIfAny(errors);

  return { email, password, name };
}

// Confirming a registration (0041). The token's shape is checked before any
// lookup, and a wrong shape gets the same answer as an unknown or used token.
// The password has no length rules here: it's compared with the one chosen at
// sign-up, not set.
export function parseConfirmation(body) {
  const token = typeof body?.token === 'string' ? body.token : '';
  if (!TOKEN_PATTERN.test(token)) {
    throw new HttpError(400, 'ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว สมัครอีกครั้งเพื่อรับลิงก์ใหม่', undefined, 'LINK_INVALID');
  }

  const password = typeof body?.password === 'string' ? body.password : '';
  if (!password) {
    throw badRequest('กรุณาตรวจสอบข้อมูลที่กรอก', { password: 'กรุณากรอกรหัสผ่านที่ตั้งไว้ตอนสมัคร' });
  }
  // A bound on the work one request can ask for, as at sign-up
  if ([...password].length > MAX_PASSWORD_LENGTH) {
    throw unauthorizedPassword();
  }

  return { token, password };
}

// Longer than any password we accept, so it can't be the one chosen
const unauthorizedPassword = () =>
  new HttpError(401, 'รหัสผ่านไม่ตรงกับที่ตั้งไว้ตอนสมัคร', undefined, 'WRONG_PASSWORD');
