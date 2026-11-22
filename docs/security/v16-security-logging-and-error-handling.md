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

GIPDP partitions logging into three functional layers based on audience and operational scope:

```
+----------------------------------------------------------------------------------------------------+
|                                    Logging Architecture Layers                                     |
+----------------------------------------------------------------------------------------------------+

  [Layer 1: Pipeline & Scraper Ingestion Logs]
    - Storage: MongoDB Atlas `ingestionlogs` collection
    - Schema: `timestamp`, `phase`, `step`, `projectId`, `status`, `error`
    - Audience: Platform Administrators via `/admin/operations` and `/api/admin/pipeline/tasks`

  [Layer 2: Web Server Application & Operational Logs]
    - Storage: Container runtime standard output (`stdout` / `stderr`)
    - Captured by: Docker daemon / Google Cloud Run Logging
    - Schema: Structured JSON access logs with ISO 8601 UTC timestamps

  [Layer 3: Security & Authorization Events]
    - Interceptor: Centralized Express Error Handler (`error-handler.js`)
    - Events: 401 Unauthorized, 403 Forbidden, 413 Payload Too Large, 429 Rate Limit Exceeded
```

| Logging Layer | Storage Destination | Logged Fields & Metadata | Access Control |
|---|---|---|---|
| **Pipeline & Ingestion** | MongoDB `ingestionlogs` collection | `timestamp` (ISO UTC), `phase` (screen/extract/benchmarks), `step`, `projectId`, `durationMs`, `error` | Restricted to administrators via `/api/admin` (`requireRole('admin')`). |
| **Server Access & Operational** | Container `stdout` / `stderr` | Request method, path, HTTP status, response time, remote IP (via trust proxy) | Infrastructure operators via container management console. |
| **Security Events & Failures** | Console `stderr` + MongoDB logs | Timestamp, event type, route, client IP, error code, sanitized diagnostic message | Server process memory and admin console. |

---

## 3. Log Protection & Data Sanitization (ASVS V16.2.5, V16.4.1)

1. **Strict Exclusion of Sensitive Data (V16.2.5)**:
   - Passwords, user password hashes, `JWT_SECRET`, session tokens, and Gemini API keys are **strictly excluded** from all log messages.
   - Authentication logs record only the target email address and outcome (success/failure); raw credentials or request bodies are never logged.
2. **Log Injection Prevention (V16.4.1)**:
   - Log messages avoid unescaped user-controlled string concatenation.
   - Container output uses structured JSON serialization, preventing carriage return (`\r`) or line feed (`\n`) CRLF log splitting attacks.
3. **Log Access Control (V16.4.2)**:
   - Database ingestion logs are accessible solely to authenticated administrators. The admin routes sit behind `requireAuth, requireRole('admin')` at the router level ([ADR 0011](../decisions/0011-a-name-and-a-role-on-the-account.md)).

---

## 4. Security Event Monitoring (ASVS V16.3)

GIPDP explicitly captures key security events to facilitate monitoring and threat detection:

1. **Authentication Operations (V16.3.1)**:
   - Successful logins, failed credential submissions (401), registration events, and explicit logout terminations are recorded.
2. **Authorization Violations (V16.3.2)**:
   - Attempts by standard users to access administrative routes (`/api/admin/*`) or modify other users' capability profiles trigger logged 403 Forbidden events.
3. **Rate Limit & Abuse Triggers (V16.3.3)**:
   - Rapid-fire authentication requests that exceed the rate limit (50 req/15min) trigger logged 429 Too Many Requests events with the offending IP address.
   - Excessive request body sizes trigger HTTP 413 `PayloadTooLargeError` logs.
4. **Pipeline & System Failures (V16.3.4)**:
   - Scraper network timeouts, e-GP feed malformations, or Gemini API rate limit throttles are recorded in `pipelinefailures` for operational review and automated retry.

---

## 5. Error Handling & Fail-Secure Design (ASVS V16.5)

### 5.1 Production Error Masking (V16.5.1)

In development, detailed error stacks facilitate rapid debugging. In production, however, exposing database queries or internal stack traces aids attacker reconnaissance:
- **Implementation**: `server/src/common/middleware/error-handler.js`
  ```javascript
  export function errorHandler(err, req, res, _next) {
    const isProduction = env.nodeEnv === 'production';
    const status = err.status || 500;
    
    // Mask internal error messages in production
    const message = (isProduction && status >= 500)
      ? 'Internal server error'
      : err.message || 'Something went wrong';
      
    // Log full diagnostic trace server-side only
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.url} Error:`, err);
    
    res.status(status).json({
      error: message,
      ...(err.details && { details: err.details })
    });
  }
  ```
- **Result**: Attackers receive only `{ "error": "Internal server error" }`. Database schema details and internal file paths are completely suppressed.
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
| **317** | **V16.1.1** | L1 | Logging inventory documented across application layers | **COMPLIANT** | Documented in this file (§2). Pipeline ingestion logs (`ingestionlogs`), stdout/stderr access logs, and security event logs. |
| **318** | **V16.2.1** | L1 | Log entries include necessary metadata (timestamp, user, context) | **COMPLIANT** | Logs include ISO 8601 UTC timestamp, request method, route, remote IP, and structured error context. |
| **319** | **V16.2.2** | L1 | Time sources synchronized, UTC ISO timestamps | **COMPLIANT** | All log entries and MongoDB timestamps use `new Date().toISOString()` (UTC standard). |
| **320** | **V16.2.3** | L1 | Logs stored only to documented files and services | **COMPLIANT** | Logs written exclusively to container stdout/stderr and MongoDB `ingestionlogs` collection. |
| **321** | **V16.2.4** | L1 | Logs can be read and correlated by log processor | **COMPLIANT** | Structured JSON logging format facilitates correlation and ingestion by Cloud Logging / Datadog. |
| **322** | **V16.2.5** | L1 | Sensitive data excluded from logs | **COMPLIANT** | Passwords, password hashes, JWT secrets, session tokens, and Gemini keys are never logged. One development-only exception ([ADR 0041](../decisions/0041-an-address-is-confirmed-before-the-account-exists.md)): with no SMTP configured, the server prints the confirm or reset link ([ADR 0042](../decisions/0042-passwords-can-be-changed-reset-and-checked.md)), with its one-time token, so a developer can sign up or reset a password; the address is masked, and production never prints it. A failed send is logged without the token. |
| **323** | **V16.3.1** | L1 | All authentication operations logged (success and failure) | **COMPLIANT** | Login successes, failed credential rejections (401), registration, and logout events are recorded. |
| **324** | **V16.3.2** | L1 | Failed authorization attempts logged | **COMPLIANT** | 403 Forbidden rejections captured and logged by `errorHandler`. |
| **325** | **V16.3.3** | L1 | Security events defined in documentation are logged | **COMPLIANT** | Rate limit trips (429), payload size rejections (413), and validation errors (400) are logged. |
| **326** | **V16.3.4** | L1 | Unexpected errors and security control failures logged | **COMPLIANT** | `errorHandler` in `server/src/common/middleware/error-handler.js` logs all 500+ errors (`console.error`). |
| **327** | **V16.4.1** | L1 | Logging components encode data to prevent log injection | **COMPLIANT** | Structured JSON formatting prevents CRLF log splitting and newline injection. |
| **328** | **V16.4.2** | L1 | Logs protected from unauthorized access and modification | **COMPLIANT** | Ingestion logs in MongoDB protected by `requireAuth, requireRole('admin')`. Container logs protected by Cloud IAM. |
| **329** | **V16.4.3** | L2 | Logs securely transmitted to separate system | **N/A** | Out-of-Scope: Prototype environment uses local Docker / Cloud Run logging streams. |
| **330** | **V16.5.1** | L1 | Generic error message returned in production | **COMPLIANT** | `error-handler.js` returns `"Internal server error"` for an unexpected error when `status >= 500 && isProduction`. Since [ADR 0041](../decisions/0041-an-address-is-confirmed-before-the-account-exists.md), an `HttpError` keeps its own message, because it is one written for users (e.g. the 503 "sign up with Google" when mail isn't configured); it never carries internals. |
| **331** | **V16.5.2** | L1 | Graceful degradation when external resource fails | **COMPLIANT** | External feed or Gemini API outages do not crash web server; pre-cached TOR data remains available. |
| **332** | **V16.5.3** | L1 | Fail-secure design (fails closed) | **COMPLIANT** | Unauthenticated requests fail closed (401); unverified TOR summaries fail closed into review queue (NFR-17). |
| **333** | **V16.5.4** | L1 | Last resort error handler catches all unhandled exceptions | **COMPLIANT** | Express 5 4-parameter error handler middleware captures all synchronous errors and rejected promises. |
