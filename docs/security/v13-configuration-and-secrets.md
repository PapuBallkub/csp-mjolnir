# Configuration and Secrets Management (OWASP ASVS Chapter 13)

This document specifies the system communication architecture, resource management limits, connection pooling policies, and secrets management controls for the **Government IT Procurement Discovery Platform (GIPDP / Mjölnir)**, detailing compliance with **OWASP Application Security Verification Standard (ASVS) v5.0 Chapter 13: Configuration** (Requirements V13.1 through V13.4, Reference IDs 262 to 282).

---

## 1. Executive Summary & Purpose

Secure configuration guarantees that the application runs with least privilege, exposes minimal attack surface, handles resource contention gracefully without crashing, and safeguards infrastructure credentials.

GIPDP enforces configuration security across three layers:
1. **Network & Communications**: All internal and external communications are inventoried, encrypted, and rate-regulated.
2. **Resource Boundaries**: Connection pools, request payload sizes, and scraping rates are strictly budgeted to prevent denial of service (DoS).
3. **Secrets Isolation**: Zero secrets reside in source code or client bundles; environment variables are strictly validated at system boot.

---

## 2. System Communication Architecture (ASVS V13.1.1, V13.2.6)

All external and backend communication paths are formally documented and restricted to secure channels:

```
+----------------------------------------------------------------------------------------------------+
|                                      GIPDP System Boundaries                                       |
+----------------------------------------------------------------------------------------------------+
  [User Browser]
       |
       | HTTPS (Port 443 / 3000 in dev)
       v
  [Next.js Client]
       |
       | HTTP/HTTPS (Port 5001 / Internal Bridge)
       v
  [Express API Server]
       |
       +---> [MongoDB Atlas Cluster] ------- (TLS 1.2+, Port 27017, SCRAM-SHA-256 Auth)
       |
       +---> [Google Gemini LLM API] ------- (HTTPS, Port 443, API Key via Header)
       |
       +---> [e-GP Ingestion Feeds] -------- (HTTPS, Port 443, 1000ms Paced Requests)
       |     - process3.gprocurement.go.th (RSS Feeds)
       |     - process5.gprocurement.go.th (TOR PDF Documents)
       |
       +---> [data.go.th Open Data] -------- (HTTPS, Port 443, Historical Contracts)
       |
       +---> [SMTP Mail Host] -------------- (TLS, Port 587, User/Password Auth)
```

| Service Endpoint | Protocol & Port | Authentication | Direction | Purpose |
|---|---|---|---|---|
| **MongoDB Atlas** | `mongodb+srv://` (TLS, 27017) | SCRAM-SHA-256 (`MONGO_URI`) | Outbound | Primary data storage (TORs, users, logs) |
| **Google Gemini API** | HTTPS (443) | Header `x-goog-api-key` (`GEMINI_API_KEY`) | Outbound | AI TOR information extraction & risk analysis |
| **e-GP Feeds (process3)** | HTTPS (443) | Public Government Feed | Outbound | RSS procurement notice ingestion |
| **e-GP Portal (process5)** | HTTPS (443) | Public Government Portal | Outbound | PDF document scraping |
| **data.go.th** | HTTPS (443) | Public Open Data Portal | Outbound | Agency codes & historical contract data |
| **SMTP Mail Server** | SMTP over TLS (587) | Username / Password | Outbound | Email notifications for watchlisted updates |

---

## 3. Resource Management & Connection Pooling (ASVS V13.1.2, V13.1.3)

To ensure high availability and prevent resource exhaustion under load, GIPDP implements explicit resource boundaries:

### 3.1 Database Connection Pooling (V13.1.2)

- **Configuration File**: `server/src/common/config/connect.js`
- **Mongoose Pool Settings**:
  ```javascript
  const mongooseOptions = {
    maxPoolSize: 100,             // Max concurrent socket connections
    minPoolSize: 10,              // Keep warm connections ready
    serverSelectionTimeoutMS: 5000, // Fail fast if cluster unreachable
    socketTimeoutMS: 45000,       // Abort stalled database operations
  };
  ```
- **Pool Exhaustion Behavior**: If all 100 connections are saturated, subsequent queries queue up to `serverSelectionTimeoutMS` (5 seconds). If a connection does not become available, Mongoose throws a `MongoServerSelectionError`, which the centralized Express error handler (`error-handler.js`) catches, logs server-side, and transforms into a clean HTTP 503 Service Unavailable or 500 Internal Error, avoiding unbounded memory growth or process crashes.

### 3.2 Request Pacing & Rate Limiting (V13.1.3)

1. **Government Feed Respect (NFR-03)**:
   - File: `server/src/pipeline/shared/request-pacer.js`
   - All HTTP requests to official Thai government systems (`process3.gprocurement.go.th`, `process5.gprocurement.go.th`) pass through `paceRequest()`, enforcing a mandatory **1,000ms minimum inter-request delay**. This avoids overwhelming government infrastructure or triggering defensive IP bans.
2. **JSON Request Body Size Limits**:
   - File: `server/src/app.js`
   - Express body parsing is explicitly constrained: `express.json({ limit: '50kb' })`.
   - Any attempt to transmit oversize payloads (e.g. payload exhaustion attacks) is immediately rejected with HTTP 413 `PayloadTooLargeError`.
3. **API Rate Limiting**:
   - Authentication routes (`/api/auth/*`): 50 requests per 15 minutes per IP (`rate-limit.js`).
   - Stored preview generation and expensive admin endpoints are strictly rate-limited to preserve CPU availability.
4. **HTTP Client Timeout Constraints**:
   - All Axios scrapers enforce explicit connection timeouts (`timeout: 30000`) and limit maximum HTTP redirect hops (`maxRedirects: 5`) to prevent circular redirect exhaustion.

---

## 4. Secrets Management Controls (ASVS V13.3)

1. **Zero Secrets in Source Code (V13.3.1)**:
   - Secrets are loaded exclusively via environment variables (`process.env`) from `.env` files.
   - `.env`, `.env.local`, and `.env.production` are strictly gitignored in `.gitignore`.
   - CI/CD builds verify that no `.env` files are tracked or staged (`AGENTS.md`).
2. **Strict Boot-Time Validation (`server/src/common/config/env.js`)**:
   - The application enforces **no fallback defaults** in code for sensitive values:
     - `MONGO_URI`: Required. Server refuses to boot if absent.
     - `JWT_SECRET`: Required. Server verifies length is at least 32 bytes (256 bits), throwing immediately on startup if invalid.
3. **Principle of Least Privilege (V13.3.2)**:
   - Backend secrets (`JWT_SECRET`, `MONGO_URI`, `GEMINI_API_KEY`, `EMAIL_PASS`) are isolated exclusively to `server/src`.
   - The Next.js client receives zero backend secrets. Only public configuration variables prefixed with `NEXT_PUBLIC_` reach the browser bundle.

---

## 5. Unintended Information Leakage & Hardening (ASVS V13.4)

1. **Docker Metadata Exclusion (V13.4.1)**:
   - Both `client/.dockerignore` and `server/.dockerignore` explicitly exclude `.git`, `.github`, `docs`, `tests`, and `.env` files, preventing source metadata or local secrets from leaking into container images.
2. **Debug Mode & Error Masking (V13.4.2, V13.4.6)**:
   - `server/src/common/config/env.js` derives `isProduction = process.env.NODE_ENV === 'production'`.
   - In production, `server/src/common/middleware/error-handler.js` masks all 500-level error messages as `"Internal server error"` and completely omits error stack traces from HTTP responses.
3. **Framework Fingerprint Removal (V13.4.6)**:
   - Express framework identity header is explicitly disabled in `server/src/app.js`:
     ```javascript
     app.disable('x-powered-by');
     ```
   - Automated tests in `server/test/security-headers-frontend.test.js` assert that `res.headers['x-powered-by']` is undefined.
4. **Directory Listing Prohibition (V13.4.3)**:
   - Neither Next.js nor Express mounts directory browsing middleware (e.g. `serve-index`). Static requests resolving to directories return 404 Not Found.
5. **Admin Endpoint Protection (V13.4.5)**:
   - All `/api/admin/*` routes are guarded at router level by `requireAuth` and `requireRole('admin')`, returning 401/403 to unauthorized clients.

---

## 6. OWASP ASVS Chapter 13 Traceability Matrix

| Ref ID | Req ID | Level | Requirement Summary | Status | Codebase Evidence & Verification |
|:---:|:---:|:---:|---|:---:|---|
| **262** | **V13.1.1** | L1 | All communication needs documented | **COMPLIANT** | Documented in this file (§2) and `docs/data-sources/`. All inbound/outbound services and protocols cataloged. |
| **263** | **V13.1.2** | L1 | Max concurrent connections and pooling documented | **COMPLIANT** | Documented in this file (§3.1). Mongoose pool limit (100) and timeout behavior configured in `connect.js`. |
| **264** | **V13.1.3** | L1 | Resource management strategies (rate limits, timeouts) documented | **COMPLIANT** | Documented in this file (§3.2). 1000ms pacer (`request-pacer.js`), 50kb body limit (`app.js`), auth rate limit (`rate-limit.js`). |
| **265** | **V13.1.4** | L1 | Secrets rotation schedule documented | **N/A** | Out-of-Scope: Academic capstone prototype; secrets rotated manually via environment updates (`deployment-checklist.md`). |
| **266** | **V13.2.1** | L1 | Backend communications authenticated | **COMPLIANT** | MongoDB requires SCRAM credentials; Gemini requires API key; SMTP requires credentials in `env.js`. |
| **267** | **V13.2.2** | L1 | Least necessary privileges for backend components | **COMPLIANT** | MongoDB Atlas user scoped to `mjolnir` database; container runs as unprivileged user. |
| **268** | **V13.2.3** | L1 | No default or hardcoded credentials | **COMPLIANT** | `env.js` strictly throws on startup if `MONGO_URI` or `JWT_SECRET` is missing. |
| **269** | **V13.2.4** | L1 | External resources accessed via allowlist | **COMPLIANT** | Ingestion feeds hardcoded to official Thai government domains (`process3/5.gprocurement.go.th`, `data.go.th`). |
| **270** | **V13.2.5** | L1 | External services accessed via allowlist | **COMPLIANT** | AI queries restricted to Google Gemini API host; no user-supplied outbound endpoints. |
| **271** | **V13.2.6** | L1 | Connections follow documented configuration | **COMPLIANT** | Connections adhere strictly to §2 specifications without unauthorized protocols or unmanaged ports. |
| **272** | **V13.3.1** | L1 | Secrets management solution, no secrets in source code | **COMPLIANT** | Secrets managed via gitignored `.env` variables; verified by `deployment-checklist.md`. |
| **273** | **V13.3.2** | L1 | Least privilege for secret assets | **COMPLIANT** | Server alone reads `JWT_SECRET` and `MONGO_URI`; client bundle contains zero backend secrets. |
| **274** | **V13.3.3** | L2 | Isolated security module (HSM/Vault) | **N/A** | Out-of-Scope: Enterprise hardware vault requirement disproportionate for this deployment. |
| **275** | **V13.3.4** | L2 | Secret expiration and automated rotation | **N/A** | Out-of-Scope: Secrets managed via deployment environment configuration. |
| **276** | **V13.4.1** | L1 | Deployed without `.git` or source metadata | **COMPLIANT** | `.git` explicitly excluded in both `client/.dockerignore` and `server/.dockerignore`. |
| **277** | **V13.4.2** | L1 | Debug modes disabled in production | **COMPLIANT** | `NODE_ENV=production` triggers error masking in `error-handler.js` and production CSP in Next.js. |
| **278** | **V13.4.3** | L1 | Web servers do not expose directory listings | **COMPLIANT** | No directory browsing middleware installed; directory URLs return 404. |
| **279** | **V13.4.4** | L1 | HTTP TRACE method disabled | **COMPLIANT** | Express router does not implement TRACE verb; unhandled verbs return 404. |
| **280** | **V13.4.5** | L1 | Admin & monitoring endpoints not exposed to public | **COMPLIANT** | `/api/admin/*` guarded by `requireAuth` and `requireRole('admin')`. |
| **281** | **V13.4.6** | L1 | Application does not expose detailed version info | **COMPLIANT** | `app.disable('x-powered-by')` enforced in `server/src/app.js`. Tested in `security-headers-frontend.test.js`. |
| **282** | **V13.4.7** | L1 | Web servers only serve specific file extensions | **N/A** | Out-of-Scope: Express server serves JSON API responses only; static assets handled by Next.js. |
