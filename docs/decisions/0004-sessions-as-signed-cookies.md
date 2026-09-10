# 0004 · Sessions as signed cookies, not server-side records

Status: accepted · 2026-09-10

## Context

US4 wants an account made with an email and a password. US5 wants the same
account reachable through Google. Neither is useful on its own — the point of an
account is FR08's alert and FR11's watchlist, which both need the API to know
who is asking on every request after the one where you typed your password.

So this branch has to answer two questions that the Google branch will inherit
rather than revisit: what a session *is*, and where the browser keeps it.

**What a session is.** A `sessions` collection makes revocation trivial — delete
the row and the session is gone — at the cost of a database read on every
authenticated request and a collection somebody has to expire. A signed token
carries its own expiry and needs no storage, but stays valid until it expires
because there is nothing to delete.

**Where the browser keeps it.** A token in `localStorage` is readable by any
script that runs on the page, so one XSS anywhere in the Next app — a dependency,
a `dangerouslySetInnerHTML`, a bad paste — hands over every session it can reach.
A cookie marked `HttpOnly` is not reachable from JavaScript at all, but is sent
automatically, which is the mechanism CSRF is built on.

Neither question has a free answer. Both have a defensible one for a 13-week
project with three people and no security reviewer.

## Decision

A session is a **JWT signed with `JWT_SECRET`**, carrying nothing but the user
id, expiring after **7 days**, delivered in an **`HttpOnly` cookie** named
`mjolnir_session`.

`JWT_SECRET` is required at boot, exactly like `MONGO_URI`. It is per-developer
rather than shared, so a mismatch costs you your own local sessions and nothing
else.

Three things follow from it that are worth stating outright, because they are
what make the choice safe rather than merely convenient:

1. **`requireAuth` loads the user on every request** instead of trusting the
   token's claims. That is one indexed lookup, and it buys back most of what
   statelessness gave away: a deleted account stops working immediately, and
   consent is read as it is now, not as it was seven days ago.
2. **CSRF is held off by the API accepting nothing but JSON.** A cross-site HTML
   form can only send `x-www-form-urlencoded`, `multipart`, or `text/plain`, and
   `express.json()` parses none of them, so a forged form post arrives with an
   empty body and fails validation. Anything that *can* set
   `content-type: application/json` triggers a CORS preflight first, and the
   preflight is answered for one named origin. This is why there is no CSRF
   token — and why **adding `express.urlencoded()` would quietly remove the
   protection**.
3. **The cookie is `SameSite=Lax` in development and `None` in production.**
   Client and API differ only by port locally, which is same-site; split across
   Vercel and a separate API host they are cross-site, where nothing but `None`
   is sent at all. `None` also requires `Secure`, which is why it is tied to
   `NODE_ENV` rather than set outright.

## Consequences

- The Google branch writes a callback and a strategy, not a session design. It
  calls the same `signSessionToken` and gets the same cookie, and `requireAuth`
  cannot tell the two sign-in paths apart — which is the point.
- **A session cannot be revoked before it expires.** Deleting the account works;
  changing a password does not sign out the other browsers. Nothing in FR01–FR15
  needs that today. When it does, the cheap fix is a `tokenVersion` on the user,
  compared in `requireAuth` — which we can afford precisely because that function
  already reads the user.
- **Signing up leaks whether an address has an account**, because the form has to
  say "that email already has an account" for the person who genuinely forgot.
  Signing in gives one message for a wrong password and a missing account, but
  that only narrows the leak, it does not close it. Closing it takes the
  verify-by-email flow, which arrives with FR08's mailer.
- **There is no rate limiting yet.** Bcrypt at cost 12 makes each guess expensive
  for us as well as the attacker, so the login route is a plausible way to burn
  the API's CPU. This should not reach production without a limiter on
  `/auth/login` and `/auth/register`.
- Password reset is not implemented, and the mockup's "Forgot password" link goes
  nowhere. It needs to send mail, so it belongs with FR08 rather than here.
- `JWT_SECRET` is now a third thing a new contributor has to set, and rotating it
  signs everybody out. Both are cheap; a signing key with a development fallback
  is not, because the fallback is what ends up in production.
