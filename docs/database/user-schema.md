# Data Dictionary & Schema Specification: `User`

**File:** `server/src/models/user.model.js`  
**Model Name:** `User`  
**Collection Name:** `users`  
**Related Documents:** [ADR 0004 · Sessions as signed cookies](../decisions/0004-sessions-as-signed-cookies.md), [ADR 0005 · Google sign-in links by verified email](../decisions/0005-google-sign-in-links-by-verified-email.md), [ADR 0011 · A name and a role on the account](../decisions/0011-a-name-and-a-role-on-the-account.md), [ADR 0012 · How the browser holds a session](../decisions/0012-how-the-browser-holds-a-session.md)  
**Status:** Active  

---

## 1. Overview

The `User` model represents an authenticated account on the platform. It supports dual-authentication strategies (Email/Password via bcrypt and Google OAuth 2.0 OpenID Connect), user profile preferences (notification consent), and role-based access control (`user` vs `admin`).

### Authentication & Credential Invariants:
- **Email as Identity Anchor**: Account identity is bound to a normalized lowercase email.
- **Password vs Google**: Accounts created via Google Sign-In have no `passwordHash`, while email/password accounts have no `googleId`. If a Google user signs in with an existing email, accounts are safely linked by verified email (ADR 0005).
- **Session Handling**: Authentication sessions are stored as cryptographically signed HTTP-only cookies (`gipdp_session`), carrying the user ID and role (ADR 0004, ADR 0012).

---

## 2. Schema Fields & Constraints

| Field | Type | Constraints / Indexes | Default | Description | Example |
|---|---|---|---|---|---|
| `email` | `String` | Required, Unique, Lowercase, Trim | — | Primary contact and identity key. Normalized to lowercase to prevent duplicate collision. | `"developer@company.co.th"` |
| `name` | `String` | Trim, Max length: 80 chars | `""` | User display name or company contact name. Allows Thai & Unicode characters. | `"สมชาย ใจดี"` |
| `passwordHash` | `String` | Hidden by default (`select: false`) | `undefined` | Bcrypt password hash. Excluded from query projections by default for security. | `"$2b$10$W7Gq...8f"` |
| `googleId` | `String` | Unique, Sparse index | `undefined` | Subject identifier (`sub`) from Google OAuth ID token. Sparse index ensures password-only users don't collide on `null`. | `"109823481239841234981"` |
| `notificationConsent` | `Boolean` | — | `false` | Explicit opt-in consent for automated email alerts for watched TORs / amendments (FR08). | `true` |
| `role` | `String` | Enum: `['user', 'admin']`, Indexed | `'user'` | Access control role. Admin rights (`admin`) can view scraper health, OCR confidence, and administrative overrides. | `'user'` or `'admin'` |
| `createdAt` | `Date` | Auto managed | — | Timestamp of account registration. | `"2026-09-29T10:00:00.000Z"` |
| `updatedAt` | `Date` | Auto managed | — | Timestamp of last profile/account update. | `"2026-09-29T12:30:00.000Z"` |

---

## 3. Role-Based Permissions (`role`)

| Role | Access Level | Description |
|---|---|---|
| `user` (Default) | Standard User | Can browse TOR catalog, view AI-normalized insights, save items to watchlist, setup matchmaker profile, and configure notification alerts. |
| `admin` | Platform Administrator | All standard user capabilities + access to Admin Dashboard (scraper health status, failed pipeline jobs, OCR/LLM confidence scores, and manual reclassification tools — US15–US17, FR14–FR15). Role is granted out-of-band via CLI (`npm run role`). |

---

## 4. Example Documents (MongoDB JSON)

### 4.1 Standard Email / Password User
```json
{
  "_id": {
    "$oid": "660e1f77bcf86cd799439001"
  },
  "email": "somchai@techsme.co.th",
  "name": "สมชาย พัฒนาซอฟต์แวร์",
  "notificationConsent": true,
  "role": "user",
  "createdAt": {
    "$date": "2026-09-15T08:00:00.000Z"
  },
  "updatedAt": {
    "$date": "2026-09-15T08:00:00.000Z"
  },
  "__v": 0
}
```

### 4.2 Google OAuth User
```json
{
  "_id": {
    "$oid": "660e1f77bcf86cd799439002"
  },
  "email": "freelancer.dev@gmail.com",
  "name": "Alex Miller",
  "googleId": "114092837491823749182",
  "notificationConsent": false,
  "role": "user",
  "createdAt": {
    "$date": "2026-09-18T14:22:10.000Z"
  },
  "updatedAt": {
    "$date": "2026-09-18T14:22:10.000Z"
  },
  "__v": 0
}
```

### 4.3 Administrator Account
```json
{
  "_id": {
    "$oid": "660e1f77bcf86cd799439003"
  },
  "email": "admin@csp-mjolnir.internal",
  "name": "System Admin",
  "googleId": "100928374918237491001",
  "notificationConsent": true,
  "role": "admin",
  "createdAt": {
    "$date": "2026-09-01T00:00:00.000Z"
  },
  "updatedAt": {
    "$date": "2026-09-01T00:00:00.000Z"
  },
  "__v": 0
}
```
