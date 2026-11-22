import { badRequest, HttpError } from '#common/errors/http-error.js';

import { TOKEN_PATTERN } from './email-token.js';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordProblem } from './password-policy.js';

// Loose on purpose: only delivery settles whether an address is real, and that
// is the confirm link (0041), not this regex.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Characters, not bytes: a byte limit would stop a Thai name at about 26
// characters for no reason anyone could explain.
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

const linkInvalid = (message) => new HttpError(400, message, undefined, 'LINK_INVALID');

// Login. Deliberately does not look at `name`: the same body shape that
// registers has to keep working here, and a signed-in user sending one extra
// field is not an error. Nor at the password policy: an old weak password
// still signs in (0042).
export function parseCredentials(body) {
  const { email, password, errors } = collectCredentials(body);
  throwIfAny(errors);
  return { email, password };
}

// Registration. Every field is checked before throwing, and errors come back
// keyed by field so the form can put each message under the input it belongs to.
// A new password also has to pass the policy: not a common or breached one, and
// not the platform's or the person's own name with digits added (0042).
export function parseRegistration(body) {
  const { email, password, errors } = collectCredentials(body);

  const name = typeof body?.name === 'string' ? body.name.trim() : '';

  if (!name) {
    errors.name = 'กรุณากรอกชื่อของคุณ';
  } else if (name.length > MAX_NAME_LENGTH) {
    errors.name = `ชื่อต้องมีความยาวไม่เกิน ${MAX_NAME_LENGTH} ตัวอักษร`;
  }

  if (!errors.password) {
    const problem = passwordProblem(password, { email, name });
    if (problem) errors.password = problem;
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
    throw linkInvalid('ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว สมัครอีกครั้งเพื่อรับลิงก์ใหม่');
  }

  const password = typeof body?.password === 'string' ? body.password : '';
  if (!password) {
    throw badRequest('กรุณาตรวจสอบข้อมูลที่กรอก', { password: 'กรุณากรอกรหัสผ่านที่ตั้งไว้ตอนสมัคร' });
  }
  // A bound on the work one request can ask for, as at sign-up
  if ([...password].length > MAX_PASSWORD_LENGTH) {
    throw new HttpError(401, 'รหัสผ่านไม่ตรงกับที่ตั้งไว้ตอนสมัคร', undefined, 'WRONG_PASSWORD');
  }

  return { token, password };
}

// Asking for a reset link (0042): an address, nothing else
export function parseForgot(body) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) throw badRequest('กรุณาตรวจสอบข้อมูลที่กรอก', { email: 'กรุณากรอกอีเมล' });
  if (!EMAIL_PATTERN.test(email)) throw badRequest('กรุณาตรวจสอบข้อมูลที่กรอก', { email: 'รูปแบบอีเมลไม่ถูกต้อง' });
  return { email };
}

// Using a reset link. The token's shape is checked before any lookup; the new
// password's policy is checked by the service, which knows whose account it is.
export function parseReset(body) {
  const token = typeof body?.token === 'string' ? body.token : '';
  if (!TOKEN_PATTERN.test(token)) {
    throw linkInvalid('ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว ขอลิงก์ตั้งรหัสผ่านใหม่อีกครั้ง');
  }
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!password) throw badRequest('กรุณาตรวจสอบข้อมูลที่กรอก', { password: 'กรุณากรอกรหัสผ่านใหม่' });
  return { token, password };
}

// Changing a password while signed in: the current one and the new one
// (ASVS V6.2.3). The new one's policy is checked by the service, with the
// account's own email and name.
export function parsePasswordChange(body) {
  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
  const errors = {};
  if (!currentPassword) errors.currentPassword = 'กรุณากรอกรหัสผ่านปัจจุบัน';
  if (!newPassword) errors.newPassword = 'กรุณากรอกรหัสผ่านใหม่';
  throwIfAny(errors);
  return { currentPassword, newPassword };
}
