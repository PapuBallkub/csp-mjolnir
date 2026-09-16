# 0007 · Rate limiting on the auth routes

Status: accepted · 2026-09-15

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
