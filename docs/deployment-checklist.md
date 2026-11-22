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
- [x] **RESOLVED — how long a session lasts.** Aligned with SRS NFR-11:
      `SESSION_TTL_HOURS = 24` in `server/src/features/auth/session.js`. In
      addition, token versioning (`tokenVersion` on `User`) allows immediate
      server-side revocation upon logout.

---

## 1 · `NODE_ENV=production` — the one that silently breaks sign-in

**`server/Dockerfile` sets it**, as `client/Dockerfile` does, so the image runs
as production unless something overrides it. Compose's `environment:` and
`env_file:`, and a host's own variables, all win over the image:
`docker-compose.override.yml` uses that to set `development` back for the local
stack. A deploy that sets `NODE_ENV` to anything else, or a `server/.env` with a
`NODE_ENV=development` line, runs as development, and seven things change at
once:

| Where | With `NODE_ENV=production` | Without it |
| :--- | :--- | :--- |
| `session.js` | `secure: true` | Session cookie sent over plain HTTP |
| `session.js` | `sameSite: 'none'` | **`'lax'` — the browser never sends the cookie cross-site, so signing in appears to succeed and every request after it is anonymous** |
| `google.js` | OAuth state cookie `secure: true` | Same exposure |
| `connect.js` | `autoIndex: false` | Rebuilds every index on every boot, against populated Atlas |
| `error-handler.js` | `"Internal server error"` | Internal error messages and paths returned to clients |
| `app.js` | `Strict-Transport-Security` sent | No HSTS: a browser will try plain HTTP again |
| `env.js` | Pilot mode off unless `SHOW_UNREVIEWED_INSIGHTS=true` | Pilot mode on: unreviewed AI summaries and demo data are public (§2) |

The second row is the dangerous one. A client on one domain and an API on
another is cross-site, and `SameSite=Lax` cookies are not sent cross-site at
all. Nothing errors: registration returns `201`, sets a cookie the browser then
refuses to send back, and `/api/auth/me` answers `401` forever.

- [x] **RESOLVED — the image sets it.** `server/Dockerfile` has
      `ENV NODE_ENV=production` (2026-11-21), the way `client/Dockerfile` does,
      so forgetting it fails safe.
- [ ] Nothing in the deployed server's environment sets `NODE_ENV` to anything
      but `production`

---

## 2 · Environment variables

| Variable | Production value | What breaks if it is wrong |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | See §1 |
| `MONGO_URI` | Atlas connection string | Server refuses to boot — this one fails loudly, which is correct |
| `JWT_SECRET` | A freshly generated secret of at least 32 bytes (`node -e "console.log(crypto.randomUUID() + crypto.randomUUID())"` gives 72 characters), **not** the CI value in `fullstack-ci-setup.yml` and not any developer's local one | Under 32 bytes: the server refuses to boot. Known to anyone else: they can mint a session for any account |
| `PASSWORD_PEPPER` | Generated once for production, at least 32 bytes (`node -e "console.log(crypto.randomBytes(32).toString('base64'))"` gives 44 characters), **not** the CI value and not any developer's local one. Back it up next to `MONGO_URI`, and never rotate it ([0039](decisions/0039-passwords-are-peppered-before-bcrypt.md)) | Missing or under 32 bytes: the server and the pipeline refuse to start. Lost or changed: every password account stops working; Google sign-in doesn't |
| `CORS_ORIGIN` | The deployed client origin, exact, **no trailing slash** | The browser rejects every API response and the app looks completely dead |
| `PORT` | Leave unset on Cloud Run — it injects one | Container listens on the wrong port and fails its health check |
| `GOOGLE_CLIENT_ID` / `_SECRET` | Production OAuth client | Unset: `/api/auth/google` answers 503. Another client's ID: every Google sign-in fails, because the ID token's `aud` must be this value ([0005](decisions/0005-google-sign-in-links-by-verified-email.md)) |
| `GOOGLE_REDIRECT_URI` | `https://<api-domain>/api/auth/google/callback` | Google refuses the code exchange |
| `SHOW_UNREVIEWED_INSIGHTS` | `true` only for a demo deploy, while no one reviews results yet ([0015](decisions/0015-pilot-mode-and-demo-data.md)). Leave it unset for a real launch. | Unset in production: the catalog shows only reviewed results, so before reviews start it is empty. `true` on a real launch: unchecked AI summaries reach the public with no label saying nobody checked them, only the detail page's "AI can be wrong" notice |
| `TRUST_PROXY_HOPS` | The number of proxies in front of the server — see §5 | Too low: every user on the internet shares one rate limit bucket. Set to `true`: the caller forges `X-Forwarded-For` and the limiter is decorative |
| `CLAMD_HOST` | `clamav`, which `docker-compose.yml` already sets; or the address of your ClamAV daemon ([0040](decisions/0040-files-are-scanned-before-they-are-kept.md)) | Unset in production: the pipeline downloads nothing, the admin page's add and re-download buttons refuse, and the server still boots. Set, but ClamAV is down: the same, with "did not answer" in the log. Never published to the internet: clamd's port has no password |
| `SMTP_USER` / `SMTP_PASS` (and `SMTP_HOST`, `SMTP_PORT`) | The mail account the platform sends from | Unset: password sign-up answers 503 "use Google", because an address can't be confirmed without mail ([0041](decisions/0041-an-address-is-confirmed-before-the-account-exists.md)); Google sign-in and everything else still work. Wrong: the 202 still arrives, but no confirm email does, and only the server log says why |
| `EMAIL_FROM` | A sender on a domain you own, which your mail account may send as | Unset, it falls back to an address on `gipdp.go.th`, a government domain this platform isn't: mail reads as the government's, and SPF checks fail, so it lands in spam |

- [ ] All of the above set in the host's secret manager, not baked into an image
- [ ] `JWT_SECRET` confirmed different from the CI value
      (`ci-not-a-secret-ci-not-a-secret-ci`)
- [ ] `PASSWORD_PEPPER` confirmed different from the CI value
      (`ci-not-a-pepper-ci-not-a-pepper-ci`), and backed up where `MONGO_URI` is.
      Unlike `JWT_SECRET`, it is never rotated: every password hash depends on it
- [ ] Understood that rotating `JWT_SECRET` signs everyone out, and breaks every
      unsubscribe link already emailed, since that key is derived from it — fine,
      but do it knowingly

### The client's two variables behave differently

`NEXT_PUBLIC_API_URL` is **inlined by Next.js at build time**, not read at
startup. Changing it means rebuilding and redeploying the client image — a
restart does nothing. It is passed as a build `ARG` in `client/Dockerfile` and
set in `docker-compose.yml`.

`API_INTERNAL_URL` is the API's address **from the client's server**: the
TOR detail page fetches on the server, not in the browser. It is read at
runtime. Unset, the server uses `NEXT_PUBLIC_API_URL`, which is right whenever
that address also works from the client's host. In `docker compose` it does
not, because `localhost` inside the client container is the client itself, so
compose sets it to `http://server:8000`.

- [ ] Built with the production API origin, not `http://localhost:8000`
- [ ] `API_INTERNAL_URL` unset, or set to an address the client's server can
      reach. Wrong, every TOR detail page shows "couldn't load this posting"
      while the catalog, which fetches from the browser, still works
- [ ] `NEXT_PUBLIC_API_URL` built in correctly: `client/app/_lib/api.ts` reads
      it for every call the browser makes. Wrong, sign-in, the catalog, the
      watchlist and the admin pages all fail. TOR detail pages still render,
      because they fetch on the server, but their buttons fail.

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
- [ ] `GOOGLE_CLIENT_ID` is the **same client** the redirect URI is registered
      on. The ID token is checked against it (`aud`), so a token for any other
      client is refused and sign-in lands on `/?auth=failed` with
      `(audience)` in the server log
- [ ] The server can make outbound HTTPS requests to `oauth2.googleapis.com`
      (the code exchange) **and** `www.googleapis.com` (Google's signing keys,
      `/oauth2/v3/certs`). An egress rule that allows only the first shows up
      as `(keys-unavailable)` in the log. Password sign-in is unaffected
- [ ] Expect a sign-in that was mid-way during the deploy to fail once: the
      attempt cookie changed shape (it now holds `state`, `nonce` and the PKCE
      verifier). The next try works

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
- [ ] **A volume for `/app/data`.** A Cloud Run container's own disk is lost
      when it restarts, so stored documents would vanish with it. See §8

---

## 6 · Known gaps — what is **not** protected yet

Do not assume these are handled just because the app works.

- [ ] **Rate limiting is in-memory and single-process.** The limiters ship
      (see [0007](decisions/0007-rate-limiting-on-the-auth-routes.md)) on sign-in
      and registration, the PDF preview, technology requests and four costly
      admin actions, but counters live in one process's memory: two instances
      mean a limit of 5 is really 10, with no error, no log, and no failing test.
      Correct today — `docker-compose.yml` runs one container. See §5 if the
      target autoscales.
- [ ] **Password spraying is not mitigated.** One common password against many
      accounts: each account sees a single failure, so the email limiter never
      trips, and a botnet spreads thin enough that no address does either. The
      honest fix is password strength and breach lists, not rate limiting — do
      not let a green limiter suggest otherwise.
- [ ] **`/api/auth/google/callback` is unlimited**, and does a token exchange
      against Google for an anonymous caller. Deliberate, per 0007.
- [x] **Session revocation is enforced via Token Versioning.** When a user logs
      out, `tokenVersion` increments in the database, invalidating the session
      token immediately.
- [ ] **No password reset.** A locked-out user has no self-service recovery.
      Email verification exists since 0041, and reset can reuse its tokens.
- [x] **Registration no longer reveals whether an address has an account.** It
      answers the same 202 for every address, and the owner of a taken one gets
      an email instead of a link (0041).

---

## 7 · Verify after deploying

A checklist you cannot check is a wish list. Run these against the deployed API.

- [ ] `GET /health` returns `status: ok` and `database.state: connected`
- [ ] `GET /no-such-route` returns JSON, not an HTML error page
- [ ] A 500 returns `"Internal server error"` rather than a stack trace or file
      path — the cheapest proof that `NODE_ENV` actually took effect
- [ ] `http://` on a client page redirects to `https://`, and `http://` on the
      API does **not**: `/api/*` over plain HTTP is refused or fails, never
      redirected (ASVS V4.1.2). A client that calls `http://` by mistake has
      already sent its request, a password included, in clear; a redirect would
      hide that mistake instead of breaking it. The API never redirects by
      itself, so this is the proxy's or host's setting
- [ ] Register from the **deployed client**, in a real browser, with an address
      you can read. The confirm email ("ยืนยันอีเมลเพื่อเริ่มใช้ GIPDP") arrives
      from `EMAIL_FROM`, not in spam; its link opens `/auth/verify` on the
      client, and the password you chose signs you in. Reload the page: still
      signed in means the cookie survived the round trip; signed out means §1 is
      wrong. No email at all: check the SMTP rows in §2 and the server log
- [ ] Register again with the same address: the same "check your inbox" answer,
      and an email saying someone tried, with no link
- [ ] Inspect the `mjolnir_session` cookie in devtools — `Secure` and
      `SameSite=None` must both be present
- [ ] Sign in with Google end to end, since the redirect URI, `CORS_ORIGIN`,
      the client ID, the attempt cookie and the key fetch all have to agree
      before it works. A failure prints `Google sign-in failed: … (<reason>)`
      in the server log; the reason says which one. When Google refused the
      code, its own error follows, as in
      `(token-endpoint: invalid_client "…")` for a wrong client secret, or
      `(token-endpoint: invalid_grant "…")` for a used or expired code
- [ ] Fail the same login repeatedly and confirm the 429 arrives at the
      configured attempt, from a machine that is not on the same network as
      another tester
- [ ] `npm run ingest:scan -- --self-test` inside the server container
      (`docker compose exec server npm run ingest:scan -- --self-test`) ends with
      "scanning works". It touches no database, so it's safe here
- [ ] Open a TOR's document from its detail page. Right after the first deploy
      with scanning, it shows the "เอกสารนี้ยังตรวจความปลอดภัยไม่เสร็จ" card
      until the rescan in §8 has run. After that, the PDF shows, or, on a new
      volume the pipeline hasn't filled yet, the "ยังไม่มีสำเนาเอกสารนี้ในระบบของเรา"
      card with its e-GP button. A server log full of `[preview] … missing or
      outside the documents folder` warnings means records point at files this
      server doesn't have (§8)

---

## 8 · Stored documents

The PDF preview serves only files the pipeline stored, and never calls e-GP
([0038](decisions/0038-preview-serves-stored-files-only.md)). So the files
have to outlive the container.

- [ ] **`/app/data` is on storage that survives a new container.**
      `docker-compose.yml` mounts the `server-data` named volume there. The
      development override binds `./server/data` instead.
- [ ] **The image carries no documents.** `server/.dockerignore` keeps `data/`
      out. Without that, `COPY . .` put the builder's whole folder into the image
      (5.4 GB on one laptop), and Docker would copy it into the empty volume on
      first start.
- [ ] **Expect a new volume to start empty.** Until the pipeline downloads
      again, every preview answers `DOCUMENT_NOT_STORED`. Downloading is a
      pipeline command that calls e-GP, so run it on purpose
      ([pipeline-guide.md](pipeline-guide.md)).
- [ ] **Records written on another machine.** A database filled from a laptop
      records that laptop's paths. The server finds the same file under its own
      documents folder by the part after `documents`, so this works as long as
      the files themselves were copied too.
- [ ] **ClamAV runs next to the server,** with 4 GB of memory to spare
      (ClamAV asks for 3 at least). Start the whole stack with
      `docker compose -f docker-compose.yml --profile scan up -d`; the
      `clamav` service is behind that profile, so a plain `up` leaves it out.
      Its first start downloads signatures into the `clamav-db` volume and
      takes a few minutes; its health check says when it's ready
      ([0040](decisions/0040-files-are-scanned-before-they-are-kept.md)).
- [ ] **Scan what is already stored, right after the deploy that brings
      scanning.** Every file stored before it has no scan result, so no preview
      shows until `docker compose exec server npm run ingest:scan` has run once.
      It writes results and deletes any file ClamAV flags, so run it on purpose.
