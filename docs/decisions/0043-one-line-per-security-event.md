# 0043 · One line per security event

Status: accepted · 2026-11-22

## Context

Nothing recorded a sign-in, a failed one, a rate-limit hit, a denied admin
request, or what an admin changed. The only log lines were:

- the error handler's `console.error(err)` for a 500, printed over many lines;
- a `console.warn` when Google sign-in failed;
- a mail send failure.

If an account was broken into, there was nothing to investigate it with. Yet
[v16-security-logging-and-error-handling.md](../security/v16-security-logging-and-error-handling.md)
described all of it as logged (ASVS V16.3.1–V16.3.3), and also described an
access log that the app never wrote.

Two facts shaped the design:

- **Every signed-out page view gets a 401.** The client asks `/api/auth/me`
  when it starts, so logging every 401 would write a line for every anonymous
  visit.
- **The host isn't decided yet.** It's Cloud Run or a VM running
  `docker compose` ([deployment-checklist.md](../deployment-checklist.md) §0),
  and only Cloud Run records every request by itself.

## Decision

**The app writes one JSON line for each security event and each unexpected
error, through one helper, `common/logging/security-log.js`. It never writes a
line per request: the host does that, where it can.**

```json
{"time":"2026-11-22T12:34:56.789Z","severity":"WARNING","message":"auth.login.failure","event":"auth.login.failure","userId":"6650…","reason":"wrong_password","emailHash":"3f9a0c…","ip":"203.0.113.7","method":"POST","path":"/api/auth/login"}
```

### What a line holds

- **When, what, from where and who** (ASVS V16.2.1):
  - `time` is ISO 8601 in UTC (V16.2.2);
  - `event`, and `severity` (`INFO`, `WARNING`; `ERROR` for a 500);
  - `ip` is `req.ip`, so it follows `TRUST_PROXY_HOPS`;
  - `method`, and `path` without the query string;
  - `userId` when the account is known.
- **Only allowlisted fields:** `userId`, `reason`, `role`, `required`,
  `limiter`, `kind`, `action`, `target`, `status`, `linked`, `detail`. Any other
  key is dropped, so a caller can't log a password, a token or a cookie by
  mistake (V16.2.5). A value must be a string (cut to 300 characters), a number,
  a boolean or an ObjectId. `detail` holds a few such values.
- **An address only as a keyed hash.** A caller passes `email`, and the line
  carries `emailHash` instead: 32 hex characters of HMAC-SHA256, normalised as
  `User.email` is.
  - The same address always gives the same hash, so failures against one
    account group together.
  - The key comes from `PASSWORD_PEPPER` through HKDF, with the label
    `gipdp:security-log:v1`, so it's independent of how the pepper hashes
    passwords.
  - Not from `JWT_SECRET`: rotating that secret is how everyone gets signed
    out, which an incident calls for, and the hashes must still match after
    it. The pepper is never rotated.
- **Never the query string,** because the Google callback's query carries the
  authorization code. It is harmless there anyway: PKCE means the code is
  useless without the verifier, which sits only in the user's cookie
  ([0005](0005-google-sign-in-links-by-verified-email.md)).
- **One line, always:** `JSON.stringify` escapes `\r`, `\n` and every control
  character, so no value can start a line of its own (V16.4.1).
- **A link to the host's request log:** on Cloud Run, when
  `GOOGLE_CLOUD_PROJECT` is set and the request has a trace id
  (`X-Cloud-Trace-Context`), the line carries
  `logging.googleapis.com/trace`, so Cloud Logging shows it under its request.
- **The helper never throws.** A log that fails must not turn a sign-in into a
  500.

### The events (V16.3.3)

The list is `SECURITY_EVENTS` in the helper. An event missing from it still
logs, as a `WARNING`, so a typo never loses a line.

| Event | Written by | Fields |
| :--- | :--- | :--- |
| `auth.login.success` / `auth.login.failure` | `login` | `userId`; on failure `emailHash` and `reason`: `unknown_account`, `no_password`, `wrong_password` or `unverified` |
| `auth.google.success` / `auth.google.failure` | Google callback | `userId`, `linked`; on failure `reason`: `no_attempt`, `no_code`, `state_mismatch`, or the check that failed, followed by Google's refusal |
| `auth.logout` | `logout` | `userId`, when a valid session came |
| `auth.register.requested` | register | `emailHash`, `kind` (`confirm`, `already-registered`) |
| `auth.email.confirmed` / `auth.email.confirm_failed` | confirm | `userId` / `reason` |
| `auth.password_reset.requested` | forgot | `emailHash`, `kind` (`reset`, `set`, `none`) |
| `auth.password_reset.completed` / `.failed` | reset | `userId` / `reason` (`link_invalid`, `policy`) |
| `auth.password.changed` / `.change_failed` | change | `userId`, `reason` (`wrong_password`, `policy`, `no_password`) |
| `auth.session.rejected` | `requireAuth` | `reason` (`invalid`, `revoked`, `account_gone`); only when a session cookie came |
| `authz.denied` | `requireRole` | `userId`, `role`, `required` |
| `ratelimit.exceeded` | both 429 handlers | `limiter` (the limit's name, e.g. `loginByEmail`), `userId`, `emailHash` for a per-address limit |
| `request.too_large` | error handler, on 413 | `status` |
| `admin.action` | every admin write | `userId` (the admin), `action` (`POST /api/admin/review/:projectId/rollback`), `target`, `status`, and the body fields the route names |
| `server.error` | error handler, on ≥ 500 | `status`, and the stack in `message`, on stderr (V16.3.4) |

- **Why a sign-in failed reaches the log, never the client.**
  `signInWithPassword` still throws one 401 for all three failures
  ([0004](0004-sessions-as-signed-cookies.md), V6.3.8). The error carries
  `reason` and `userId` beside it, and the error handler sends only `message`,
  `details` and `code`.
- **Every admin write is audited, failures included.**
  - **Where:** `admin.routes.js` registers every write through one helper,
    `write()`, which makes `auditAdminAction(picks)` the route's first handler.
    A test walks the router and fails if any non-GET route lacks it.
  - **Why the first handler and not one router-wide middleware:** only there
    are `req.params` and the route known. Express puts `req.params` back when a
    failing request leaves the router, so a router-wide hook would lose which
    record was involved on exactly the failures worth seeing.
  - **When:** the line is written when the response closes, so an action whose
    caller hung up still leaves one.
  - **What it keeps:** each route names the body fields its line may keep (the
    review `action`, the rollback `version`, the reset's `email` as a hash).
    Never extracted text or free text.
- **What isn't logged:**
  - a 401 with no cookie, which is every signed-out page view;
  - 400s, which are too common to be a signal;
  - admin reads;
  - request bodies, passwords, tokens, cookies, the Google code, and full
    addresses.

### Where lines go, per host

- **Events** go to stdout, and **errors** to stderr.
- **On Cloud Run** both are collected into Cloud Logging. The platform also
  writes its own request log, one entry per request, whatever the app does.
- **On a VM with `docker compose`,** Docker keeps both (`docker logs`). Nothing
  records every request unless a reverse proxy in front writes an access log.

## Alternatives considered

- **A logging package (pino, winston).** One JSON line needs only
  `JSON.stringify`, and AGENTS.md prefers built-ins.
- **A `securityevents` collection in MongoDB.** An admin page could query it.
  But it adds a database write to each request, raises a new retention question
  under PDPA, and can be edited by anyone who gets into the database, while
  V16.4.2 asks for logs that can't be modified.
- **A line per request in the app.** It works on every host, but on Cloud Run
  it copies the platform's log. It also adds up to a browsing history of each
  signed-in user, and the security events already cover auth and admin.
- **Plain or masked addresses.** Plain puts personal data in every failed
  sign-in line. Masked (`a***@gmail.com`) still shows the domain, and can't
  group failures, because different addresses mask alike.
- **The hash key from `JWT_SECRET`,** as the unsubscribe links do: it would
  break across exactly the rotation an incident brings.
- **Only the actions a teammate listed** (re-extract, rollback, review edit),
  each in its own handler. Covering every write is the same amount of code, and
  can't be forgotten for the next route.

## Consequences

- **To investigate an address, search for its hash.** From `server/`, with the
  production `PASSWORD_PEPPER` set:
  `node --input-type=module -e "const { emailHash } = await import('#common/logging/security-log.js'); console.log(emailHash(process.argv[1]))" someone@example.com`.
  Only someone holding the pepper can compute it, which is also the protection.
- **A new security-relevant action calls `securityEvent`,** with its event
  added to `SECURITY_EVENTS` and to the table above. **A new admin write goes
  through `write()`,** or a test fails.
- **The Google failure line changed.** It was `Google sign-in failed: …
  (<reason>)`; it's now `auth.google.failure` with the same text in `reason`.
- **`npm test` loads a silent sink first** (`test/helpers/quiet-security-log.js`),
  since a suite that signs in hundreds of times would bury its report. A test
  about the log captures it with `test/helpers/security-log.js`.
- **Every limit has a name,** its key in the feature's numbers, so a 429 line
  says which limit tripped.
- **How long lines are kept is the host's setting,** not the app's.
- **Not checked against Google's documentation:** Cloud Logging's special
  fields (`severity`, `message`, `time`, `logging.googleapis.com/trace`).
  A field it doesn't recognise stays in the line as plain data, so a wrong name
  costs only the nicer display.
- **Revisit** once the host is chosen: on a VM with no reverse proxy, a line per
  request may be worth adding after all.
