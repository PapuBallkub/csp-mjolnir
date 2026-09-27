# 0012 · How the browser holds a session

Status: accepted · 2026-09-28

## Context

The client had never called the API. `client/app/auth/page.tsx` was a mockup
whose submit handler was `preventDefault()`, the Google button had no handler,
and `ProfileContext` — seeded with `demoProfile`, a fictional freelancer with
six skills and three saved projects — was standing in for a session.

**What accounts are for here, in order.** First, **data lifespan**: a watchlist,
a set of skills and a notification preference are worthless if they vanish when
the tab closes, and FR08 cannot email anyone it does not know. Second,
**identity** — the product needs to say who you are and stop showing you someone
else's data. Third, **privacy**, which a signed-up user can reasonably expect
and which the terms and policy work will address separately. Fourth, and
furthest out, **better matching**: FR07 gets sharper the longer a profile has
been kept and refined.

Restriction is not on that list, and this decision is deliberately not an
access-control system. The only genuine authorization is the admin role from
[0011](0011-a-name-and-a-role-on-the-account.md). Where a page is
signed-in-only, that is the SRS describing which interfaces belong to which
user type, not a security boundary.

## Decision

The browser calls the API **directly, cross-origin**, with
`credentials: "include"`, through a single module. Session state comes from
`GET /api/auth/me` on mount and from nowhere else. Route guards are
client-side, and are a courtesy, not a boundary.

## Consequences

- **Direct cross-origin, not a proxy.** `client/app/_lib/api.ts` is the only
  file that calls `fetch`. Rejected, and worth recording because each is the
  idiomatic Next answer someone will propose: a `next.config` rewrite, Route
  Handlers, and Server Actions all put the Next server in the middle, so
  `Set-Cookie` lands on it rather than on the browser and we end up building a
  session-forwarding backend-for-frontend. That is a real architecture; it is
  not this one, and adopting it by accident while reaching for a familiar API
  would be the worst way to arrive at it.

- **`CORS_ORIGIN`, `SameSite`, `Secure` and therefore `NODE_ENV` are all now
  load-bearing.** In development `localhost:3000` to `localhost:8000` is
  *same-site* — a port is not part of a site — so the `Lax` cookie is sent and
  everything works with no configuration. Production is a different host, needs
  `SameSite=None; Secure`, and therefore needs HTTPS on both sides. This makes
  §1 of `docs/deployment-checklist.md` the most consequential page in the repo.
  One trap for anyone debugging locally: `127.0.0.1:3000` to `localhost:8000`
  *is* cross-site, and the cookie is dropped in silence.

- **`NEXT_PUBLIC_API_URL` is an origin and nothing more**, with call sites
  writing `/api/...` themselves, which is what 0009 requires and what makes a
  future same-origin deployment a matter of emptying one variable. It is
  inlined at build time, so a wrong value ships inside the image and no restart
  will fix it. `client/.env.example` is now tracked, because with the variable
  unset the client calls itself and every request 404s with no useful error.

- **Failures are values, not exceptions.** `ApiResult<T>` is a discriminated
  union, so `strict` forces every call site to handle the error case — which is
  what §7 of AGENTS.md asks for in practice rather than in principle. Four
  cases each cost a bug if missed, and each has a test: `credentials` on every
  request, `content-type` only when there is a body (a GET would take a CORS
  preflight for nothing, and per 0004 the JSON-only body parser is the whole
  CSRF story), a 204 that has no body to parse, and a server that never
  answered — `fetch` rejects with a `TypeError`, which becomes `status: 0` and
  a sentence rather than a blank screen.

- **Three states, and the first render is always `loading`.** Not a nullable
  user: `loading` is a real answer and a different one from `anonymous`, and
  collapsing them flashes "Sign in" at a signed-in person on every page load.
  Starting at `loading` also means the server prerender and the first client
  render produce identical markup, so there is no hydration mismatch and
  nothing new needs `suppressHydrationWarning`. The shell's placeholder is
  fixed-size — same height, fixed width — so resolving it moves nothing.

- **`/me` is the only session probe, and Google leaves no other signal.** A
  successful Google callback redirects to the client with no parameter at all,
  so there is nothing to read; only `/me` can confirm it. A *failed* one
  arrives as `?auth=failed` and now renders a dismissible strip on the landing
  page. Before this, a failed Google sign-in was completely silent: the browser
  reappeared on the marketing page, apparently signed out, with no explanation.
  The reason stays in the server log by design (0005) and cannot be recovered
  here.

- **`?next=` is validated before anything navigates to it.** `router.replace()`
  will follow an absolute URL, so an unchecked parameter makes
  `/auth?next=https://evil.com` a working open redirect on the one page where a
  password is about to be typed. `_lib/safe-next.ts` is the only function in the
  client with a security consequence, which is why it is separate and has the
  most test cases; `/auth` is a server component purely so the value is
  validated before it reaches any client code.

- **Client-side guards are UX, not security, and `middleware.ts` must never be
  used for this.** Three reasons, in order of finality. In production the API
  is a different host and `mjolnir_session` is set with no `Domain`, so it is
  host-only and never sent to the client host — `request.cookies.get()` is
  permanently `undefined`. In development it *would* be readable, which makes
  this worse rather than better: a middleware guard would pass every local test
  and fail silently in production, exactly the shape of failure §1 of the
  checklist is about. And verifying the token at all would need `JWT_SECRET`
  inside the Next process — a second copy of the signing key, in a second
  deployment unit, for a redirect. The real boundary is `requireAuth` on the
  API.

- **The guarded routes are a route group, not three checks.**
  `app/(app)/(private)/` holds profile, watchlist and notifications, so the rule
  is visible in the file tree and the fourth private page someone adds is
  covered without anyone remembering. URLs are unchanged. A guest gets an inline
  prompt with per-route copy rather than a redirect: a redirect cannot fire
  until `/me` answers, so it arrives after the chrome has painted — a flash and
  then a navigation — and Back from the form lands on the page that bounces
  again. Keeping the URL also means a shared link to `/watchlist` still means
  `/watchlist` once you are in.

- **Only identity was made real. The profile was deliberately left fictional.**
  Name, email, role and the FR08 consent flag now come from the account on
  `/profile` and `/notifications`, and are read-only because there is no
  `PATCH /api/auth/me` to change them. Skills, budget, scope sizes, the
  watchlist and every match score remain fixtures in memory, and a reload still
  resets them. That is not an oversight: the profile's shape is downstream of
  TOR processing (FR05, FR07), which is unbuilt, so anything built against it
  now would be rewritten. The identity fields were separated out because they
  do not depend on that shape and were actively making false statements — the
  header said your name while the page beside it showed someone else's address.

- **Two false claims were deleted rather than wired.** `/notifications` carried
  a green **"Verified"** badge next to a hard-coded address; nothing in this
  system verifies an email, and the checklist says so. Its consent switch was
  seeded `true` regardless of what the account said. The notification bell's
  unread dot was permanent, shown to every visitor including signed-out ones,
  with no notification backend behind it.

- **Server error messages are English, in a bilingual UI.** Every `details`
  string and every rate-limit message reaches a Thai-reading user in English.
  Known cost, accepted for now. The fix is a stable `code` alongside each
  message that the client maps to bilingual copy; doing it properly is a
  follow-up, and faking it with client-side duplication of the server's rules
  would drift the first time either side changed.

- **The client has tests, and still three dependencies.** Node 24 strips
  TypeScript natively, so `node --test` runs `safe-next` and the API error
  shaping with no framework, no jsdom and no config file. Anything under test
  has to stay free of JSX and of path aliases, neither of which type-stripping
  resolves — which is also why `_lib/` exists and is kept React-free.

### Still fixtures, and what will change them

| Surface | Today | Becomes real with |
| :--- | :--- | :--- |
| Name, email, role, FR08 consent | the account | done |
| Skills, budget, scope, SME flag | `demoProfile`, in memory | FR07, after TOR processing |
| Watchlist | `demoProfile`, in memory | FR11 |
| Match scores and the `/search` match tab | computed client-side from the above | FR07 |
| `/admin` | `_data/ops.ts` | FR14/FR15, behind `requireRole` |

A guest currently sees `demoProfile` in the match tab, which is wrong but
harmless while none of it is anyone's data. It is listed here rather than
quietly left, and it goes away when FR07 gives the profile a real shape.
