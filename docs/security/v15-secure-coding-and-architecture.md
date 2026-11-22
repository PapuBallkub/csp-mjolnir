# Secure Coding and Architecture (OWASP ASVS Chapter 15)

This document specifies the software bill of materials (SBOM), vulnerability remediation timeframes, asynchronous workload decoupling, and defensive coding standards for the **Government IT Procurement Discovery Platform (GIPDP / Mjölnir)**, detailing compliance with **OWASP Application Security Verification Standard (ASVS) v5.0 Chapter 15: Secure Coding and Architecture** (Requirements V15.1 through V15.4, Reference IDs 296 to 316).

---

## 1. Executive Summary & Purpose

Secure software engineering requires defensive programming at the implementation level and sound architectural decoupling at the system level. 

GIPDP enforces secure coding and architecture across three areas:
1. **Supply Chain & Vulnerability Governance**: Automated tracking of dependencies, cryptographic SBOM integrity, and defined vulnerability patching windows.
2. **Workload Decoupling & Availability (ADR 0013, 0030)**: CPU-intensive OCR and AI inference operations are decoupled from user-facing HTTP request threads to prevent denial of service.
3. **Defensive Coding Standards**: Mass-assignment protection, ReDoS defense, proxy header integrity, and atomic state updates.

---

## 2. Vulnerability Remediation & Supply Chain Management (ASVS V15.1.1, V15.1.2, V15.2.1)

### 2.1 Risk-Based Vulnerability Remediation Schedule (V15.1.1)

All third-party dependencies and framework components are actively monitored for security advisories. When a vulnerability is identified via GitHub Dependabot or `npm audit`, remediation follows strict timeframes:

| Vulnerability Severity | CVSS Score Range | Maximum Remediation Timeframe | Action Required |
|---|:---:|:---:|---|
| **Critical** | 9.0 – 10.0 | **Within 7 calendar days** | Immediate patch release or dependency replacement; bypass standard release cycle. |
| **High** | 7.0 – 8.9 | **Within 14 calendar days** | Update dependency, execute automated regression tests, and deploy to production. |
| **Medium** | 4.0 – 6.9 | **Within 30 calendar days** | Scheduled dependency update during standard bi-weekly sprint maintenance. |
| **Low** | 0.1 – 3.9 | **Next Scheduled Release** | Routine dependency hygiene review during quarterly maintenance. |

### 2.2 Software Bill of Materials (SBOM) & Inventory Catalog (V15.1.2)

- **Dependency Inventory**: Maintained declaratively in root, `client/package.json`, and `server/package.json`.
- **Cryptographic Hash Locking**: Every package installation is pinned with exact versions and subresource integrity hashes (SHA-512) in `package-lock.json`. CI builds enforce clean installations (`npm ci`) to guarantee deterministic builds and protect against upstream dependency tampering.
- **Dependency Hygiene Rule (`AGENTS.md`)**: No package is added from memory. Every package must be verified (`npm view <name>`: repository, maintainers, downloads), Node.js standard built-ins are preferred over external libraries, and justifications must be stated in pull requests.

### 2.3 Automated Security Scanning in CI/CD Pipeline (V15.2.1, Grading Criteria #14 & #15)

The CI/CD pipeline enforces three automated security verification layers:
1. **Dependency Vulnerability Audit (SCA):** Automated `npm audit --omit=dev --audit-level=high` runs in `.github/workflows/fullstack-ci-setup.yml` on both `client` and `server` for every push and PR.
2. **Static Application Security Testing (SAST):** Automated **GitHub CodeQL** analysis (`github/codeql-action/init@v3` & `analyze@v3`) scans JavaScript and TypeScript across the entire codebase on every push and PR, uploading findings directly to the GitHub Security Code Scanning tab.
3. **Dynamic Application Security Testing (DAST):** Automated **OWASP ZAP Baseline Scan** (`.github/workflows/dast-zap.yml`) tests the live full-stack application (MongoDB + Express API + Next.js frontend) on-demand and on a weekly schedule. Detailed in [DAST Guide](./dast-zap-guide.md).

---

## 3. Architecture Decoupling & Availability Defenses (ASVS V15.1.3, V15.2.2)

### 3.1 Heavy Workload Decoupling (ADR 0013, ADR 0030)

GIPDP processes scanned Thai government TOR PDFs ranging from 10 to over 100 pages. Running Optical Character Recognition (OCR) and Google Gemini Large Language Model (LLM) extraction inside an HTTP request handler would block the Node.js event loop and lead to thread starvation:

```
[User Request] -----> [Next.js Client] -----> [Express API Server] (Fast response < 100ms)
                                                     |
                                                     | Reads pre-extracted summaries from MongoDB
                                                     v
                                           [MongoDB Atlas Cluster]
                                                     ^
                                                     | Writes extracted summaries
                                                     |
                                        +-------------------------+
                                        |  Background Pipeline    |
                                        |  (Independent Process)  |
                                        +-------------------------+
                                           |                   |
                                           v                   v
                                     [OCR Engine]        [Gemini LLM API]
                                     (Tesseract)         (Batched Queue)
```

1. **Complete Architectural Separation**:
   - The user-facing REST API server (`server/src/app.js`) is strictly read-only for TOR data. It serves pre-computed, normalized summaries from MongoDB in under 100ms.
   - The ingestion, OCR, and Gemini extraction pipelines execute as separate, scheduled background jobs (`server/src/pipeline/`).
2. **Mutual Exclusion & Concurrency Control (`pipelinelocks`)**:
   - Background runs acquire distributed locks via MongoDB `pipelinelocks` collection to prevent race conditions, concurrent scraper runs, or duplicate LLM inference spending.
3. **Graceful Pipeline Error Containment**:
   - Pipeline failures are isolated in `pipelinefailures` and do not impair web server availability.

---

## 4. Defensive Coding Practices (ASVS V15.3, V15.4)

### 4.1 Mass-Assignment Protection (V15.3.3)

User input is never passed directly to database update operators. In `server/src/features/profile/profile.validation.js`, incoming payloads are whitelist-filtered:
```javascript
// Whitelist-extract only allowed profile attributes
export function parseProfileUpdate(body) {
  const allowed = {};
  if (Array.isArray(body.skills)) allowed.skills = body.skills.map(String);
  if (typeof body.minBudgetTHB === 'number') allowed.minBudgetTHB = body.minBudgetTHB;
  if (typeof body.maxBudgetTHB === 'number') allowed.maxBudgetTHB = body.maxBudgetTHB;
  return allowed;
}
```
Attempting to inject administrative roles (`role: 'admin'`) or internal counters (`tokenVersion: 99`) via profile updates is discarded.

### 4.2 Regular Expression Denial of Service (ReDoS) Defense (V15.3.7)

Dynamic user input supplied to search filters could trigger catastrophic backtracking if interpreted as unescaped regular expressions. 
- Rule: All user-supplied search queries pass through `escapeRegex` (`server/src/common/utils/escape-regex.js`) before reaching Mongoose `$regex` queries:
  ```javascript
  export function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  ```
- Tested in `server/test/technology.test.js`.

### 4.3 Proxy Header Integrity (V15.3.4)

To prevent client IP spoofing via manipulated `X-Forwarded-For` HTTP headers, `server/src/app.js` configures an exact proxy hop count:
```javascript
app.set('trust proxy', env.trustProxyHops);
```
Only the IP address appended by the trusted edge reverse proxy is evaluated for rate-limiting.

### 4.4 Atomic Concurrency & State Safety (V15.4.2, V15.4.3)

State updates across collections use MongoDB atomic operators (`$set`, `$inc`, `$addToSet`, `findOneAndUpdate`) rather than read-modify-write patterns, eliminating race conditions during concurrent user actions (e.g. watchlist additions or token version increments).

---

## 5. OWASP ASVS Chapter 15 Traceability Matrix

| Ref ID | Req ID | Level | Requirement Summary | Status | Codebase Evidence & Verification |
|:---:|:---:|:---:|---|:---:|---|
| **296** | **V15.1.1** | L1 | Risk-based vulnerability remediation timeframes documented | **COMPLIANT** | Documented in this file (§2.1). 7 days for Critical, 14 for High, 30 for Medium. Managed via Dependabot. |
| **297** | **V15.1.2** | L1 | Software bill of materials (SBOM) and catalog maintained | **COMPLIANT** | Declared in `package.json` across client and server; locked with SHA-512 hashes in `package-lock.json`. |
| **298** | **V15.1.3** | L1 | Heavy and resource-intensive functionality documented | **COMPLIANT** | Documented in this file (§3.1) and ADR 0013/0030. OCR and LLM extractions run in background jobs. |
| **299** | **V15.1.4** | L1 | High-risk components highlighted in documentation | **N/A** | Out-of-Scope: GIPDP does not use high-risk native binaries or unsafe deserializers. |
| **300** | **V15.1.5** | L1 | Dangerous functionality documented | **N/A** | Out-of-Scope: No code execution or dynamic script evaluation. |
| **301** | **V15.2.1** | L1 | Components do not breach update timeframes | **COMPLIANT** | Enforced via automated `npm audit` and CodeQL SAST in `.github/workflows/fullstack-ci-setup.yml`, plus scheduled/on-demand OWASP ZAP DAST scans in `.github/workflows/dast-zap.yml` ([DAST Guide](./dast-zap-guide.md)). |
| **302** | **V15.2.2** | L1 | Defenses implemented against loss of availability | **COMPLIANT** | Workload decoupling (§3.1), rate limiting (`rate-limit.js`), request pacer (`request-pacer.js`, NFR-03). |
| **303** | **V15.2.3** | L1 | Production code excludes extraneous functionality | **COMPLIANT** | Test suites in `server/test` and dev scripts (`server/scripts/test-notify.js`) excluded from production routes. |
| **304** | **V15.2.4** | L2 | Defense against dependency confusion attacks | **N/A** | Out-of-Scope: GIPDP uses public npm registry packages only; no internal private npm registry. |
| **305** | **V15.2.5** | L2 | Protections around dangerous functionality | **N/A** | Out-of-Scope: Discovery platform does not execute dangerous shell commands or unsafe user code. |
| **306** | **V15.3.1** | L1 | Application returns only required subset of fields | **COMPLIANT** | `toPublic()` in `tor.service.js` strips raw pipeline internals; `toPublicUser()` in `auth.service.js` strips credentials. |
| **307** | **V15.3.2** | L1 | External calls do not follow redirects blindly | **COMPLIANT** | Scrapers enforce `maxRedirects: 5` and validate target host against allowlist (`asvs-chapter1.test.js`). |
| **308** | **V15.3.3** | L1 | Countermeasures against mass-assignment attacks | **COMPLIANT** | `parseProfileUpdate` whitelist-extracts allowed keys; raw `req.body` never passed to database update. |
| **309** | **V15.3.4** | L1 | Proxying components transfer original IP correctly | **COMPLIANT** | `app.set('trust proxy', env.trustProxyHops)` sets exact proxy hop count to prevent spoofed `X-Forwarded-For`. |
| **310** | **V15.3.5** | L1 | Strict equality comparisons and correct variable types | **COMPLIANT** | Strict `===` comparisons and explicit type coercions enforced throughout codebase. |
| **311** | **V15.3.6** | L1 | JavaScript prototype pollution defenses | **COMPLIANT** | Strict Mongoose schemas (`strict: true`) and modern standard data structures (`Set`, `Map`). |
| **312** | **V15.3.7** | L1 | Defenses against HTTP parameter pollution & ReDoS | **COMPLIANT** | `escapeRegex` applied to search queries before RegExp construction. Tested in `technology.test.js`. |
| **313** | **V15.4.1** | L1 | Thread-safe types in multi-threaded code | **N/A** | Out-of-Scope: Node.js executes JavaScript on a single-threaded event loop. |
| **314** | **V15.4.2** | L1 | Checks on resource state performed atomically | **COMPLIANT** | MongoDB atomic operators (`findOneAndUpdate`, `$set`, `$inc`) guarantee atomic updates. |
| **315** | **V15.4.3** | L1 | Consistent locking and avoidance of deadlocks | **COMPLIANT** | Distributed run lock in `pipelinelocks` prevents concurrent pipeline collisions (returns 409 Conflict). |
| **316** | **V15.4.4** | L2 | Resource allocation policies prevent thread starvation | **N/A** | Out-of-Scope: Standard Node.js event-driven non-blocking I/O model. |
