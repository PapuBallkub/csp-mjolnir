# Production deployment checklist

Read this before the first deploy, and again before every deploy after that. It
exists because most of what breaks in production breaks **silently** — the
server boots, `/health` says `ok`, and sign-in quietly stops working for
everybody.

Nothing is deployed yet and the host is not final, so items marked **DECIDE**
are open questions rather than instructions.

---

## 0 · Decide these before anything else

- [ ] **DECIDE — where the API runs.** Two candidates, differing on more than
      price:

  | | Cloud Run | Compute Engine VM + `docker compose` |
  | :--- | :--- | :--- |
  | Scaling | Automatic, can exceed one instance | Always one |
  | Egress IP | Dynamic, so Atlas cannot allowlist it | Static, one allowlist entry |
  | Rate limit counters | Need `--max-instances=1` to stay correct | Correct by construction |
  | Cost when idle | Scales to zero | Bills continuously |
  | You maintain | Nothing | A VM |

- [ ] **DECIDE — whether production shares the development Atlas cluster.**
      `connectDatabase()` pins `dbName` to `mjolnir` regardless of what the
      connection string says. Point production at the same cluster and
      production *is* development — same database, same documents. Use a
      separate cluster, or pass a different `dbName`.

---

## 1 · `NODE_ENV=production` — the one that silently breaks sign-in

**`server/Dockerfile` does not set it.** `client/Dockerfile` does. So a server
container deployed as-is today runs with `nodeEnv === 'development'`, and five
things change at once:

| Where | With `NODE_ENV=production` | Without it |
| :--- | :--- | :--- |
| `session.js` | `secure: true` | Session cookie sent over plain HTTP |
| `session.js` | `sameSite: 'none'` | **`'lax'` — the browser never sends the cookie cross-site, so signing in appears to succeed and every request after it is anonymous** |
| `google.js` | OAuth state cookie `secure: true` | Same exposure |
| `connect.js` | `autoIndex: false` | Rebuilds every index on every boot, against populated Atlas |
| `error-handler.js` | `"Internal server error"` | Internal error messages and paths returned to clients |

The second row is the dangerous one. A client on one domain and an API on
another is cross-site, and `SameSite=Lax` cookies are not sent cross-site at
all. Nothing errors: registration returns `201`, sets a cookie the browser then
refuses to send back, and `/api/auth/me` answers `401` forever.

- [ ] Set `NODE_ENV=production` in the deployed server environment
- [ ] Better — add `ENV NODE_ENV=production` to `server/Dockerfile` so it cannot
      be forgotten, the way `client/Dockerfile` already does

---

## 2 · Environment variables

| Variable | Production value | What breaks if it is wrong |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | See §1 |
| `MONGO_URI` | Atlas connection string | Server refuses to boot — this one fails loudly, which is correct |
| `JWT_SECRET` | A freshly generated secret, **not** the CI value in `fullstack-ci-setup.yml` and not any developer's local one | Anyone who knows the value can mint a session for any account |
| `CORS_ORIGIN` | The deployed client origin, exact, **no trailing slash** | The browser rejects every API response and the app looks completely dead |
| `PORT` | Leave unset on Cloud Run — it injects one | Container listens on the wrong port and fails its health check |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Production OAuth client | `/api/auth/google` answers 503 |
| `GOOGLE_REDIRECT_URI` | `https://<api-domain>/api/auth/google/callback` | Google refuses the code exchange |
| `TRUST_PROXY_HOPS` | The number of proxies in front of the server — see §5 | Too low: every user on the internet shares one rate limit bucket. Set to `true`: the caller forges `X-Forwarded-For` and the limiter is decorative |

- [ ] All of the above set in the host's secret manager, not baked into an image
- [ ] `JWT_SECRET` confirmed different from `ci-not-a-secret`
- [ ] Understood that rotating `JWT_SECRET` signs everyone out — fine, but do it
      knowingly

### The client's one variable behaves differently

`NEXT_PUBLIC_API_URL` is **inlined by Next.js at build time**, not read at
startup. Changing it means rebuilding and redeploying the client image — a
restart does nothing. It is passed as a build `ARG` in `client/Dockerfile` and
set in `docker-compose.yml`.

- [ ] Built with the production API origin, not `http://localhost:8000`
- [ ] Note that **no client code reads it yet** — it appears only in
      `client/Dockerfile`. The plumbing exists; nothing is connected to it. When
      the auth form is wired up, this becomes live and a wrong value at build
      time means a client that cannot reach its API.

---

## 3 · MongoDB Atlas

- [ ] **Network access.** Cloud Run's egress IP is dynamic, so it cannot be
      allowlisted by address. Either allow `0.0.0.0/0` — the cluster then
      accepts connections from anywhere, guarded only by the database password —
      or add a VPC connector plus Cloud NAT with a reserved address. A Compute
      Engine VM with a static IP avoids the choice entirely.
- [ ] A **production database user**, separate from the shared development one,
      with read/write on the production database only
- [ ] Production is **not** pointing at the development database — see §0
- [ ] Atlas M0 is 512 MB and pauses after 60 days idle. Confirm the tier is
      right before Phase 2 puts OCR'd Thai text into it.

---

## 4 · Google OAuth

- [ ] The production redirect URI is registered **verbatim** in Google Cloud
      Console, including scheme and full path
- [ ] That path is `/api/auth/google/callback`, not `/auth/google/callback` —
      the prefix landed in [0009](decisions/0009-api-prefix-without-a-version.md)
      and an entry registered before it is now wrong by one segment. Google
      matches the string exactly and fails the exchange, it does not redirect
- [ ] `GOOGLE_REDIRECT_URI` matches that entry character for character
- [ ] `CORS_ORIGIN` points at the production client, since
      `completeGoogleSignIn` redirects the browser there after the exchange

---

## 5 · If the target is Cloud Run

- [ ] **`--max-instances=1`.** Rate limit counters live in one process's memory,
      so two instances mean two independent counters and a limit that is
      silently doubled. One flag fixes it at this project's traffic.
- [ ] **`trust proxy` set to a number, never `true`.** Cloud Run puts a Google
      front end in front of the container, so `req.ip` is the proxy and every
      user in the world shares one rate limit bucket. Setting it to `true` makes
      Express take the leftmost `X-Forwarded-For` entry, which a client can
      forge. Start at `1`; use `2` if a load balancer or Cloud Armor sits in
      front.
- [ ] Verify that value against a real request rather than trusting the number
- [ ] Do not set `PORT` — Cloud Run injects it and `env.js` already reads it

---

## 6 · Known gaps — what is **not** protected yet

Do not assume these are handled just because the app works.

- [ ] **Rate limiting is in-memory and single-process.** The limiters ship
      (see [0007](decisions/0007-rate-limiting-on-the-auth-routes.md)), but
      counters live in one process's memory: two instances mean a limit of 5 is
      really 10, with no error, no log, and no failing test. Correct today —
      `docker-compose.yml` runs one container. See §5 if the target autoscales.
- [ ] **Password spraying is not mitigated.** One common password against many
      accounts: each account sees a single failure, so the email limiter never
      trips, and a botnet spreads thin enough that no address does either. The
      honest fix is password strength and breach lists, not rate limiting — do
      not let a green limiter suggest otherwise.
- [ ] **`/api/auth/google/callback` is unlimited**, and does a token exchange
      against Google for an anonymous caller. Deliberate, per 0007.
- [ ] **Sessions cannot be revoked** before they expire, seven days out.
      Deleting an account works; changing a password does not sign out other
      browsers.
- [ ] **No password reset and no email verification.** A locked-out user has no
      self-service recovery. Both belong with FR08.
- [ ] **Registration reveals whether an address already has an account**,
      because the form has to say so for the person who genuinely forgot.
- [ ] **The client is not wired to the API yet** — `client/app/auth/page.tsx` is
      still a mockup whose submit handler only calls `preventDefault()`.

---

## 7 · Verify after deploying

A checklist you cannot check is a wish list. Run these against the deployed API.

- [ ] `GET /health` returns `status: ok` and `database.state: connected`
- [ ] `GET /no-such-route` returns JSON, not an HTML error page
- [ ] A 500 returns `"Internal server error"` rather than a stack trace or file
      path — the cheapest proof that `NODE_ENV` actually took effect
- [ ] Register from the **deployed client**, in a real browser, then reload the
      page. Still signed in means the cookie survived the round trip; signed out
      means §1 is wrong.
- [ ] Inspect the `mjolnir_session` cookie in devtools — `Secure` and
      `SameSite=None` must both be present
- [ ] Sign in with Google end to end, since the redirect URI, `CORS_ORIGIN`, and
      the state cookie all have to agree before it works
- [ ] Fail the same login repeatedly and confirm the 429 arrives at the
      configured attempt, from a machine that is not on the same network as
      another tester
