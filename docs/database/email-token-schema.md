# Data Dictionary & Schema Specification: `EmailToken`

**File:** `server/src/models/email-token.model.js`
**Model Name:** `EmailToken`
**Collection Name:** `emailtokens`
**Related Documents:** [0041 · An address is confirmed before the account exists](../decisions/0041-an-address-is-confirmed-before-the-account-exists.md), [0042 · Passwords can be changed, reset and checked](../decisions/0042-passwords-can-be-changed-reset-and-checked.md), [User Schema](./user-schema.md)
**Status:** Active

---

## 1. Overview

A one-time token sent by email. For `purpose: 'verify-email'` it also holds the whole registration: the address, the password's hash, the name and the consent. No `User` exists until the address is confirmed, so nothing unconfirmed can be signed in to, linked to Google, or emailed ([0041](../decisions/0041-an-address-is-confirmed-before-the-account-exists.md)). For `purpose: 'reset-password'` it holds only the address: whoever opens the link within the hour can set that account's password ([0042](../decisions/0042-passwords-can-be-changed-reset-and-checked.md)).

The token itself is in the email and nowhere else. This collection holds only its SHA-256, so a copy of it opens nothing.

### Who writes it

- **`features/auth/auth.service.js`, `requestRegistration`:** one document per registration of a new address, or of an old account whose address was never confirmed. An address that already has a confirmed account gets no document, only an email.
- **The same file, `confirmRegistration`:**
  - a wrong password adds one to `attempts`, and the fifth deletes the document;
  - the right one deletes it, and every other `verify-email` document for the address, and creates or claims the user.
- **`requestPasswordReset`:** deletes the address's `reset-password` documents, then writes one for an address with an account, so only the latest link works. For an address without one it writes and deletes a document, so both branches do the same kind of work.
- **`resetPassword`:** spends the link in one write, then deletes the address's other `reset-password` documents.
- **`signInWithGoogle`:** deletes the address's `verify-email` documents when Google creates or links the account, since they could never be confirmed after that.
- **MongoDB's TTL monitor:** deletes a document about a minute after `expiresAt`. The code checks the expiry itself, so a document is never good for that extra minute.

### Who reads it

`confirmRegistration` and `resetPassword`, each by `tokenHash` and its own `purpose`, so a confirm token can never reset a password. Nothing outside `features/auth` reads this collection, and no response ever carries a document from it.

---

## 2. Schema Fields & Constraints

| Field | Type | Constraints / Indexes | Default | Description | Example |
|---|---|---|---|---|---|
| `purpose` | `String` | Required, enum `['verify-email', 'reset-password']` | — | What the token is for: a registration waiting for its address, or a reset link ([0042](../decisions/0042-passwords-can-be-changed-reset-and-checked.md)) | `"verify-email"` |
| `email` | `String` | Required, lowercase, trim, indexed | — | The address the email went to, normalised as `User.email` is, so one address finds all its tokens | `"somchai@example.co.th"` |
| `tokenHash` | `String` | Required, unique | — | SHA-256 of the token, in hex. The token is 32 random bytes as base64url (43 characters) and appears only in the emailed link | `"3f0a…c91e"` (64 hex characters) |
| `expiresAt` | `Date` | Required, TTL index (`expireAfterSeconds: 0`) | — | 24 hours after a registration; 1 hour after a reset request | `"2026-11-23T09:00:00.000Z"` |
| `attempts` | `Number` | Min 0 | `0` | `verify-email` only. Wrong passwords at confirmation. The fifth deletes the document | `2` |
| `passwordHash` | `String` | Hidden by default (`select: false`) | `undefined` | `verify-email` only. The password's hash, made as `User.passwordHash` is ([0039](../decisions/0039-passwords-are-peppered-before-bcrypt.md)). Confirmation checks the password typed again against it, then moves it to the user | `"$2b$12$…"` |
| `name` | `String` | Trim, max 80 characters | `""` | `verify-email` only. The name typed at sign-up | `"สมชาย ใจดี"` |
| `notificationConsent` | `Boolean` | — | `false` | `verify-email` only. Consent to match emails (FR08), given on the form. It takes effect only once the address is confirmed | `false` |
| `createdAt`, `updatedAt` | `Date` | Auto managed | — | Timestamps | |

---

## 3. Example Document (MongoDB JSON)

```json
{
  "_id": { "$oid": "6740a1b2c3d4e5f6a7b8c9d0" },
  "purpose": "verify-email",
  "email": "somchai@example.co.th",
  "tokenHash": "3f0a5b…(64 hex characters)…c91e",
  "expiresAt": { "$date": "2026-11-23T09:00:00.000Z" },
  "attempts": 0,
  "passwordHash": "$2b$12$…",
  "name": "สมชาย ใจดี",
  "notificationConsent": false,
  "createdAt": { "$date": "2026-11-22T09:00:00.000Z" },
  "updatedAt": { "$date": "2026-11-22T09:00:00.000Z" }
}
```

---

## 4. Privacy

The collection holds personal data (an address, a name, a password hash) for at most a day per registration. Nobody has confirmed that the address belongs to the person who typed it, so nothing here may be used to contact anyone except by the one confirm email (PDPA). Expiry removes it without a job. A reset link holds only the address of an account that already exists, for an hour.
