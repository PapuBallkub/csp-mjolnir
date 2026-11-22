# Security Logging and Error Handling (OWASP ASVS Chapter 16)

This document specifies the logging inventory, security event monitoring, log sanitization rules, and fail-secure error handling architecture for the **Government IT Procurement Discovery Platform (GIPDP / Mjölnir)**, detailing compliance with **OWASP Application Security Verification Standard (ASVS) v5.0 Chapter 16: Security Logging and Error Handling** (Requirements V16.1 through V16.5, Reference IDs 317 to 333).

---

## 1. Executive Summary & Purpose

A resilient web platform must record significant operational and security events to maintain accountability, detect anomalies, and support incident response, while ensuring that error conditions fail safely without leaking implementation details.

GIPDP enforces logging and error handling across two pillars:
1. **Multi-Layer Logging Architecture**: Dedicated logging across background scraping pipelines, HTTP application routes, and security boundaries.
2. **Fail-Secure Error Handling**: Centralized Express error interceptors guarantee graceful degradation, mask internal diagnostic traces in production, and prevent unhandled promise crashes.

---

## 2. Multi-Layer Logging Inventory (ASVS V16.1.1, V16.2.1, V16.2.3)

GIPDP logs in three layers. The application writes the first two. Request (access) logs come from the host, not the application ([ADR 0043](../decisions/0043-one-line-per-security-event.md)). The host isn't chosen yet: Cloud Run, or a VM running `docker compose` ([deployment checklist](../deployment-checklist.md) §0). So the third layer is described for each.

```
+----------------------------------------------------------------------------------------------------+
|                                    Logging Architecture Layers                                     |
+----------------------------------------------------------------------------------------------------+

  [Layer 1: Pipeline & Scraper Ingestion Logs]
    - Storage: MongoDB Atlas `ingestionlogs` collection
    - Schema: `timestamp`, `phase`, `step`, `projectId`, `status`, `error`
    - Audience: Platform Administrators via `/admin/operations` and `/api/admin/pipeline/tasks`

  [Layer 2: Security Events & Unexpected Errors]  (the application)
    - Writer: server/src/common/logging/security-log.js
    - Destination: stdout (events) and stderr (errors), one JSON line each
    - Fields: time (ISO 8601 UTC), severity, event, ip, method, path, userId, emailHash, reason, ...

  [Layer 3: Request (Access) Logs]  (the host)
    - Cloud Run: the platform's own request log, one entry per request
    - VM + docker compose: a reverse proxy's access log, if one is in front; otherwise none
```

| Logging Layer | Storage Destination | Logged Fields & Metadata | Access Control |
|---|---|---|---|
| **Pipeline & Ingestion** | MongoDB `ingestionlogs` collection | `timestamp` (ISO UTC), `phase` (screen/extract/benchmarks), `step`, `projectId`, `durationMs`, `error` | Restricted to administrators via `/api/admin` (`requireRole('admin')`). |
| **Security Events & Unexpected Errors** | Container stdout (events) and stderr (`server.error`). Collected by Cloud Logging on Cloud Run, or by Docker (`docker logs`) on a VM | `time`, `severity`, `event`, `ip`, `method`, `path` (never the query string), `userId`, `emailHash` (a keyed hash, never the address), `reason`, and each event's own fields (§4). On Cloud Run, a trace id that links the line to its request | Cloud Run: Cloud Logging, by IAM role. VM: whoever can run `docker logs` on the machine |
| **Request (Access) Logs** | The host's own log | Cloud Run: method, URL, status, latency, client IP, user agent | Cloud Run: Cloud Logging, by IAM role. VM: the reverse proxy's files, if there is one |

---

## 3. Log Protection & Data Sanitization (ASVS V16.2.5, V16.4.1)

1. **Strict Exclusion of Sensitive Data (V16.2.5)**:
   - Passwords, password hashes, `JWT_SECRET`, `PASSWORD_PEPPER`, session tokens, cookies and API keys are never logged. The helper writes only an allowlisted set of fields, so a value passed by mistake is dropped.
   - An address is logged only as `emailHash`, a keyed HMAC-SHA256 whose key is derived from `PASSWORD_PEPPER`. Failures against one account group together, but the log never holds the address. Request bodies and query strings are never logged; the Google callback's query carries the authorization code.
2. **Log Injection Prevention (V16.4.1)**:
   - Every line is the output of one `JSON.stringify`, which escapes carriage returns (`\r`), line feeds (`\n`) and other control characters, so no value can split a line or forge another. Tests send a line break through a log reason and through Google's refusal.
3. **Log Access Control (V16.4.2)**:
   - Database ingestion logs are accessible solely to authenticated administrators. The admin routes sit behind `requireAuth, requireRole('admin')` at the router level ([ADR 0011](../decisions/0011-a-name-and-a-role-on-the-account.md)).
   - Security event lines live in the host's log: in Cloud Logging, by IAM role, on Cloud Run; on the machine itself, on a VM. The application can write lines, but can't edit or delete them.

---

## 4. Security Event Monitoring (ASVS V16.3)

GIPDP defines its security events in one list, `SECURITY_EVENTS` in `server/src/common/logging/security-log.js`. [ADR 0043](../decisions/0043-one-line-per-security-event.md) gives every event's fields.

1. **Authentication Operations (V16.3.1)**:
   - Every sign-in, success and failure, with how and why:
     - password (`auth.login.*`, with the reason `unknown_account`, `no_password`, `wrong_password` or `unverified`; the client still gets one answer for all of them);
     - Google (`auth.google.*`).
   - Logout, registration, confirming an address, and password reset and change, each with its outcome.
   - A session cookie that fails (`auth.session.rejected`: `invalid`, `revoked` or `account_gone`). A request with no cookie at all isn't logged, since every signed-out page view asks `/api/auth/me`.
2. **Authorization Violations (V16.3.2)**:
   - `authz.denied` when a signed-in account asks for a route its role doesn't allow (the admin routes).
   - Every admin write is logged as `admin.action`, failures included: the admin, the route, the record and the result.
   - There is no "another user's profile" to deny: profile routes find the record by `req.user.id`.
3. **Rate Limit & Abuse Triggers (V16.3.3)**:
   - `ratelimit.exceeded` names the limit that tripped, with the caller's IP, and the account or the address's hash where the limit is per account or per address.
   - The limits: login is 30 per 15 minutes per IP and 5 failures per 15 minutes per address. Registration, confirmation, forgot, reset, password change and the admin actions each have their own ([ADR 0007](../decisions/0007-rate-limiting-on-the-auth-routes.md)).
   - `request.too_large` for a body over the 50 kb limit (HTTP 413).
   - 400 validation errors aren't logged: they're too common to be a signal.
4. **Pipeline & System Failures (V16.3.4)**:
   - Every 500 and above is a `server.error` line on stderr, with its stack.
   - Scraper network timeouts, e-GP feed malformations, or Gemini API rate limit throttles are recorded in `pipelinefailures` for operational review and automated retry.

---

## 5. Error Handling & Fail-Secure Design (ASVS V16.5)

### 5.1 Production Error Masking (V16.5.1)

In development, detailed error stacks facilitate rapid debugging. In production, however, exposing database queries or internal stack traces aids attacker reconnaissance:
- **Implementation**: `server/src/common/middleware/error-handler.js`
  ```javascript
  export function errorHandler(err, req, res, next) {
    const status = /* the HttpError's status, or err.status / err.statusCode, else 500 */;

    // The full error, stack included, goes to the server's log only (V16.3.4)
    if (status >= 500) {
      logServerError(req, err, status);
    } else if (status === 413) {
      securityEvent(req, 'request.too_large', { status });
    }

    // Only an unexpected error is hidden: an HttpError's message was written for people
    const hidden = status >= 500 && isProduction && !(err instanceof HttpError);

    res.status(status).json({
      error: {
        message: hidden ? 'Internal server error' : err.message,
        ...(err.details ? { details: err.details } : {}),
        ...(err instanceof HttpError && typeof err.code === 'string' ? { code: err.code } : {}),
      },
    });
  }
  ```
- **Result**: Attackers receive only `{ "error": { "message": "Internal server error" } }`. Database schema details and internal file paths are completely suppressed.
- **Messages written for users still show** ([ADR 0041](../decisions/0041-an-address-is-confirmed-before-the-account-exists.md)): an `HttpError` with a 5xx status, such as the 503 telling someone to sign up with Google while mail isn't configured, keeps its message in production. Only errors the code didn't expect are masked.

### 5.2 Graceful Degradation (V16.5.2)

If external upstream services (e-GP portals or the Google Gemini API) experience outages or connectivity failures:
- The REST API continues serving all previously ingested, stored TOR notices and summaries from MongoDB without disruption.
- Background scraper jobs record the failure, apply exponential backoff, and retry during the next scheduled polling cycle without bringing down the web application.

### 5.3 Fail-Secure Defaults (V16.5.3)

- **Authentication & Authorization**: Endpoints default to denying access; missing or invalid tokens fail closed with 401 Unauthorized.
- **AI Extraction Confidence Gate (NFR-17)**: Extracted TOR summaries with an OCR/LLM confidence score below 80% fail closed into the administrative review queue (`/admin/review/[id]`), remaining hidden from the public discovery catalog until approved by an administrator.

### 5.4 Last-Resort Error Handler (V16.5.4)

In Express 5, all unhandled synchronous exceptions and asynchronous promise rejections route automatically to the 4-parameter error middleware (`(err, req, res, next)`). This guarantees that an unexpected runtime exception in any route handler will be cleanly caught, logged, and answered with an HTTP 500 response without crashing the Node.js process.

---

## 6. OWASP ASVS Chapter 16 Traceability Matrix

| Ref ID | Req ID | Level | Requirement Summary | Status | Codebase Evidence & Verification |
|:---:|:---:|:---:|---|:---:|---|
| **317** | **V16.1.1** | L2 | Logging inventory documented across application layers | **COMPLIANT** | This file (§2): what each layer logs, in what format, where it goes on each host, and who can read it. The events are listed in §4 and [ADR 0043](../decisions/0043-one-line-per-security-event.md). |
| **318** | **V16.2.1** | L2 | Log entries include necessary metadata (timestamp, user, context) | **COMPLIANT** | Every security line has `time`, `event`, `ip`, `method`, `path`, and `userId` or `emailHash` (`security-log.js`; `test/security-log.test.js`, `test/security-events.test.js`). |
| **319** | **V16.2.2** | L2 | Time sources synchronized, UTC ISO timestamps | **COMPLIANT** | `time` is `new Date().toISOString()`, in UTC, as are MongoDB's timestamps. The host's clock is the time source. |
| **320** | **V16.2.3** | L2 | Logs stored only to documented files and services | **COMPLIANT** | Security events to stdout, errors to stderr, and pipeline logs to MongoDB `ingestionlogs` and `pipelinefailures`; nothing else (§2). |
| **321** | **V16.2.4** | L2 | Logs can be read and correlated by log processor | **COMPLIANT** | One JSON object per line. On Cloud Run, Cloud Logging reads it, takes `severity`, and links a line to its request by `logging.googleapis.com/trace` when `GOOGLE_CLOUD_PROJECT` is set. |
| **322** | **V16.2.5** | L2 | Sensitive data excluded from logs | **COMPLIANT** | Passwords, password hashes, JWT secrets, session tokens, cookies and Gemini keys are never logged: the helper writes only allowlisted fields, and an address only as a keyed hash (§3). One development-only exception ([ADR 0041](../decisions/0041-an-address-is-confirmed-before-the-account-exists.md)): with no SMTP configured, the server prints the confirm or reset link ([ADR 0042](../decisions/0042-passwords-can-be-changed-reset-and-checked.md)), with its one-time token, so a developer can sign up or reset a password; the address is masked, and production never prints it. A failed send is logged without the token. |
| **323** | **V16.3.1** | L2 | All authentication operations logged (success and failure) | **COMPLIANT** | Every sign-in path, success and failure, with its method and reason. Also registration, confirmation, password reset and change, logout, and a session cookie that fails (§4; `test/security-events.test.js`). |
| **324** | **V16.3.2** | L2 | Failed authorization attempts logged | **COMPLIANT** | `requireRole` logs `authz.denied`. Every admin write is logged as `admin.action`, failures included, and a test fails if a write route lacks it. The L3 part (logging every authorization decision) is out of scope. |
| **325** | **V16.3.3** | L2 | Security events defined in documentation are logged | **COMPLIANT** | The events in §4 are the list in code (`SECURITY_EVENTS`): rate-limit trips (429), with the limit's name, and oversized bodies (413). 400s are not logged (§4). |
| **326** | **V16.3.4** | L2 | Unexpected errors and security control failures logged | **COMPLIANT** | `errorHandler` logs every 500 and above as one `server.error` line on stderr, with its stack (`test/error-handler.test.js`). A failed Google sign-in is an `auth.google.failure` line with the failed check. |
| **327** | **V16.4.1** | L2 | Logging components encode data to prevent log injection | **COMPLIANT** | Every line is `JSON.stringify` output, so `\r` and `\n` are escaped. Tests send a line break through a log reason and through Google's refusal. |
| **328** | **V16.4.2** | L2 | Logs protected from unauthorized access and modification | **COMPLIANT** | Ingestion logs in MongoDB sit behind `requireAuth, requireRole('admin')`. Security lines live in the host's log (Cloud Logging, by IAM, on Cloud Run; the machine, on a VM), which the application can't edit. |
| **329** | **V16.4.3** | L2 | Logs securely transmitted to separate system | **N/A** | Out-of-Scope: Prototype environment uses local Docker / Cloud Run logging streams. |
| **330** | **V16.5.1** | L2 | Generic error message returned in production | **COMPLIANT** | `error-handler.js` returns `"Internal server error"` for an unexpected error when `status >= 500 && isProduction`. Since [ADR 0041](../decisions/0041-an-address-is-confirmed-before-the-account-exists.md), an `HttpError` keeps its own message, because it is one written for users (e.g. the 503 "sign up with Google" when mail isn't configured); it never carries internals. |
| **331** | **V16.5.2** | L2 | Graceful degradation when external resource fails | **COMPLIANT** | External feed or Gemini API outages do not crash web server; pre-cached TOR data remains available. |
| **332** | **V16.5.3** | L2 | Fail-secure design (fails closed) | **COMPLIANT** | Unauthenticated requests fail closed (401); unverified TOR summaries fail closed into review queue (NFR-17). |
| **333** | **V16.5.4** | L3 | Last resort error handler catches all unhandled exceptions | **COMPLIANT** | Express 5 4-parameter error handler middleware captures all synchronous errors and rejected promises. |
