# Data Protection Security (OWASP ASVS Chapter 14)

This document specifies the data classification framework, sensitive data protection levels, cache controls, and data retention policies for the **Government IT Procurement Discovery Platform (GIPDP / Mjölnir)**, detailing compliance with **OWASP Application Security Verification Standard (ASVS) v5.0 Chapter 14: Data Protection** (Requirements V14.1 through V14.3, Reference IDs 283 to 295).

---

## 1. Executive Summary & Purpose

GIPDP aggregates and normalizes public Thai government IT procurement notices while handling user accounts, capability profiles, and notification preferences. 

The data protection architecture enforces three core principles:
1. **Confidentiality & Privacy**: Sensitive user information (passwords, emails, capability profiles) is strictly segregated and guarded against unauthorized access or cross-user leakage (PDPA compliance).
2. **Data Integrity & Provenance**: Public procurement data and AI-derived summaries maintain an immutable audit trail; previous summary versions are archived for rollback (ADR 0031).
3. **Public Gate & Confidence Shield (NFR-17)**: Public APIs never expose internal confidence metrics or unverified machine extractions below the 80% confidence threshold.

---

## 2. Sensitive Data Classification & Protection Levels (ASVS V14.1.1, V14.1.2)

All data processed, stored, or transmitted by GIPDP is classified into five distinct tiers with concrete protection specifications:

```
+----------------------------------------------------------------------------------------------------+
|                                    Data Classification Hierarchy                                   |
+----------------------------------------------------------------------------------------------------+
  [Tier 1: Infrastructure Secrets & Credentials] -> Environment variables, bcrypt hash, JWT Secret
  [Tier 2: Active Session & Auth State]          -> __Host- HttpOnly cookies, 24h TTL, CSRF state
  [Tier 3: User Personal Information (PII)]      -> Email, profile skills, budget capacity, watchlist
  [Tier 4: Platform Internal Analytics & Gate]   -> OCR/LLM confidence scores, review queue flags (NFR-17)
  [Tier 5: Public Government Procurement Data]   -> Normalized summaries, deadlines, reference prices
```

| Tier | Category | Examples | Storage Location | Protection Controls & Requirements |
|---|---|---|---|---|
| **Tier 1** | **Credentials & Secrets** | User password hashes, `JWT_SECRET`, `MONGO_URI`, Gemini API Key | Server `.env`, MongoDB `users.passwordHash` | • Passwords hashed with **bcrypt (12 salt rounds)**.<br>• Plaintext passwords are never logged or stored.<br>• `passwordHash` stripped via `toPublicUser` before any user object leaves the service.<br>• Secrets reside only in server environment memory. |
| **Tier 2** | **Session & Auth State** | JWT session tokens, Google OAuth PKCE state | HTTP-only Cookies | • RFC 6265bis `__Host-` prefix in production.<br>• `HttpOnly: true`, `SameSite: 'lax'`, `Secure: true`, `Path: '/'`.<br>• Inaccessible to JavaScript; never stored in `localStorage`.<br>• Size enforced `<= 4,096` bytes. Expire strictly after 24h. |
| **Tier 3** | **Personal Information (PII)** | User email, display name, capability profile (skills, budget capacity), watchlist | MongoDB `users` collection | • Access strictly isolated to `req.user.id` (users can query/mutate only their own records).<br>• Thailand **PDPA Compliance**: Email notifications are opt-in only by default.<br>• Unsubscribe links carry stateless HMAC-SHA256 signatures; never require login to unsubscribe. |
| **Tier 4** | **Internal & Confidence Data** | OCR confidence, LLM extraction confidence scores, admin review flags | MongoDB `torinsights`, `titlescreens` | • **NFR-17 Gate**: Extractions with confidence `< 80%` are withheld from public view until approved by an admin.<br>• Public API responses never expose confidence percentages or review internal notes. |
| **Tier 5** | **Public Procurement Data** | Extracted project titles, budgets, reference prices (ราคากลาง), submission deadlines, tech stack tags | MongoDB `tors`, `torinsights` | • Publicly accessible without authentication.<br>• Verified by automated ingestion schemas.<br>• Traceable back to official e-GP PDF source documents. |

---

## 3. Data in Transit & Client-Side Cache Protection (ASVS V14.2, V14.3)

### 3.1 Protection of Sensitive Data in Transit (V14.2.1, V14.2.3)

- **Transmission Exclusively via Body or Header**: User credentials (`email`, `password`) are accepted exclusively via HTTP `POST` request bodies (`/api/auth/login`, `/api/auth/register`). Credentials are never passed in URL query parameters where they could leak into browser histories, access logs, or HTTP `Referer` headers.
- **Session Transmission**: Tokens are transmitted exclusively in the `Cookie` header over TLS.
- **Zero Third-Party Exfiltration**: The platform embeds zero third-party analytics trackers, tracking pixels, or marketing SDKs, ensuring user data is never leaked to external parties.

### 3.2 Anti-Caching Controls on Sensitive Responses (V14.3.2, V14.2.2)

To prevent web caches, proxies, or shared workstations from caching sensitive user profiles or private watchlists:

1. **Authenticated Route Anti-Caching Middleware (`auth.middleware.js`)**:
   Every request authenticated by `requireAuth` automatically injects defensive anti-caching headers:
   ```javascript
   res.set({
     'Cache-Control': 'no-store, no-cache, must-revalidate, private',
     'Pragma': 'no-cache',
     'Expires': '0',
   });
   ```
2. **Logout Storage Clearing (`auth.controller.js`)**:
   When a user logs out (`POST /api/auth/logout`), the server emits:
   ```http
   Clear-Site-Data: "cache", "cookies", "storage"
   ```
   This signals the browser to purge all cached pages, service workers, cookies, and storage associated with the origin.

---

## 4. Data Retention & Historical Versioning (ASVS V14.2.7)

GIPDP enforces a structured data retention and archival classification:

1. **TOR Insight Versions (`torinsightversions` collection)**:
   - In accordance with [ADR 0031](../decisions/0031-retrying-failed-pipeline-steps.md) and **NFR-07**, when a procurement notice is amended by an agency or re-extracted by an administrator, the prior extraction summary is not overwritten destructively.
   - The prior summary is immutably archived in `torinsightversions`, capturing the complete snapshot, timestamp, and amendment code (`D2`).
   - Enables full administrative rollback in `/admin/review/[id]` if an amendment was processed erroneously.
2. **Ingestion & Audit Logs (`ingestionlogs` collection)**:
   - All automated scraper events,Gemini token usages, and failure traces are recorded for auditing and pipeline health monitoring.
3. **User Account Deletion**:
   - When an account is deleted, the user document and associated watchlist references are purged, and active sessions are terminated immediately (`auth.middleware.js`).

---

## 5. OWASP ASVS Chapter 14 Traceability Matrix

| Ref ID | Req ID | Level | Requirement Summary | Status | Codebase Evidence & Verification |
|:---:|:---:|:---:|---|:---:|---|
| **283** | **V14.1.1** | L1 | Sensitive data created and processed is identified | **COMPLIANT** | Documented in this file (§2). Five-tier data classification defined covering credentials, sessions, PII, and public data. |
| **284** | **V14.1.2** | L1 | Sensitive data protection levels have documented protection requirements | **COMPLIANT** | Documented in this file (§2). Strict protection requirements specified per tier (bcrypt, __Host- cookies, PDPA opt-in, NFR-17 gate). |
| **285** | **V14.2.1** | L1 | Sensitive data sent in Body/Header, not in URL parameters | **COMPLIANT** | Credentials submitted via POST body; session tokens in Cookie headers. Never exposed in URLs. |
| **286** | **V14.2.2** | L1 | Prevent sensitive data from being cached | **COMPLIANT** | `auth.middleware.js` sends `Cache-Control: no-store, no-cache, must-revalidate, private` on authenticated responses. |
| **287** | **V14.2.3** | L1 | Sensitive data not sent to untrusted third parties | **COMPLIANT** | Zero third-party trackers, pixels, or analytics libraries integrated into client or backend. |
| **288** | **V14.2.4** | L1 | Controls around sensitive data (encryption, hashing, integrity) implemented | **COMPLIANT** | Bcrypt with 12 salt rounds, HMAC-SHA256 session signatures, and HMAC unsubscribe links. |
| **289** | **V14.2.5** | L1 | Defenses against web cache deception attacks | **N/A** | Out-of-Scope: GIPDP does not cache dynamic API routes on a public CDN; authenticated responses carry `no-store`. |
| **290** | **V14.2.6** | L1 | Only return minimum required sensitive data to the user | **COMPLIANT** | `toPublicUser(user)` in `auth.service.js` strips password hashes, internal roles, and token versions. |
| **291** | **V14.2.7** | L1 | Sensitive information subject to retention classification | **COMPLIANT** | Documented in this file (§4). Replaced TOR summaries preserved in `torinsightversions` for audit and rollback (ADR 0031). |
| **292** | **V14.2.8** | L1 | Remove sensitive metadata from user-submitted files | **N/A** | Out-of-Scope: End users cannot upload files to GIPDP. |
| **293** | **V14.3.1** | L1 | Authenticated data cleared from client storage on logout | **COMPLIANT** | `POST /api/auth/logout` sets `Clear-Site-Data: "cache", "cookies", "storage"` header and clears session cookie. |
| **294** | **V14.3.2** | L1 | Anti-caching HTTP response headers sent on authenticated pages | **COMPLIANT** | `Cache-Control: no-store` and `Pragma: no-cache` enforced in `server/src/features/auth/auth.middleware.js`. |
| **295** | **V14.3.3** | L1 | Browser storage does not store sensitive credentials | **COMPLIANT** | JWT session token is stored strictly in `httpOnly` cookie; zero credentials in `localStorage` or `sessionStorage`. |
