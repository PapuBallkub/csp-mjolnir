import { Router } from 'express';

import {
  createGoogleCallbackHandler,
  createRegisterHandler,
  login,
  logout,
  readCurrentUser,
  startGoogleSignIn,
  verifyEmail,
} from './auth.controller.js';
import { requireAuth } from './auth.middleware.js';
import { authRateLimits, createAuthLimiters } from './rate-limit.js';

// A factory rather than a module-level Router, because the limiters below hold
// their counts in memory: built once at import time they would be shared by
// every app in the process, and a test could not give them its own numbers.
// The mailer is passed in for the same reason: a test reads what would have
// been sent, and nothing is.
//
// @param {{ configured: boolean, send: Function }} mail - How email goes out
export function createAuthRoutes(limits = authRateLimits, { mail } = {}) {
  if (!mail) throw new Error('createAuthRoutes needs a mailer: { configured, send }');
  const routes = Router();
  const limiters = createAuthLimiters(limits);

  // The limiters go first. These routes hash or compare a password with bcrypt
  // at cost 12, which is the work an unauthenticated caller can make us do for
  // free; registering also sends an email.
  routes.post('/register', limiters.register, createRegisterHandler(mail));
  routes.post('/verify-email', limiters.verify, verifyEmail);
  routes.post('/login', limiters.login, login);

  // Nothing to limit: clearing a cookie is free, and a logout that can fail
  // leaves someone signed in on a shared machine.
  routes.post('/logout', logout);

  routes.get('/google', startGoogleSignIn);
  routes.get('/google/callback', createGoogleCallbackHandler(mail));

  // What the client calls on load to find out whether its cookie is still good.
  // Left unlimited on purpose: one indexed lookup, and it runs on every page
  // load, so a limiter here would fight the app rather than an attacker.
  routes.get('/me', requireAuth, readCurrentUser);

  return routes;
}
