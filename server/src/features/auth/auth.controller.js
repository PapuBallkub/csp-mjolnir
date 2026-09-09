import { registerWithPassword, signInWithPassword } from './auth.service.js';
import { parseCredentials } from './auth.validation.js';
import { clearSessionCookie, setSessionCookie, signSessionToken } from './session.js';

// Registering signs you in. The alternative is a form that succeeds and then
// asks you to type the same two fields again, and the account is already proven
// to belong to whoever just chose the password.
export async function register(req, res) {
  const { email, password } = parseCredentials(req.body);

  const user = await registerWithPassword({
    email,
    password,
    // FR08's consent. Absent means no — an unticked box must never become a
    // subscription just because the client left the field out.
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

// Succeeds whether or not anyone was signed in. A logout that can fail is a
// logout that leaves someone signed in on a shared machine.
export function logout(req, res) {
  clearSessionCookie(res);
  res.status(204).end();
}

export function readCurrentUser(req, res) {
  res.json({ user: req.user });
}
