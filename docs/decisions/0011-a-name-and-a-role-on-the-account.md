# 0011 · A name and a role on the account

Status: accepted · 2026-09-28

## Context

[0004](0004-sessions-as-signed-cookies.md) shipped accounts with four fields:
`email`, `passwordHash`, `googleId`, `notificationConsent`. `toPublicUser` hands
the client the first and last of those plus an id and a timestamp. Wiring the
frontend needs two things that shape does not have.

**A name.** The app shell shows who you are. There is nothing to show. An email
address is what we have, and it is both long enough to dominate the header and
not what anyone calls themselves. The Google `profile` scope is already
requested in `createAuthorizationUrl` and everything it returns is discarded.

**A role.** The Admin link in the shell is visible to everyone, including people
who are not signed in, because there is nothing to check. `requireAuth` answers
one question — is there a valid session behind an account that still exists —
and `forbidden()` has sat in `common/errors/http-error.js` since 0004 without a
single caller.

## Decision

Two fields on `user.model.js`, neither `required`:

| Field | Type | Default |
| :--- | :--- | :--- |
| `name` | `String`, trimmed, `maxlength: 80` | `''` |
| `role` | `String`, enum `['user','admin']`, indexed | `'user'` |

`toPublicUser` returns both. `parseRegistration` requires a name at signup;
`parseCredentials` does not, and login is unchanged. `requireRole(...roles)`
joins `requireAuth` in `features/auth/auth.middleware.js`. An account becomes an
admin through `npm run role -- <email> admin` and no other way.

## Consequences

- **Neither field is `required` at the schema level, and that is deliberate.**
  `signInWithGoogle` creates accounts through `findOneAndUpdate(..., { upsert:
  true })`, where `runValidators` is off unless someone passes it. A `required`
  field on that path is enforced or not depending on an option nobody set, which
  is the same trap 0005 already accepted for `passwordHash`: the schema stopped
  guaranteeing a user has a credential, and `features/auth` guarantees it
  instead. Shape in the model, invariant in the feature.

- **Validation split into three functions, and login is the thing to protect.**
  `parseCredentials` was called by *both* `register` and `login`. A name check
  added there would have 400'd every login in the product, with a message about
  a field the login form does not have. So `collectCredentials` now holds the
  shared rules and returns its errors instead of throwing, `parseCredentials`
  throws for login, and `parseRegistration` adds the name before throwing once.
  The property being preserved is that one 400 reports every bad field rather
  than the first one reached — `auth.test.js` asserts a bad name and a bad
  password arrive together, and separately that login still works with no name
  in the body.

- **The name ceiling is in characters, the password ceiling is in bytes.** The
  72-byte limit on passwords exists because bcrypt silently truncates there.
  Nothing truncates a name, and a byte limit would stop a Thai name at about 26
  characters — a rule no one could explain to the user hitting it. A test
  registers 80 Thai characters, 240 bytes, and expects 201.

- **`toPublicUser` is now load-bearing for authorization.** `requireRole` reads
  `req.user.role`, and `req.user` is whatever `findUserById` → `toPublicUser`
  returned. Drop `role` from that shape and every admin is silently forbidden
  with nothing in the logs. `/api/auth/me` asserts the field is present.

- **Google supplies a name only for accounts it creates.** The upsert uses
  `$setOnInsert: { name }`, never `$set`. A returning user is matched by
  `googleId` and returns before the write. A link means the address already
  belongs to someone who may have typed their own name at signup, and
  overwriting that with their Google profile is not ours to do. Related: do not
  reach for an aggregation-pipeline update to backfill an empty name — Mongoose
  applies neither defaults nor timestamps on that path, so `notificationConsent`
  and `createdAt` would quietly disappear.

- **Accounts created before this change keep working, and will not match role
  queries.** Mongoose applies schema defaults when it hydrates a document, so an
  old row reads as `role: 'user'`, `name: ''` with nothing written and no
  migration needed. `find({ role: 'user' })` does not match it, because the key
  is absent from the stored document. Irrelevant today; it will bite the first
  admin feature that lists users by role. `scripts/backfill-roles.js` is a
  one-shot for that, kept in the repository after being run as the record that
  it was, rather than a boot-time migration nobody can reason about.
  `auth-role.test.js` asserts both halves.

- **An account can have no name and no way to set one.** Every Google account
  whose profile had no name, and every account predating this, reads as `''`.
  The shell falls back to the local part of the email. There is no
  `PATCH /api/auth/me`, so the person cannot fix it. That endpoint is the
  obvious follow-up and would also make the profile and notification screens
  stop pretending to save.

- **`requireRole` must be mounted *after* `requireAuth`** — the same ordering
  trap `limitByUser` already warns about — and it answers 401 rather than 403
  when nothing has authenticated, because telling an anonymous caller they are
  the wrong kind of person says more than that they are nobody.

  *Amended by 0012:* this shipped with no production caller, on the reasoning
  that the field on the model was the expensive half to retrofit and the admin
  routes could wait for FR14/FR15. That lasted one pull request.
  `GET /api/admin/operations` is now its first caller, and the reason is below.

- **Hiding the Admin link never protected `/admin`.** The page was a client
  component importing `_data/ops.ts` at module scope, so every scraper name,
  error string, document id and OCR confidence score shipped inside a public
  JavaScript chunk that anyone could fetch by URL. The role field took the link
  off the public surface and changed nothing about the data.

  The only fix for data is not to send it. The fixtures moved to
  `features/admin/`, behind `requireAuth` and `requireRole('admin')`, and the
  page fetches them. Note what this does and does not buy: the *data* is now
  genuinely private, the page's *markup* still ships and does not need to be
  secret, and the existence of `/admin` is not hidden and is not worth hiding.

  The usual alternative — a Server Component that checks the role and renders
  nothing — is unavailable here, and 0012 explains why: the session cookie is
  host-only on the API's origin, so the Next server never receives it. It would
  work in development and fail in production, which is the same trap as
  `middleware.ts`.

### Becoming an admin

A command, not a route:

```
npm run role -- someone@example.com admin
```

A platform admin is an internal maintainer — the proposal's own stakeholder
table classes the role that way — so the grant is an act someone performs
against the database, not a flow the product offers. Rejected:

- **An `ADMIN_EMAILS` environment variable.** Two sources of truth for the same
  fact, and the one `requireRole` actually reads is the other one. It also makes
  production and development disagree about who is an admin for reasons that are
  invisible in the data.
- **A bootstrap route** guarded by a setup secret. A new unauthenticated
  privilege-escalation endpoint, protected by a value living in the same env
  file as everything else, to save typing one command.
- **First user to register becomes an admin.** Silent, unrepeatable, and wrong
  the first time the database is reset.
- **A raw `mongosh` update, documented in CONTRIBUTING.** The zero-code option
  and genuinely defensible. The script wins only because it validates the role
  against the enum and prints what changed; a mistyped `mongosh` update writes
  `role: 'Admin'` and fails closed with no error anywhere.
