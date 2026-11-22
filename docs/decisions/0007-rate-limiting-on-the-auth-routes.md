# 0007 · Rate limiting on the auth routes

Status: accepted · 2026-09-15 · updated 2026-11-21 (limits on the preview,
technology requests and costly admin actions)

## Context

[0004](0004-sessions-as-signed-cookies.md) shipped email and password sign-in
and booked this as the debt it was leaving behind:

> **There is no rate limiting yet.** Bcrypt at cost 12 makes each guess
> expensive for us as well as the attacker, so the login route is a plausible
> way to burn the API's CPU. This should not reach production without a limiter
> on `/auth/login` and `/auth/register`.

Two problems, one mechanism. **Guessing**: nothing caps how many passwords can
be tried against an account. **CPU**: `bcryptjs` is a pure-JavaScript
implementation with no native bindings, so it cannot hand work to libuv's thread
pool — every hash at cost 12 runs on the one main thread, roughly 200–400ms
apiece, serialised. An attacker converting that into a denial of service costs
them a POST.

## Decision

Three limiters, built from a shared factory in
`common/middleware/rate-limit.js`, with the policies in `features/auth/`.

| Limiter | Route | Key | Window | Limit | Counts |
| :--- | :--- | :--- | ---: | ---: | :--- |
| `loginByIp` | `POST /auth/login` | address | 15 min | 30 | every request |
| `loginByEmail` | `POST /auth/login` | normalised email | 15 min | 5 | failures only |
| `registerByIp` | `POST /auth/register` | address | 1 hour | 10 | every request |

**Both login limiters, because neither covers the other.** The address one
protects our CPU, so it has to count successful logins too — they cost the same
bcrypt. The email one protects a single account from an attacker spread across
a botnet, where no individual address ever looks busy, and skips successes so
that someone who types their password correctly never spends budget.

**The counting mechanism lives in `common/`, the numbers live in the feature.**
`requireAuth` sits in `features/auth/` because it has to know how a session is
signed. A limiter knows nothing about what it guards — it needs an address, a
window, and a count — so by rule three of
[0003](0003-feature-based-server-layout.md) it is not the feature's. The factory
exports `limitByIp` and `limitByUser`; anything behind `requireAuth` should use
the second, because an account key follows a person between networks and does
not punish an entire office for one of them.

**`createApp()` takes the limits.** The suite drives the real routes, so it
spends real budget. Without injection, either the tests have to fit inside the
production numbers or the production numbers get sized around the tests — and
the register limit was already being set to 20/hour to accommodate nine test
signups, which is a security control tuned for test convenience.

**`TRUST_PROXY_HOPS`, defaulting to 0.** Express cannot know a caller's real
address unless it is told how many proxies sit in front. The default is correct
for a local run and for `docker compose`.

## Consequences

- **The value of `TRUST_PROXY_HOPS` is now a deployment-critical setting that
  lives outside this repository.** Too low behind a proxy and every user on the
  internet shares one bucket, so the first burst locks out the world. Set to
  `true` and Express believes the leftmost `X-Forwarded-For` entry, which the
  caller writes, so anyone can mint a fresh budget and the limiter becomes
  decorative. It must be a count, and it is recorded in
  `docs/deployment-checklist.md` rather than only here.
- **Counters live in one process's memory, and that is silently wrong for two.**
  Each process keeps its own count, so two instances mean a limit of 5 is really
  10, with no error, no log, and no failing test. This is correct today —
  `docker-compose.yml` runs one container — and the mitigation if the API is
  ever deployed to something that autoscales is one flag (`--max-instances=1`)
  or one swapped `store`, which is why `store` is passed through the factory
  rather than left to the default. It is not worth Redis on a 13-week project.
- **What this does not stop is password spraying**: one common password tried
  against a hundred thousand accounts. Each account sees a single failure, so
  the email limiter never trips, and a botnet spreads thin enough that no
  address does either. The honest mitigation is password strength and breach
  lists, not rate limiting, and we should not let a green limiter suggest
  otherwise.
- **The email limiter does not become an enumeration oracle**, because
  `signInWithPassword` returns the same 401 for a missing account and a wrong
  password, so an address that was never registered burns budget identically to
  one that was. A future "no such account" fast path would quietly break that,
  and there is a test asserting it.
- **A locked-out user's only recovery is waiting**, since password reset does not
  exist yet — it needs a mailer and arrives with FR08. That is why the email
  window is 15 minutes rather than an hour.
- `authRoutes` is now `createAuthRoutes(limits)`. Anything holding a
  module-level limiter would be shared by every app in the process, which is the
  same reason `createApp` exists.
- **Not covered, deliberately:** `/auth/google/callback`, which does an
  unlimited token exchange against Google for an anonymous caller; FR06 search;
  and the FR12/FR13 aggregations if they end up computed per request rather than
  at ingest. `/health` and `/auth/me` are left unlimited on purpose — limiting
  the first means an uptime monitor eventually reports an outage that is not
  one, and the second runs on every page load.

## Update · 2026-11-21: limits beyond auth

Three more limiters, on the routes where one caller could cost us or someone
else the most (ASVS V2.4.1). These are the documented limits ASVS V2.1.3 and
V2.3.2 ask for.

| Limiter | Routes | Key | Window | Limit | Why |
| :--- | :--- | :--- | ---: | ---: | :--- |
| `preview` | `GET /api/tors/:projectId/preview` and `/pdf` | address | 10 min | 60 | Anyone can open a preview, so the address is all there is. A reader opens up to three documents per TOR, and a lab or a mobile network puts many readers behind one address, so it stops a script, not a person |
| `technologyRequest` | `POST /api/technologies/request` | account | 1 day | 20 | Each request lands in the admins' review queue |
| `adminCostly` | `POST /api/admin/review/:projectId/re-extract`, `/ingest`, `/health-check`, `/pipeline/retry-all` | account | 1 hour | 10 | Caps what a forged request can set off while the session cookie is still `SameSite=None`: a fetch and a health check call e-GP, a retry-all re-queues every failed TOR, a re-extract takes a summary off the public site |

- **Every request counts**, including 404s and 400s, as a script's would.
- **`/preview` and `/pdf` share one budget.** They're one handler under two
  names, so `tor.routes.js` builds one limiter and mounts it on both. Two
  instances would each keep their own count.
- **The four admin actions share one budget**, for the same reason: one
  limiter on four routes. Reading the dashboard is never limited, as before.
- **`limitByUser` is now used.** It keys on `req.user.id`, so it must come
  after `requireAuth`. Mounted before, it throws rather than leave the route
  unlimited.
- **Each feature sets its own numbers** (`rate-limit.js` beside its routes),
  as `authRateLimits` does. `app.js` gathers them into one `apiRateLimits`
  object, and `createApp({ apiRateLimits })` merges a test's overrides over it,
  so a test names only the limit it's about. The three routers became
  factories (`createTorRoutes`, `createTechnologyRoutes`,
  `createAdminRoutes`), for the same reason `authRoutes` did.
- **The numbers are a starting point**, chosen without real traffic. Revisit
  them once there is some: 429s aren't logged yet, which is the logging
  chapter's work.
- The consequences above still hold: the counters are per process, and
  `TRUST_PROXY_HOPS` decides what "address" means behind a proxy.
- **Still not covered:** `POST /api/admin/pipeline/add` and a retry with
  `runNow` also run pipeline steps against e-GP, through the pacer, but sit
  outside `adminCostly`.

Why the preview needed a limit even after it stopped calling e-GP:
[0038](0038-preview-serves-stored-files-only.md).

## Update · 2026-11-22: two limits for confirming an address

[0041](0041-an-address-is-confirmed-before-the-account-exists.md) made
registering send an email, and added a route that compares a password.

| Limiter | Route | Key | Window | Limit | Counts |
| :--- | :--- | :--- | ---: | ---: | :--- |
| `registerByEmail` | `POST /auth/register` | normalised email | 1 hour | 3 | every request |
| `verifyByIp` | `POST /auth/verify-email` | address | 15 min | 30 | every request |

- **`registerByEmail` protects an inbox,** not an account: each registration
  emails the address typed, so without it anyone could flood a stranger's
  inbox with confirm links. It counts every request, for every address alike,
  whether it has an account or not, so a 429 says nothing about who is
  registered. It runs after `registerByIp`, which still caps mass sign-up.
- **`verifyByIp`** is login's budget, because each try is a bcrypt compare.
  Wrong passwords are also capped per link: the fifth spends it.
- **`createAuthLimiters` merges a test's numbers over the defaults,** so a test
  names only the limits it's about, as `apiRateLimits` already did.

## Update · 2026-11-22: four limits for password reset and change

[0042](0042-passwords-can-be-changed-reset-and-checked.md) added two routes
that send email and two that compare or set a password.

| Limiter | Route | Key | Window | Limit | Counts |
| :--- | :--- | :--- | ---: | ---: | :--- |
| `forgotByIp` | `POST /auth/forgot-password` | address | 1 hour | 10 | every request |
| `forgotByEmail` | `POST /auth/forgot-password` | normalised email | 1 hour | 3 | every request |
| `resetByIp` | `POST /auth/reset-password` | address | 15 min | 30 | every request |
| `passwordChangeByUser` | `POST /auth/password` | account | 1 hour | 10 | every request |

- **`forgotByEmail` protects an inbox,** as `registerByEmail` does. It counts
  every address alike, so a 429 says nothing about who has an account.
- **`passwordChangeByUser` is per account,** because the route is behind
  `requireAuth`; each try is a bcrypt compare.
- **The admin route** (`POST /api/admin/users/password-reset`) shares
  `adminCostly`, since it sends email.
- **The login lockout stays at 15 minutes.** A locked-out user can now reset
  their password, so "waiting is the only way out" above no longer holds. A
  longer window would also make a malicious lockout last longer, so it stays.
