# Feature Specification: In-App Notification Feed & Email Alerts (FR-14, FR-18)

**Feature:** Capability-based match notifications, watchlisted TOR alerts (status changes, amendments, approaching deadlines), PDPA email digests, and unified in-app notification feed.  
**Related Requirements:**  
- `FR-12`: Profile capabilities and preferences (budget range, entity type, preferred archetypes, max portfolio, skills, `deadlineNoticeDays`)  
- `FR-13`: Capability-based TOR match score calculation (ADR 0033)  
- `FR-14`: Email notification digest for new matching procurement notices (explicit opt-in consent)  
- `FR-17`: Personal watchlist of saved procurement notices with `savedAt` and `savedStatus`  
- `FR-18`: Alert users (in-app feed and email) when watchlisted TORs change status, are amended, or approach submission deadlines  
- `NFR-15`: Thai is the primary locale — UI, notifications, and AI summaries  
**Related Decisions:**  
- [`0003 · Feature-based server layout`](../decisions/0003-feature-based-server-layout.md)  
- [`0012 · How the browser holds a session`](../decisions/0012-how-the-browser-holds-a-session.md)  
- [`0031 · Keep the summary a change replaces`](../decisions/0031-keep-the-summary-a-change-replaces.md)  
- [`0032 · Record what changed in a TOR`](../decisions/0032-record-what-changed-in-a-tor.md)  
- [`0033 · Capability profile and match scoring`](../decisions/0033-capability-profile-and-match-scoring.md)  
- [`0036 · Thai-only interface`](../decisions/0036-thai-only-interface.md)  
**Status:** Active  
**Last Updated:** 2026-11-18  

---

## 1. Overview & Objective

Small tech companies and freelance developers cannot afford to monitor hundreds of daily Thai government procurement portals manually. GIPDP bridges this gap with two non-intrusive alert surfaces:

1. **In-App Notification Feed (`/notifications` & `/notifications/[id]`):** A unified notification center tracking matching opportunities and watchlisted project updates (amendments, status changes, deadline warnings), unread badge counts on the shell bell icon, type filtering, and polymorphic detail views.
2. **Scheduled Email Digest:** Periodic plain-language email summaries delivering high-confidence matches and watchlist digests directly to the user's inbox without overwhelming them.

### Privacy & Consent (PDPA)
Under Thai PDPA standards, email alerts are strictly **opt-in only**:
- Users must explicitly check the master toggle `"ยินยอมรับการแจ้งเตือนทางอีเมล (Notification Consent)"` on `/profile`.
- `User.notificationConsent` defaults to `false`. When disabled, all email dispatches are withheld.
- Every email contains a tamper-proof, 1-click HMAC-signed unsubscribe link allowing instant revocation without signing in.
  - The HMAC key is derived from `JWT_SECRET` with HKDF (label `gipdp:unsubscribe:v1`, `email.service.js`), never `JWT_SECRET` itself, so the session key and the unsubscribe key are separate ([0004](../decisions/0004-sessions-as-signed-cookies.md)).
  - Rotating `JWT_SECRET`, or changing the label, breaks every link already sent.

---

## 2. Architecture & Data Flow

```
[User Watchlist / Profile] ──────┐
                                 │
[Live TORs & TorInsights] ───────┼──► Ingestion & Watchlist Evaluator
                                 │      │
                                 │      ├── 1. Status Change Check (savedStatus vs live status)
                                 │      ├── 2. Amendment Check (Tor.lastChangeAt > savedAt)
                                 │      └── 3. Deadline Check (daysRemaining <= userNoticeDays & milestones)
                                 │      │
                                 │      ▼
                                 │    De-Duplication & Daily Rollup (Consolidation)
                                 │      │
                                 │      ▼
                                 │    Notification Collection (MongoDB)
                                 │      │
                      ┌──────────┴──────┴──────────────────┐
                      ▼                                    ▼
            In-App Feed (/notifications)          Scheduled Email Digest
            - /notifications (Filtered Feed)      - 08:00 AM daily cron
            - /notifications/[id] (Detail View)   - Plain Thai digests
            - Bell badge & mark-all-read          - 1-click HMAC unsubscribe
```

---

## 3. Data Model (`Notification`)

Defined in [`server/src/models/notification.model.js`](../../server/src/models/notification.model.js), the `Notification` collection stores immutable event records:

| Field | Type | Description |
|---|---|---|
| `userId` | `ObjectId` (ref: `User`) | Recipient user account (indexed). |
| `type` | `String` | `'match'`, `'amendment'`, `'deadline'`, or `'status_change'`. |
| `snapshot` | `Mixed` | Self-contained, immutable payload (no joins required to render past alerts). |
| `isRead` | `Boolean` | Read state for in-app feed and shell bell badge (indexed). |
| `readAt` | `Date` | Timestamp when user marked the notification as read. |
| `emailSent` | `Boolean` | Staging/dispatch flag to prevent duplicate email transmissions (indexed). |
| `emailSkipped` | `Boolean` | Set to `true` if user opted out or lacked consent during digest run. |
| `emailSentAt` | `Date` | Dispatch timestamp for email logs. |

### 3.1 Polymorphic Snapshot Schemas

Each notification stores an immutable snapshot so past alerts remain faithful to their state at the time of alerting, even if live documents change later:

#### 1. Profile Match (`type: 'match'`)
```javascript
{
  projectId: "68049205582",
  projectTitle: "จ้างจัดทำระบบ...",
  agency: "สำนักงาน...",
  matchScore: 85,
  budget: 3200000,
  submissionDeadline: "2026-11-20T00:00:00.000Z",
  matchedSkills: ["React", "Node.js"],
  matchedItems: [ /* list of matched TOR items in this digest */ ]
}
```

#### 2. Status Change (`type: 'status_change'`)
```javascript
{
  projectId: "69099324161",
  projectTitle: "โครงการจัดซื้อระบบเครือข่าย",
  agency: "กรมการปกครอง",
  budget: 12000000,
  previousStatus: "Open",
  newStatus: "Awarded",
  changedAt: "2026-11-18T10:00:00.000Z",
  items: [ /* rolled up items if multiple projects changed on same day */ ]
}
```

#### 3. TOR Amendment (`type: 'amendment'`)
```javascript
{
  projectId: "69099324161",
  projectTitle: "โครงการพัฒนาระบบคลังข้อมูลสถิติ",
  agency: "สำนักงานสถิติแห่งชาติ",
  budget: 4952350,
  amendmentHeadline: "ประกาศแก้ไขครั้งที่ 1: แก้ไขราคากลางและวันยื่นข้อเสนอ",
  changedFields: ["facts.referencePriceTHB", "facts.submissionDeadline"],
  changedFieldsTh: ["ราคากลาง", "วันยื่นข้อเสนอ"],
  detectedAt: "2026-11-18T15:05:00.000Z",
  items: [ /* rolled up items if multiple projects amended on same day */ ]
}
```

#### 4. Approaching Deadline (`type: 'deadline'`)
```javascript
{
  projectId: "69099324161",
  projectTitle: "จ้างพัฒนาระบบคลาวด์กลาง",
  agency: "กรมการแพทย์",
  budget: 15500000,
  deadlineType: "submission", // or 'comment' for Drafts
  deadlineDate: "2026-11-21T09:30:00.000Z",
  daysRemaining: 3,
  items: [ /* rolled up items if multiple projects approaching deadline */ ]
}
```

---

## 4. Match Notification Engine (FR-14)

Implemented in [`server/src/features/notifications/creators/match-notification.service.js`](../../server/src/features/notifications/creators/match-notification.service.js), this service pairs live procurement tenders against user capability profiles:

### 4.1 Evaluation & Triggers
- **Score Threshold**: Only tenders meeting or exceeding the user's configured `profile.matchNotification.minScore` (e.g. $\ge 75\%$) are eligible.
- **Triggers**:
  1. **Proactive Trigger (Profile Update)**: When a user updates their profile on `/profile` with active consent and enabled alerts, candidate matches are immediately evaluated and staged in the background.
  2. **Scheduled Batch Cycle**: Runs during the scheduled morning notification pass (08:00 AM) evaluating active invitations (`Open`) and draft hearings (`Draft`).
- **Empty Skills Tolerance**: If a user specifies budget range or preferred archetypes without explicit technical skills (`skills: []`), the matchmaker evaluates on non-skill parameters rather than dropping the user.

### 4.2 Match De-Duplication Mechanics
To prevent users from receiving repetitive alerts for the same procurement opportunity:
- **Past Alert History (`getNotifiedProjectIds`)**: Before staging a match alert, the system queries past notifications of `type: 'match'` for that user in MongoDB.
- **ID Extraction (`extractNotifiedProjectIds`)**: It extracts all previously alerted project IDs across all past `snapshot.matchedItems` arrays into a set: `alreadyNotifiedIds`.
- **Filtering**: Candidate matches are filtered using `!alreadyNotifiedIds.has(pId)`.
- **Zero-Spam Guarantee**:
  - If all matching tenders were already included in a prior alert $\rightarrow$ **no notification is created** (0 duplicate spam).
  - Only when there is at least 1 **genuinely new** matching tender does the system package the fresh items into a new match digest notification.
  - Safe against rapid profile saves: clicking *"Save Profile"* multiple times only alerts on the initial pass since subsequent saves see the projects in `alreadyNotifiedIds`.

---

## 5. Watchlist Notification Engine (FR-18)

Implemented in [`server/src/features/notifications/creators/watchlist-notification.service.js`](../../server/src/features/notifications/creators/watchlist-notification.service.js), this service monitors user-watchlisted items against live TOR updates.

### 5.1 Status Change Detection
- **Baseline tracking**: When a user saves a TOR to their watchlist, `User.watchlist[].savedStatus` records the active status at that instant (`Draft`, `Open`, `Awarded`, `Closed`, `Cancelled`).
- **Trigger**: When the live status differs from `savedStatus` (e.g. `Open` $\rightarrow$ `Awarded`), a candidate status change alert is generated.
- **Deduplication**: Queried against `Notification` by `{ userId, type: 'status_change', 'snapshot.projectId': pId, 'snapshot.newStatus': newStatus }`. Only 1 alert is created per status transition.

### 5.2 Amendment Detection
- **Save timestamp guard**: When evaluating amendments, the system compares `Tor.lastChangeAt` (or `insight.amendmentInfo.lastAmendedDate`) against `watchlistItem.savedAt`.
- **Trigger**: Only amendments detected **after** the user bookmarked the item (`detectedAt > savedAt`) are alerted. Amendments that occurred prior to saving are completely ignored.
- **Deduplication**: Queried against `{ userId, type: 'amendment', 'snapshot.projectId': pId, 'snapshot.detectedAt': amendmentDetectedAt }`.

### 5.3 Approaching Deadline Warnings & Smart Reminders
- **Customizable Threshold (`profile.deadlineNoticeDays`)**: Users can configure their desired advance notice window (1 to 30 days, default: `3` days) on `/profile`.
- **Initial Catch-up Trigger ($\le$ userNoticeDays)**: If a newly watched project or freshly ingested project already has `daysRemaining <= userNoticeDays` (e.g. 20 days left under a 30-day window, or 4 days left after switching from 30 to 5 days), the system generates an initial alert right away rather than requiring an exact match.
- **Milestone Reminders (Prevents daily spam)**: After the initial alert, subsequent reminders fire only upon reaching natural milestone days (`7`, `3`, and `1` day before closing) that are strictly below their threshold. Non-milestone days are skipped so the user is never spammed daily.
- **Drafts support**: Evaluates `insight.facts.commentDeadline` for `Draft` projects, and `insight.facts.submissionDeadline` for active invitations (`Open`).

### 5.4 Daily Sum-Up Rollup (Digest Consolidation)
To prevent inbox flooding when agencies issue multiple updates or when a user tracks dozens of projects:
- Candidate alerts of the same notification type (`status_change`, `amendment`, or `deadline`) occurring on the same day are consolidated into **one single digest notification record**.
- If an unread digest already exists for today, new projects are merged into `snapshot.items` without generating additional clutter.

---

## 6. In-App Notification Feed & Detail Views

### 6.1 Feed View (`/notifications`)
- **Read Status Tabs (Left)**: Separate tabs for **ทั้งหมด (`All`)** and **ยังไม่อ่าน (`Unread`)** with live item count badges.
- **Type Filter Dropdown (Right)**: Dedicated dropdown control to isolate specific categories:
  - `ทุกประเภท` (All types)
  - `ตรงโปรไฟล์` (Profile Match)
  - `เปลี่ยนสถานะ` (Status Change)
  - `แก้ไขเอกสาร TOR` (TOR Amendment)
  - `ใกล้ปิดรับข้อเสนอ` (Approaching Deadline)
- **Mark All Read**: Instant 1-click confirmation modal to mark unread items as read (`/api/notifications/read-all`).
- **Standardized Copy**: Card titles follow the uniform `"พบ {N} โครงการ..."` pattern. Descriptions highlight meaningful attributes (e.g. matching technologies, modified document sections, target status, or countdown days) and explicitly avoid vanity metrics like "combined budget".

### 6.2 Detail Snapshot View (`/notifications/[id]`)
Adopted from the unified design specification:
1. **Top Summary Panel**: Displays type badge, creation timestamp, email status, large summary heading (`สรุป {N} โครงการ...`), subtitle, and `{N} โครงการ` count badge.
2. **Modular Project Panels**: Each project is rendered in its own self-contained card:
   - **Header Meta Row**: `[projectId] • [agency]` on left, formatted `฿[budget]` on right.
   - **Project Title**: High-contrast, bold Thai title.
   - **Themed Callout Box**:
     - *Status Change*: Previous status badge $\rightarrow$ New status badge with transition timestamp.
     - *Amendment*: Amber callout with summary headline, detection time, and modified section tags (`changedFieldsTh`).
     - *Deadline*: Orange callout with prominent remaining days countdown and deadline date/time.
     - *Match*: Open-green callout with match score percentage badge, closing date, and matched skill chips.
   - **Footer Link**: Direct right-aligned link `เปิดดูรายละเอียดโครงการ TOR ↗` navigating to `/tor/[projectId]`.
3. **Conditional Bottom Back Button**: Displays `"กลับหน้ารายการแจ้งเตือน"` at the bottom **only when there are 10 or more projects** ($N \ge 10$) to keep smaller notifications clean.

### 6.3 Notification Preferences Hierarchy (`/profile`)
To avoid toggle fatigue ($4 \text{ types} \times 2 \text{ channels} = 8 \text{ questions}$), channel delivery is unified under the master consent rather than duplicated per alert type:

1. **Master Consent & Delivery Channels (`Receive System Notifications`)**:
   - **PDPA Master Consent**: Toggle to enable/disable all outbound communications.
   - **In-App Feed & Bell**: Global switch to receive in-app notifications (covering matches, status updates, amendments, and deadlines).
   - **Email Digest**: Frequency selector (`daily` at 08:00 AM vs `weekly` on Mondays) for consolidated emails.
2. **Alert Criteria & Numerical Thresholds**:
   - **TOR Matching Criteria**: Minimum match score slider (`minScore`: 50%–95%).
   - **Watchlist & Deadlines Criteria**: Advance notice window slider (`deadlineNoticeDays`: 1–30 days).

---

## 7. Email Watchlist Digest Service

Implemented in [`server/src/features/notifications/email.service.js`](../../server/src/features/notifications/email.service.js) and [`server/src/features/notifications/templates/watchlist-digest.template.js`](../../server/src/features/notifications/templates/watchlist-digest.template.js):
- **Function**: `sendWatchlistDigestEmail({ user, alerts, stagedNotifications })`
- **Template**: `renderWatchlistDigestEmail({ recipientName, alerts, unsubscribeUrl, appUrl })`
- **Delivery**: Consolidates pending staged alerts for users with `notificationConsent: true`.
- **Themed Project Cards**:
  - *TOR Amendment*: Amber border (`#f59e0b`) showing modified sections and amended version.
  - *Status Change*: Blue border (`#3b82f6`) showing status transition box (`Previous -> New`).
  - *Approaching Deadline*: Orange border (`#f97316`) highlighting remaining days and submission deadline date.
- **Anti-Autolinking**: Neutralizes potential phishing URLs and domains in tender titles using `escapeAndDefang()`.
- **One-Click Unsubscribe**: Every email carries a signed HMAC token allowing instant opt-out.

---

## 8. API Reference

All routes require session cookie authentication (`requireAuth`), except the unsubscribe endpoint:

| Method | Endpoint | Handler | Description |
|---|---|---|---|
| `GET` | `/api/notifications` | `listUserNotifications` | Returns `{ notifications, unreadCount }` sorted newest first. |
| `GET` | `/api/notifications/:id` | `getNotificationById` | Returns `{ notification, unreadCount }` and automatically marks the item as read. |
| `PUT` | `/api/notifications/:id/read` | `markAsRead` | Marks an individual notification as read (`isRead: true`). |
| `PUT` | `/api/notifications/read-all` | `markAllAsRead` | Marks all active notifications for the current user as read. |
| `PATCH` | `/api/profile` | `updateProfile` | Updates profile including `deadlineNoticeDays` and proactively triggers notification evaluation. |
| `GET` | `/api/notifications/unsubscribe?token=...` | `handle1ClickUnsubscribe` | Validates HMAC token and revokes email consent (`notificationConsent = false`). |

---

## 9. Verification & CLI Commands

### 9.1 Automated Unit Tests
```powershell
# Client tests (profile display, preferences, match ranking, feed)
npm --prefix client test

# Server tests (watchlist notifications, thresholds, snapshots, email templates, defanging)
node --env-file=server/.env --test "server/test/watchlist-notifications.test.js" "server/test/notifications.test.js" "server/test/matchmaker.test.js"
```

### 9.2 CLI Commands
| Command | Script | Description |
|---|---|---|
| `npm run notify` | `server/scripts/notify.js` (or `--stage`) | Proactively evaluates active TORs against user profiles and watchlists, staging in-app notifications in MongoDB. |
| `npm run notify:send` | `server/scripts/notify.js --send` | Scans for pending unstaged match and watchlist notifications and dispatches email digests. |
| `npm run notify:all` | `server/scripts/notify.js --all` | Runs both staging and email dispatch in a single pass (scheduled daily cron at 08:00 AM). |
