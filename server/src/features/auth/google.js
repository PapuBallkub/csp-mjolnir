import crypto from 'node:crypto';

import jwt from 'jsonwebtoken';

import { env, isGoogleConfigured, isProduction } from '#common/config/env.js';
import { badRequest, HttpError } from '#common/errors/http-error.js';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const OAUTH_STATE_COOKIE = 'mjolnir_oauth_state';

// Long enough to pick an account and type a password, short enough that an
// abandoned attempt cannot be resumed later.
const STATE_TTL_MS = 10 * 60 * 1000;

const stateCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  // Lax, not None: the browser comes back from Google as a top-level GET
  // navigation, which Lax allows. It never rides a cross-site POST.
  sameSite: 'lax',
  path: '/',
};

export function assertGoogleConfigured() {
  if (!isGoogleConfigured) {
    throw new HttpError(503, 'Google sign-in is not configured on this server.');
  }
}

// Random per attempt, echoed back by Google, and compared against the cookie on
// return. Without it, anyone can hand a victim a callback URL of their choosing.
export function issueState(res) {
  const state = crypto.randomBytes(32).toString('base64url');
  res.cookie(OAUTH_STATE_COOKIE, state, { ...stateCookieOptions, maxAge: STATE_TTL_MS });
  return state;
}

export function clearState(res) {
  res.clearCookie(OAUTH_STATE_COOKIE, stateCookieOptions);
}

export function createAuthorizationUrl(state) {
  const params = new URLSearchParams({
    client_id: env.google.clientId,
    // Must match a URI registered in the Google console byte for byte.
    redirect_uri: env.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    // Always show the chooser, so a shared machine does not silently sign in as
    // whoever used it last.
    prompt: 'select_account',
  });

  return `${AUTHORIZE_URL}?${params}`;
}

// Trades the one-time code for tokens and returns what we need from the profile.
export async function exchangeCodeForProfile(code) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      redirect_uri: env.google.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    throw badRequest('Google rejected the sign-in attempt.');
  }

  const { id_token: idToken } = await response.json();

  // Decoded without checking the signature. That is safe only because this
  // token came straight back from the token endpoint over TLS, so nobody could
  // have substituted it. Never decode a browser-supplied token this way.
  const claims = idToken ? jwt.decode(idToken) : null;

  if (!claims?.sub || !claims.email) {
    throw badRequest('Google returned an unusable profile.');
  }

  return {
    googleId: claims.sub,
    email: claims.email.toLowerCase(),
    emailVerified: claims.email_verified === true,
  };
}
