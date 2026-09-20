# 0009 · An `/api` prefix, without a version segment

Status: accepted · 2026-09-17

## Context

The server mounted its features at the root: `/health`, `/auth/*`, and a banner
at `/`. The question that prompted this was whether to add `/api/v1`, on the
usual reasoning that a version segment is cheap now and expensive later.

Two halves, and they are not the same decision. `/api` is about telling an API
route from a page route. `/v1` is about serving clients you cannot upgrade. Only
one of those describes this project.

The timing matters: `client/app/auth/page.tsx` is still a mockup whose submit
handler calls `preventDefault()`, so nothing calls these paths yet, and nothing
is deployed, so no redirect URI is registered anywhere but a developer's own
Google client. The cost of moving the surface will not be this low again.

## Decision

**Mount features under `/api`.** `POST /api/auth/login`, `GET /api/auth/me`, and
so on.

**No version segment.** Not `/api/v1`.

**`/health` and `/` stay outside the prefix**, at the root.

## Consequences

- **The prefix separates API endpoints from page routes.** `/profile` can serve
  the profile page while `/api/profile` returns its data, and nothing has to
  arbitrate between them.
- **The client and the API can share one origin.** Today the two are on separate
  domains, which makes every request cross-site, which is why `cors` needs
  `credentials: true` and an exact `CORS_ORIGIN`, and why §1 of the deployment
  checklist opens with a failure where sign-in returns `201` and every request
  after it is anonymous. Put them behind one hostname — `example.com/*` to Next,
  `example.com/api/*` to Express, the two still running separately — and requests
  from the client are same-origin: no CORS configuration, and the session cookie
  can use `SameSite=Lax` rather than needing `None`. That is the
  `isProduction ? 'none' : 'lax'` on `session.js:18`. **`Secure` is unaffected**
  and production cookies still need it, so this does not make `NODE_ENV` any less
  critical than §1 says it is.
- **This is an option, not a change.** Adopting `/api` does not alter the
  deployment or fix the cookie problem by itself. A shared origin is also
  reachable without a prefix, by routing on an enumerated list of mounts or by
  exclusion — but that needs a new proxy rule for every feature added, where a
  prefix is one rule that keeps working. We are buying the consistent rule now,
  not the deployment.
- **`/health` is infrastructure, not API.** An uptime monitor and the host's own
  health check probe it, and neither should have to be reconfigured when the API
  surface is reorganised. Same for the banner at `/`. `smoke.test.js` asserts
  both from the root, which is what will catch a future change that sweeps them
  under the prefix by accident.
- **`GOOGLE_REDIRECT_URI` moved** to `/api/auth/google/callback`, in
  `.env.example`, in the CI workflow, and in the checklist. Google matches the
  registered string exactly, so **every developer with a Google client must
  update the registered redirect URI in Google Cloud Console.** Nothing warns
  you: the consent screen still appears and the exchange fails afterwards.
- **`NEXT_PUBLIC_API_URL` stays an origin**, not an origin plus a prefix, and
  call sites write `/api/...` themselves. This is what makes the same-origin
  move a one-line change later: the variable becomes empty and the paths already
  work.

### Why no `/v1`

- **Versioning buys you the ability to break a client you do not control.** We
  have one client, in this repository, deployed from the same compose file, and
  every breaking change can land in the same pull request as the server change
  that caused it. There is no window in which a v1 and a v2 need to coexist.
- **The surface is about to change constantly.** FR06 search, FR07 matching,
  FR10 amendment diffs, FR11 watchlists and the FR14/FR15 admin views are all
  still unbuilt. A `/v1` that we break weekly is not a version, it is a decoration
  that makes a promise the code does not keep — and the usual ending is that
  `/v2` never ships, the breaking changes land in `/v1` anyway, and the segment
  has been lying for the life of the project.
- **Adding it later is not expensive.** The same router can be mounted at both
  `/api/x` and `/api/v1/x` during a transition, which is the whole migration.
  The cost we avoided by moving early was the redirect URI and the client call
  sites, and a version segment does not share that cost.

**What would reverse this**, written down so it is a test and not a mood: a
consumer of this API that does not ship from this repository. A partner
integration, a mobile client, or the programmatic access to price history and
amendment diffs that the watchdog and journalist audiences in the proposal would
plausibly want. On the day one of those is real, add `/api/v1`, mount the
existing routes at both paths, and supersede this record. Until then, the
absence of a version is the honest description of what we support.

**Not covered:** whether the same-origin deployment actually happens. That is
§0 of the deployment checklist, it depends on the host choice, and this decision
deliberately only buys the option.
