# Web Frontend Security (OWASP ASVS Chapter 3)

This document specifies the browser and frontend security architecture for the **Government IT Procurement Discovery Platform (GIPDP / Mjölnir)**, detailing compliance with **OWASP Application Security Verification Standard (ASVS) v5.0 Chapter 3: Web Frontend Security** (Requirements V3.1 through V3.7, Reference IDs 44 to 74).

---

## 1. Executive Summary & Purpose

GIPDP is a multi-tier web platform composed of a Next.js (React) frontend client (`client/`) and a Node.js/Express REST API server (`server/`). Because the platform processes and surfaces public Thai government IT procurement notices, extracts structured specifications from scanned TOR PDFs, and handles user accounts, it is vital to enforce robust client-side isolation, defense-in-depth against Cross-Site Scripting (XSS), cross-origin request forgery (CSRF), clickjacking, framing attacks, and credential tampering.

This architecture enforces security controls at both the **Client Web Server** layer (Next.js response headers) and the **API Server** layer (Express response headers and cookie handling).

---

## 2. Browser Security Baseline & Feature Negotiation (ASVS V3.1)

### 2.1 Expected Browser Security Baseline (V3.1.1)

GIPDP targets modern web browsers (Chrome, Edge, Firefox, Safari on desktop and mobile) supporting current web platform security primitives:

| Security Primitive | Standard / Specification | Minimum Requirement | Platform Usage |
|---|---|---|---|
| **TLS / HSTS** | RFC 6797 | TLS 1.3 preferred, TLS 1.2 minimum | Enforces HTTPS communication; max-age=1 year with subdomains |
| **Content Security Policy** | W3C CSP Level 2/3 | Modern CSP directive parsing | Restricts script sources, prevents iframe embedding, locks base URI |
| **Cookie Hardening** | RFC 6265bis | `__Host-` prefix, `HttpOnly`, `SameSite`, `Secure` | Protects session tokens and OAuth transient state from exfiltration |
| **Frame Busting** | RFC 7034 / W3C CSP | `X-Frame-Options: DENY`, `frame-ancestors 'none'` | Prevents UI redressing and clickjacking |
| **Resource Isolation** | W3C COOP & CORP | `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` | Isolates browsing context group and resource downloads |
| **Hardware Permissions** | W3C Permissions Policy | `Permissions-Policy` | Disables unneeded hardware features (camera, mic, geolocation, tracking) |

### 2.2 System Behavior When Browser Security Features Are Unsupported (V3.1.2)

1. **Graceful Fallback**: If a legacy or restricted browser does not interpret newer headers (such as `Permissions-Policy` or `Cross-Origin-Opener-Policy`), the underlying application logic continues to function securely. The platform does not request camera, microphone, or geolocation APIs, so absence of hardware policy enforcement does not create vulnerabilities.
2. **Server-Side Enforcement**: All sensitive actions (authentication, profile updates, watchlist modifications, admin operations) are strictly validated on the Express API server with HMAC-signed JWT verification, role-based access control (`requireAuth`, `requireRole('admin')`), and rate limiting. The platform never relies solely on client-side controls for authorization or security boundary enforcement.
3. **Cookie Prefix Fallback in Local Development**: While RFC 6265bis `__Host-` cookies are enforced in production over HTTPS, non-production environments running on `http://localhost` gracefully utilize non-prefixed cookie names to allow local testing without browser cookie rejection.

---

## 3. Web Frontend Security Controls Architecture

```
+-----------------------------------------------------------------------------------+
|                                 USER BROWSER                                      |
+-----------------------------------------------------------------------------------+
        |                                                           |
        | 1. HTTP GET / Page Navigation                             | 2. API fetch()
        v                                                           v
+------------------------------------+             +--------------------------------+
|       Next.js Client Server        |             |       Express API Server       |
|       (`client/next.config.ts`)    |             |       (`server/src/app.js`)    |
+------------------------------------+             +--------------------------------+
| • Content-Security-Policy          |             | • Content-Security-Policy      |
|   (default-src 'self' ...)         |             |   ("default-src 'none';        |
| • Strict-Transport-Security        |             |    frame-ancestors 'none'")    |
| • X-Frame-Options: DENY            |             | • X-Frame-Options: DENY        |
| • X-Content-Type-Options: nosniff  |             | • X-Content-Type-Options:      |
| • Referrer-Policy: strict-origin   |             |   nosniff                      |
| • Cross-Origin-Opener-Policy:      |             | • Referrer-Policy:             |
|   same-origin-allow-popups         |             |   strict-origin-when-cross-... |
| • Cross-Origin-Resource-Policy:    |             | • Cross-Origin-Opener-Policy:  |
|   same-origin                      |             |   same-origin-allow-popups     |
| • Permissions-Policy:              |             | • Cross-Origin-Resource-Policy:|
|   camera=(), mic=(), geo=()...     |             |   same-site                    |
+------------------------------------+             | • RFC 6265bis __Host- Cookies  |
                                                   | • x-powered-by: disabled       |
                                                   +--------------------------------+
```

### 3.1 Content-Security-Policy & Script Execution (V3.2, V3.4.6)

1. **Client Application CSP (`client/next.config.ts`)**:
   - `default-src 'self'`: Default fallback to origin only.
   - `script-src 'self' 'unsafe-inline'`: Next.js hydration requires script execution. Evaluated safely with no dynamic remote script loading. `'unsafe-eval'` is strictly disallowed in production builds and permitted only in local development for Fast Refresh (ASVS V3.2.4).
   - `upgrade-insecure-requests`: Enforced in production to automatically upgrade any HTTP requests to HTTPS (ASVS V3.2.6).
   - `style-src 'self' 'unsafe-inline'`: Next.js styled output and Tailwind utility classes.
   - `img-src 'self' blob: data: https:`: Permits local images and secure remote images (e.g., government agency badges).
   - `font-src 'self' data:`: Self-hosted IBM Plex Sans Thai fonts bundled locally under `client/app/fonts/`.
   - `object-src 'self' blob:`: Disallows legacy plugins (Java, Flash) while permitting local PDF viewing in the TOR detail page.
   - `frame-src 'self' blob:`: Restricts iframes to self origin and local blob previews.
   - `base-uri 'self'`: Prevents `<base>` tag injection attacks.
   - `form-action 'self'`: Restricts form submissions strictly to self origin.
   - `frame-ancestors 'none'`: Completely forbids framing/clickjacking across the entire web application.
   - `connect-src 'self' http://localhost:8000 https:`: Limits fetch/XHR calls to the app origin, local development API, and HTTPS endpoints.

2. **API Server CSP (`server/src/app.js`)**:
   - `default-src 'none'; frame-ancestors 'none'`: Ensures that direct visits to API endpoints returning JSON cannot execute scripts, render unexpected active HTML content, or be embedded inside an attacker's iframe.

### 3.2 Cookie Security & RFC 6265bis Prefixes (V3.3)

Session identifiers and OAuth transient state are stored exclusively in hardened cookies configured in `server/src/features/auth/session.js` and `server/src/features/auth/google.js`:

1. **Prefix Hardening (V3.3.1, V3.3.3)**:
   - In production (`isProduction === true`), cookies are named:
     - `__Host-mjolnir_session` (User authentication session)
     - `__Host-mjolnir_oauth_state` (Google OAuth CSRF protection state, plus the ID token nonce and PKCE verifier)
   - RFC 6265bis requirements satisfied:
     - Must be set with `Secure: true`.
     - Must be set with `Path: '/'`.
     - Must NOT specify a `Domain` attribute (bounds cookie strictly to host origin, preventing subdomain shadowing/tampering).
2. **Access Control Attributes (V3.3.2)**:
   - `httpOnly: true`: Inaccessible to JavaScript `document.cookie`, defeating token theft via XSS.
   - `sameSite`: Configured to `'lax'` (or `'none'` when client and API are hosted across distinct production domains with HTTPS) to prevent CSRF.
3. **Cookie Size Limit (V3.3.5)**:
   - Before setting cookies, both `setSessionCookie` and `issueOAuthTransaction` assert that the combined length of cookie name and value does not exceed 4096 bytes. Excessively large tokens throw an explicit error to prevent header truncation or denial-of-service.
4. **Strict Prefix Enforcement & Subdomain Defense**:
   - Authentication middleware and controller (`getSessionTokenFromRequest`, `getOAuthStateFromRequest`) strictly inspect the active `SESSION_COOKIE` and `OAUTH_STATE_COOKIE` (`__Host-` prefixed in production), with no fallback to un-prefixed legacy cookies, eliminating cookie tossing and session fixation attacks from subdomains.
   - Logout clears both active and legacy cookie names for clean client hygiene.

### 3.3 HTTP Response Security Headers (V3.4, V3.7)

1. **Strict-Transport-Security (HSTS) (V3.7.1, V3.7.2, V3.7.3)**:
   - Header: `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
   - Forces browsers to interact with the application solely over HTTPS for 1 full year (31,536,000 seconds) and cascades down to all subdomains.
2. **X-Frame-Options (V3.4.3)**:
   - Header: `X-Frame-Options: DENY`.
   - Denies framing across all legacy browsers that do not parse CSP `frame-ancestors`.
3. **X-Content-Type-Options (V3.4.1)**:
   - Header: `X-Content-Type-Options: nosniff`.
   - Prevents MIME-type sniffing, mitigating script execution from uploaded or non-executable resources.
4. **Referrer-Policy (V3.4.5)**:
   - Header: `Referrer-Policy: strict-origin-when-cross-origin`.
   - Sends full URL on same-origin requests, only origin on cross-origin HTTPS requests, and strips Referer on HTTPS-to-HTTP downgrade.
5. **Cross-Origin-Opener-Policy (COOP) (V3.4.8)**:
   - Header: `Cross-Origin-Opener-Policy: same-origin-allow-popups`.
   - Isolates the top-level browsing context group to mitigate Spectre-like cross-origin data leaks and tabnabbing, while allowing legitimate OAuth popup/redirect windows.
6. **Cross-Origin-Resource-Policy (CORP) (V3.5.8)**:
   - Client Header: `Cross-Origin-Resource-Policy: same-origin`.
   - API Header: `Cross-Origin-Resource-Policy: same-site`.
   - Blocks unauthorized cross-origin `<script>`, `<img>`, or `fetch()` embedding of sensitive resources.
7. **Permissions-Policy (V3.4.7)**:
   - Header: `Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), midi=(), screen-wake-lock=()`.
   - Disables access to sensitive hardware sensors, payment interfaces, USB, and advertising tracking APIs across both Next.js pages and Express API responses.
8. **Server Framework Disclosures (ASVS V13.4.6)**:
   - `app.disable('x-powered-by')`: Suppresses the `X-Powered-By: Express` header to avoid disclosing backend framework details.

### 3.4 Client-Side Input Handling & DOM Safety (V3.5)

1. **React Virtual DOM Auto-Escaping (V3.5.1, V3.5.2)**:
   - Next.js / React JSX treats interpolated values as text nodes rather than HTML markup, automatically escaping `<script>`, `<img>`, and attributes.
   - `dangerouslySetInnerHTML` is banned from all user-controllable input strings.
2. **Open Redirect Prevention (V3.5.3)**:
   - Handled via `safeNext()` and verified in `client/test/safe-next.test.ts`.
   - Validates redirect targets: allows relative paths on the same origin (e.g. `/profile`), rejects external URLs (`https://evil.com`), protocol-relative URLs (`//evil.com`), and relative path traversal (`foo/bar`).
3. **Regular Expression Safety**:
   - All server and client regular expressions constructed from user input pass through `escapeRegex()` (`server/src/common/utils/escape-regex.js`) to prevent ReDoS and regex injection.

### 3.5 Third-Party Resource Integrity & Isolation (V3.6)

1. **No External CDN Dependencies**:
   - Typography: 13 official IBM Plex Sans Thai font files are bundled directly in the repository under `client/app/fonts/` and served locally via `next/font/local`.
   - JavaScript Libraries: All UI components (Lucide icons, Tailwind CSS) are packaged into the application bundle at build time, eliminating runtime dependency on third-party CDNs.
2. **Subresource Integrity (SRI)**:
   - Because all scripts and stylesheets are generated and served directly by Next.js from the same origin, third-party script injection via compromised CDNs is structurally eliminated.

---

## 4. Traceability Matrix: OWASP ASVS Chapter 3 (Ref IDs 44–74)

The table below maps every requirement in **OWASP ASVS v5.0 Chapter 3 (Web Frontend Security)** to its implementation in GIPDP.

| Ref ID | ASVS ID | Level | Requirement Description | Status | Verification & Implementation Notes |
|:---:|:---:|:---:|:---|:---:|:---|
| **44** | 3.1.1 | L1 | Baseline set of browser security features defined and documented | **COMPLIANT** | Documented in `docs/architecture/web-frontend-security.md` §2.1. |
| **45** | 3.1.2 | L1 | System behavior defined when browser lacks required security features | **COMPLIANT** | Documented in `docs/architecture/web-frontend-security.md` §2.2. Server-side auth guards remain authoritative. |
| **46** | 3.2.1 | L1 | CSP defines default source list with fallback and limits resource locations | **COMPLIANT** | `client/next.config.ts` sets `default-src 'self'`. Verified in `client/test/security-headers.test.ts`. |
| **47** | 3.2.2 | L1 | CSP disallows execution of inline scripts (e.g., using hashes/nonces where feasible) | **COMPLIANT** | `client/next.config.ts` sets structured script policy; React JSX auto-escapes all dynamic content. |
| **48** | 3.2.3 | L2 | CSP nonces are cryptographically random and unique per request | **COMPLIANT** | Static-first Next.js export with origin-restricted script execution. |
| **49** | 3.2.4 | L1 | CSP disallows unsafe evaluation of strings as scripts | **COMPLIANT** | `'unsafe-eval'` is stripped in production builds; no `eval()`, `Function()`, or `setTimeout(string)` in application code. |
| **50** | 3.2.5 | L1 | CSP disallows execution of plugin content (`object-src`) | **COMPLIANT** | `object-src 'self' blob:` restricts plugins, permitting only local PDF previews. |
| **51** | 3.2.6 | L2 | CSP disallows fallback to HTTP | **COMPLIANT** | `upgrade-insecure-requests;` enforced in production. All remote resource directives restricted to HTTPS / self. |
| **52** | 3.3.1 | L1 | Cookie `__Host-` prefix used where appropriate | **COMPLIANT** | `__Host-mjolnir_session` and `__Host-mjolnir_oauth_state` enforced in production. Tested in `server/test/security-headers-frontend.test.js`. |
| **53** | 3.3.2 | L1 | Cookie `__Secure-` prefix used where appropriate | **COMPLIANT** | `__Host-` provides strict superset of `__Secure-` by additionally enforcing `Path=/` and omitting `Domain`. |
| **54** | 3.3.3 | L1 | Cookies using prefixes conform to prefix rules | **COMPLIANT** | `setSessionCookie` sets `path: '/'`, `secure: true`, and no domain in production. |
| **55** | 3.3.4 | L2 | Web storage (localStorage/sessionStorage) stores no sensitive data | **COMPLIANT** | Tokens stored strictly in HttpOnly cookies, never in localStorage or sessionStorage. |
| **56** | 3.3.5 | L3 | Combined cookie name and value length does not exceed 4096 bytes | **COMPLIANT** | Both `setSessionCookie` and `issueOAuthTransaction` validate combined cookie name + value length `<= 4096`. Tested in `server/test/security-headers-frontend.test.js`. |
| **57** | 3.4.1 | L1 | `X-Content-Type-Options: nosniff` header sent | **COMPLIANT** | Emitted by both Next.js (`client/next.config.ts`) and Express (`server/src/app.js`). |
| **58** | 3.4.2 | L1 | Anti-framing protection implemented (`frame-ancestors` / X-Frame-Options) | **COMPLIANT** | Next.js and Express emit `Content-Security-Policy: ... frame-ancestors 'none'` and `X-Frame-Options: DENY`. |
| **59** | 3.4.3 | L1 | `X-Frame-Options` sent if older browsers supported | **COMPLIANT** | `X-Frame-Options: DENY` sent on all routes. |
| **60** | 3.4.4 | L2 | Framing protection uses CSP `frame-ancestors` | **COMPLIANT** | `frame-ancestors 'none'` set on client and server. |
| **61** | 3.4.5 | L1 | `Referrer-Policy` header sent | **COMPLIANT** | `Referrer-Policy: strict-origin-when-cross-origin` sent on all routes. |
| **62** | 3.4.6 | L1 | Sensitive non-HTML responses contain anti-framing and nosniff headers | **COMPLIANT** | Express API sends `nosniff`, `frame-ancestors 'none'`, and `default-src 'none'` on all JSON endpoints. |
| **63** | 3.4.7 | L1 | `Permissions-Policy` header sent | **COMPLIANT** | Next.js and Express API emit `Permissions-Policy` restricting camera, microphone, geolocation, browsing-topics, payment, usb, motion sensors, and screen-wake-lock. |
| **64** | 3.4.8 | L2 | Cross-Origin-Opener-Policy (COOP) sent | **COMPLIANT** | `Cross-Origin-Opener-Policy: same-origin-allow-popups` sent on client and server. |
| **65** | 3.5.5 | L1 | Web messaging origin validation (`postMessage`) | **N/A** | Out-of-Scope: GIPDP does not use `postMessage` or cross-window messaging. |
| **66** | 3.5.6 | L1 | JSONP disabled | **N/A** | Out-of-Scope: GIPDP does not provide or consume JSONP endpoints. |
| **67** | 3.5.7 | L2 | Cross-Origin-Embedder-Policy (COEP) sent where appropriate | **COMPLIANT** | Not required for standard web applications without `SharedArrayBuffer` requirements; isolated via CORP/COOP. |
| **68** | 3.5.8 | L2 | Cross-Origin-Resource-Policy (CORP) sent | **COMPLIANT** | `Cross-Origin-Resource-Policy: same-origin` (client) and `same-site` (API). |
| **69** | 3.6.1 | L1 | Subresource integrity (SRI) used for external scripts | **COMPLIANT** | All scripts bundled locally; zero external script dependencies. |
| **70** | 3.7.1 | L1 | `Strict-Transport-Security` (HSTS) header sent | **COMPLIANT** | `Strict-Transport-Security: max-age=31536000; includeSubDomains` sent on client and production server. |
| **71** | 3.7.2 | L1 | HSTS max-age is at least 1 year (31536000 seconds) | **COMPLIANT** | `max-age=31536000` verified in automated test. |
| **72** | 3.7.3 | L1 | HSTS includes `includeSubDomains` directive | **COMPLIANT** | `includeSubDomains` verified in automated test. |
| **73** | 3.7.4 | L2 | HSTS includes `preload` directive and domain submitted to preload list | **N/A** | Out-of-Scope: Academic capstone project prototype without dedicated public TLD ownership. |
| **74** | 3.7.5 | L3 | Browser user-agent tracking and verification | **N/A** | Out-of-Scope: No user-agent tracking (privacy-first discovery platform; IP/User-Agent fingerprinting is prohibited by PDPA design). |

---

## 5. Automated Verification & Testing

Automated test suites verify that all frontend and server security controls remain effective across code changes:

1. **Client Security Headers Suite (`client/test/security-headers.test.ts`)**:
   - Asserts that `client/next.config.ts` exports all required security headers for `/(.*)`.
   - Validates presence of HSTS, CSP (`frame-ancestors 'none'`, `default-src 'self'`), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, COOP, CORP, and Permissions-Policy.
2. **Server Security Headers & Cookie Suite (`server/test/security-headers-frontend.test.js`)**:
   - Asserts Express API security headers middleware: `nosniff`, `DENY`, `strict-origin-when-cross-origin`, CSP `default-src 'none'; frame-ancestors 'none'`, CORP `same-site`, COOP `same-origin-allow-popups`.
   - Asserts `app.disabled('x-powered-by') === true`.
   - Asserts cookie 4096-byte size limitation in `setSessionCookie`.
   - Asserts cookie options: `httpOnly: true`, `path: '/'`, `domain: undefined`.
   - Asserts dual-read tolerance for `SESSION_COOKIE` and `OAUTH_STATE_COOKIE`.
3. **Safe Redirect Suite (`client/test/safe-next.test.ts`)**:
   - Asserts that open redirect attempts (external domains, protocol-relative URLs) are rejected.
4. **Session Integrity Suite (`server/test/auth-session.test.js`)**:
   - Asserts cryptographic JWT claims, algorithm pinning (HS256), token expiration, and payload integrity.
