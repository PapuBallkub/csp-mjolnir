import { registerWithPassword, signInWithPassword } from './auth.service.js';
import { parseCredentials } from './auth.validation.js';
import { clearSessionCookie, setSessionCookie, signSessionToken } from './session.js';

// Registering signs you in: the password was just chosen by whoever owns the
// account, so a second form asking for it again proves nothing.
export async function register(req, res) {
  const { email, password } = parseCredentials(req.body);

  const user = await registerWithPassword({
    email,
    password,
    // FR08 consent. Absent means no, so a missing field never becomes a signup.
    notificationConsent: req.body?.notificationConsent === true,
  });

  setSessionCookie(res, signSessionToken(user));
  res.status(201).json({ user });
}

export async function login(req, res) {
  const { email, password } = parseCredentials(req.body);
  const user = await signInWithPassword({ email, password });

  setSessionCookie(res, signSessionToken(user));
  res.json({ user });
}

// Succeeds whether or not anyone was signed in. A logout that can fail leaves
// someone signed in on a shared machine.
export function logout(req, res) {
  clearSessionCookie(res);
  res.status(204).end();
}

export function readCurrentUser(req, res) {
  res.json({ user: req.user });
}
