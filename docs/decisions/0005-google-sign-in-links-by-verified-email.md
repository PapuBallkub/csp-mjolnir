# 0005 · Google sign-in links to one account, keyed by a verified email

Status: accepted · 2026-09-10

## Context

US5 wants Google as a way in. [0004](0004-sessions-as-signed-cookies.md) already
decided what a session is, and deliberately made it provider-agnostic — so this
is not a second authentication system, it is a second door into the same one.
`requireAuth` cannot tell the two apart, which is the point.

That leaves three choices this branch actually has to make.

**What a Google identity is on the user.** A single `googleId` field is obvious
and cheap. A general `identities: [{ provider, subject }]` array is what we would
want at three providers, since three sparse unique indexes and a growing `$or`
is not a shape anyone enjoys.

**What happens when a Google address already has a password account.** Creating a
second account gives one person two identities and splits their watchlist. Linking
gives them one account reachable two ways — but linking on an address Google has
not verified would let anyone who can get Google to *claim* an address take over
the account already using it. That is account takeover, not a convenience.

**Whether Google config is required to boot.** `MONGO_URI` and `JWT_SECRET` are
required because nothing works without them. Google is not in that category: the
server, and email/password sign-in, work perfectly without it.

## Decision

**A `googleId` field, sparse and unique.** Not `identities[]`. At three users and
one provider, the general shape is cost against a maybe; migrating one field into
an array later is an afternoon, and we will know by then whether GitHub is real.

**Link on a verified address, refuse on an unverified one.** If Google reports
`email_verified`, a sign-in for an address that already has an account links to
it. If it does not, the attempt is refused outright — including for a brand new
account, because an address we cannot trust is not an identity.

**The `googleId` is the identity; the address is not.** A returning user is found
by `googleId` first, so changing their Google email does not strand them or
silently move their account.

**Google config stays optional.** The two routes answer 503 when it is missing,
and everything else is unaffected. Requiring it would stop CI and every teammate
who has not made a client.

**No new dependency.** The code exchange is `fetch`, and the ID token is read with
the `jsonwebtoken` we already have.

## Consequences

- **`passwordHash` is now optional on the model**, since a Google-only account has
  none. The schema no longer guarantees that a user has any credential at all —
  `features/auth` does. That is the same shape of honesty as 0003's third
  consequence: the boundary is documented and reviewed, not enforced by the file.
- The ID token is decoded **without verifying its signature**. That is sound only
  because it comes straight back from Google's token endpoint over TLS, where
  nobody could have substituted it. A token arriving from a browser must never be
  read this way, which is why the decode lives in `google.js` and not in
  `session.js` next to the verifying one.
- **No Google token is stored and no offline access is requested.** Google is
  asked who this is, once; our own cookie takes over from there. There is no
  refresh token to leak, expire, or rebuild a flow around.
- A user with an unverified Google address cannot sign in at all, not even to
  create a fresh account. Deliberate, and it costs us the small number of people
  whose Google account is in that state.
- **Password reset, when FR08 brings a mailer, has to handle an account with no
  password.** Offering to set one is the obvious answer, but it is a decision that
  branch has to make rather than inherit.
- `/auth/login` still has no rate limit, and this adds no new brute-force surface
  — Google does that work now — but the note in 0004 stands.
- The callback redirects to the client on failure rather than returning JSON,
  because it runs as a top-level browser navigation. The reason goes to the server
  log; the URL gets only `?auth=failed`. If the client ever needs to distinguish
  causes, that is where to add it.
