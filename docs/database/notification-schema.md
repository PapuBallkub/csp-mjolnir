# Data Dictionary & Schema Specification: `Notification`

**File:** `server/src/models/notification.model.js`
**Model Name:** `Notification`
**Collection Name:** `notifications`
**Related Documents:** [0003 · Feature-based server layout](../decisions/0003-feature-based-server-layout.md), [User Schema](./user-schema.md), [Requirements](../requirements.md) (`FR-13`, `FR-14`, `FR-16`, `FR-18`)
**Status:** Active

---

## 1. Overview

Stores immutable in-app notification event logs for a user, along with read state and email-digest dispatch state. Each notification freezes a polymorphic `snapshot` payload at creation time so historical alerts stay stable even if the underlying `Tor` or `TorInsight` changes later.

### Who writes it

- **`features/notifications/creators/match-notification.service.js`:** Creates `type: 'match'` documents with `matchedItems` snapshots for users whose profile matches active TORs, and updates `emailSent` / `emailSkipped` / `emailSentAt` after digest dispatch.
- **`features/notifications/creators/watchlist-notification.service.js`:** Creates `type: 'amendment'`, `type: 'status_change'`, and `type: 'deadline'` documents for watchlisted TORs, and updates email dispatch state.
- **`features/notifications/notification-feed.service.js`:** Updates `isRead` and `readAt` when a user opens a notification, dismisses it, or marks all as read.

### Who reads it

- **`features/notifications/notification-feed.service.js`:** Lists a user's notifications newest-first, fetches a single notification by `_id` + `userId`, and computes `unreadCount`.
- **`features/notifications/creators/find-notification-duplication.js`:** Reads recent `snapshot` payloads (30-day lookback by default) to avoid sending duplicate alerts for the same `projectId`.
- **`features/notifications/creators/match-notification.service.js` & `watchlist-notification.service.js`:** Reads staged notifications (`emailSent: false`, `emailSkipped: false`) when dispatching scheduled email digests.

---

## 2. Schema Fields & Constraints

| Field | Type | Constraints / Indexes | Default | Description | Example |
|---|---|---|---|---|---|
| `userId` | `ObjectId` | Required, ref `'User'`, indexed | — | Recipient user account | `"6740a1b2c3d4e5f6a7b8c9d0"` |
| `type` | `String` | Required, enum `['match', 'amendment', 'deadline', 'status_change']` | — | Notification category (`FR-13`, `FR-14`, `FR-16`, `FR-18`) | `"match"` |
| `snapshot` | `Mixed` | Required | — | Immutable event payload shaped by `type` (see §3) | `{ "matchedItems": [...] }` |
| `isRead` | `Boolean` | Indexed | `false` | Whether the user has read/dismissed this notification in-app | `false` |
| `readAt` | `Date` | — | `null` | Timestamp when the notification was marked read | `"2026-11-25T09:15:00.000Z"` |
| `emailSent` | `Boolean` | Indexed | `false` | `true` once the notification has been delivered in an email digest | `false` |
| `emailSkipped` | `Boolean` | Indexed | `false` | `true` if email delivery was skipped (e.g. missing consent, unconfigured SMTP) | `false` |
| `emailSentAt` | `Date` | — | `null` | Timestamp when the email digest was sent | `null` |
| `createdAt`, `updatedAt` | `Date` | Auto-managed (`timestamps: true`) | — | Creation and last-update timestamps | `"2026-11-25T01:00:00.000Z"` |

### Indexes

- **Single-field indexes:** `userId`, `isRead`, `emailSent`, `emailSkipped`
- **Compound index:** `{ userId: 1, isRead: 1, createdAt: -1 }` — supports fast `unreadCount` lookups and chronological per-user notification feed queries.

---

## 3. Polymorphic `snapshot` Payloads

`snapshot` uses `mongoose.Schema.Types.Mixed` so each `type` stores only its own fields without unused `null` columns.

### 3.1 `type: 'match'` (`buildMatchSnapshot`)

```json
{
  "matchedItems": [
    {
      "projectId": "68019139367",
      "projectTitle": "ประกวดราคาจ้างพัฒนาระบบสารสนเทศ...",
      "agency": "กรม...",
      "budget": 1850000,
      "matchScore": 86,
      "matchedSkills": ["React", "Node.js", "PostgreSQL"],
      "submissionDeadline": "2026-12-10T09:00:00.000Z"
    }
  ]
}
```

### 3.2 `type: 'amendment'` (`buildAmendmentSnapshot`)

```json
{
  "projectId": "68019139367",
  "projectTitle": "ประกวดราคาจ้างพัฒนาระบบสารสนเทศ...",
  "agency": "กรม...",
  "budget": 1850000,
  "amendmentHeadline": "ประกาศแก้ไขเปลี่ยนแปลงเงื่อนไขหรือเอกสาร TOR",
  "changedFields": ["facts.submissionDeadline"],
  "changedFieldsTh": ["วันยื่นข้อเสนอ"],
  "detectedAt": "2026-11-24T10:30:00.000Z"
}
```

### 3.3 `type: 'status_change'` (`buildStatusSnapshot`)

```json
{
  "projectId": "68019139367",
  "projectTitle": "ประกวดราคาจ้างพัฒนาระบบสารสนเทศ...",
  "agency": "กรม...",
  "budget": 1850000,
  "previousStatus": "Open",
  "newStatus": "Awarded",
  "changedAt": "2026-11-25T08:00:00.000Z"
}
```

### 3.4 `type: 'deadline'` (`buildDeadlineSnapshot`)

```json
{
  "projectId": "68019139367",
  "projectTitle": "ประกวดราคาจ้างพัฒนาระบบสารสนเทศ...",
  "agency": "กรม...",
  "budget": 1850000,
  "deadlineType": "submission",
  "deadlineDate": "2026-11-28T09:00:00.000Z",
  "daysRemaining": 3
}
```

---

## 4. Example Document (MongoDB JSON)

```json
{
  "_id": { "$oid": "67441a2b3c4d5e6f7a8b9c0d" },
  "userId": { "$oid": "6740a1b2c3d4e5f6a7b8c9d0" },
  "type": "deadline",
  "snapshot": {
    "projectId": "68019139367",
    "projectTitle": "ประกวดราคาจ้างพัฒนาระบบสารสนเทศ...",
    "agency": "กรม...",
    "budget": 1850000,
    "deadlineType": "submission",
    "deadlineDate": { "$date": "2026-11-28T09:00:00.000Z" },
    "daysRemaining": 3
  },
  "isRead": false,
  "readAt": null,
  "emailSent": false,
  "emailSkipped": false,
  "emailSentAt": null,
  "createdAt": { "$date": "2026-11-25T01:00:00.000Z" },
  "updatedAt": { "$date": "2026-11-25T01:00:00.000Z" }
}
```
