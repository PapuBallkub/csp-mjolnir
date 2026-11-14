# Feature Specification: TOR Matching Notifications & In-App Alert Feed

**Feature:** Capability-based match notifications, PDPA email digests, and in-app alert feed  
**Related Requirements:**  
- `FR-12`: Profile capabilities and preferences (budget range, entity type, preferred archetypes, max portfolio, skills)  
- `FR-13`: Capability-based TOR match score calculation (ADR 0033)  
- `FR-14`: Email notification digest for new matching procurement notices (explicit opt-in consent)  
- `FR-18`: Alert users (in-app feed and email) when watchlisted TORs or matching opportunities are available  
- `NFR-15`: Thai is the primary locale — UI, notifications, and AI summaries  
**Related Decisions:**  
- [`0003 · Feature-based server layout`](../decisions/0003-feature-based-server-layout.md)  
- [`0012 · How the browser holds a session`](../decisions/0012-how-the-browser-holds-a-session.md)  
- [`0033 · Capability profile and match scoring`](../decisions/0033-capability-profile-and-match-scoring.md)  
- [`0036 · Thai-only interface`](../decisions/0036-thai-only-interface.md)  
**Status:** Built & Active  
**Last Updated:** 2026-11-14  

---

## 1. Overview & Objective

Small tech companies and freelancers cannot afford to monitor hundreds of daily government procurement updates manually. GIPDP bridges this gap with two non-intrusive alert surfaces:

1. **In-App Notification Feed (`/notifications`):** A chronological inbox tracking matching opportunities, unread badges on the shell bell icon, and mark-as-read controls.
2. **Scheduled Email Match Digest:** Periodic plain-language email summaries delivering high-confidence matches directly to the user's inbox without overwhelming them.

### Privacy & Consent (PDPA)
Under Thai PDPA standards, email alerts are strictly **opt-in only**:
- Users must explicitly check the master toggle `"ยินยอมรับการแจ้งเตือนทางอีเมล (Email Notifications Consent)"` on `/profile`.
- `User.notificationConsent` defaults to `false`. When disabled, all email settings and dispatch mechanisms are withheld.
- Every email contains a tamper-proof, 1-click HMAC-signed unsubscribe link allowing instant revocation without signing in.

---

## 2. Architecture & Data Flow

```
[User Profile / Search] ───────┐
                               │
[TOR Ingestion & Extraction] ──┼──► evaluateUserCandidateMatches() (ADR 0033)
                               │             │
                               │             ▼
                               │   Notification De-Duplication Check
                               │             │
                               │             ▼
                               │   Notification Collection (MongoDB)
                               │             │
                    ┌──────────┴─────────────┴──────────┐
                    ▼                                   ▼
          In-App Feed (/api/notifications)     Scheduled Email Digest
          - Unread count & badge               - SMTP dispatch
          - Mark read / Mark all read          - Defanged tender titles
          - Links to TOR detail page           - 1-click HMAC unsubscribe
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

### Snapshot Shape for Match Notifications
```javascript
{
  projectId: "68049205582",
  projectTitle: "จ้างจัดทำระบบ...",
  agency: "สำนักงาน...",
  matchScore: 85,
  budget: 3200000,
  submissionDeadline: "2026-11-20T00:00:00.000Z",
  matchedSkills: ["React", "Node.js"],
  matchedArchetypes: ["web-portal"],
  reasons: ["งบประมาณอยู่ในช่วงที่ระบุ", "ทักษะตรงกัน 2 รายการ"]
}
```

---

## 4. Match Generation & Triggers

Match notification generation uses the server-side matchmaker (`server/src/features/match/matchmaker.js`) adhering to **ADR 0033**:

1. **Proactive Generation:**
   - **Profile Save:** Whenever a user updates their profile on `/profile`, candidate matches meeting their `minScore` are immediately evaluated and staged.
   - **Feed Load:** When a user with zero past notifications opens `/notifications`, immediate matches are generated so the user sees immediate value.
2. **De-Duplication:**
   - [`find-notification-duplication.js`](../../server/src/features/notifications/creators/find-notification-duplication.js) verifies that a user is never notified twice for the same `projectId` unless a significant amendment occurs.
3. **Empty Skills Support:**
   - Users who specify budget range, preferred archetypes, or past contract limits without explicit technical skills (`skills: []`) are evaluated purely on those parameters rather than excluded.

---

## 5. Email Security & Anti-Phishing

Government procurement project titles frequently reference agency portals or external web links (e.g. `"จ้างจัดทำและปรับปรุงข้อมูลบนเว็บไซต์ www.boi.go.th"`).

### Autolink Defanging
When email clients (Gmail, Outlook, Apple Mail) render HTML, they automatically parse domain names and turn them into clickable hyperlinks. In untrusted tender titles, this poses phishing or navigation risks.

[`escapeAndDefang()`](../../server/src/features/notifications/templates/match-digest.template.js) solves this by:
1. Escaping raw HTML entities (`&`, `<`, `>`, `"`, `'`).
2. Defanging protocols: `http://` &rarr; `http&#8203;//`.
3. Inserting zero-width spaces (`&#8203;.&#8203;`) around **every** dot between alphanumeric characters (neutralizing both single- and multi-level TLDs like `.go.th`).
4. Applying strict CSS (`.no-autolink a { color: inherit !important; text-decoration: none !important; pointer-events: none !important; }`).

To the human eye, `"www.boi.go.th"` looks completely natural, but mail user agents treat it as plain text and will not autolink it.

---

## 6. API Reference

All routes require user authentication via cookie (`requireAuth`), except the unsubscribe handler:

| Method | Endpoint | Handler | Description |
|---|---|---|---|
| `GET` | `/api/notifications` | `getNotificationFeed` | Returns `{ notifications, unreadCount }` sorted newest first. |
| `PUT` | `/api/notifications/:id/read` | `markNotificationRead` | Marks a single notification as read (`isRead: true`). |
| `PUT` | `/api/notifications/read-all` | `markAllNotificationsRead` | Marks all active notifications for the current user as read. |
| `GET` | `/api/notifications/unsubscribe?token=...` | `handle1ClickUnsubscribe` | Validates HMAC token and sets `notificationConsent = false`. |

---

## 7. Verification & Testing

### 7.1 Automated Tests

Run unit tests from the project root:

```powershell
# Client tests (profile display, preferences, match ranking)
npm --prefix client test

# Server tests (defanging, HMAC tokens, snapshot formatting, matchmaker)
$env:MONGO_URI="mongodb://localhost:27017/test"; $env:JWT_SECRET="testjwtsecret"; node --test "server/test/notifications.test.js" "server/test/matchmaker.test.js"
```

### 7.2 CLI & NPM Commands

This feature adds dedicated scripts in `server/package.json` for batch evaluation, scheduled cron jobs, and manual testing:

| Command | Script | Description |
|---|---|---|
| `npm run notify` | `server/scripts/notify.js` (or `--stage`) | Evaluates active TORs against user profiles and stages new in-app notifications in MongoDB. |
| `npm run notify:send` | `server/scripts/notify.js --send` | Scans for pending unstaged match emails and dispatches email digests to users with `notificationConsent: true`. |
| `npm run notify:all` | `server/scripts/notify.js --all` | Runs both staging and email dispatch in a single pass (scheduled daily cron at 08:00 AM). |
| `npm run test:notify` | `server/scripts/test-notify.js <email>` | One-shot end-to-end test runner: prepares test user, stages matches, and dispatches a live email via SMTP to verify formatting and anti-autolinking. |

### 7.3 How to Test by Hand (Step-by-Step)

#### Step 1: Configure PDPA Consent and Profile
1. Start the services:
   ```powershell
   docker compose up -d mongo
   npm --prefix server run dev
   npm --prefix client run dev
   ```
2. Open `http://localhost:3000/profile?edit=true` and sign in.
3. Scroll to **ส่วนที่ 7: การตั้งค่าการแจ้งเตือน (Notifications & Alerts)**:
   - Notice that notification preference sub-cards are hidden when `"ยินยอมรับการแจ้งเตือนทางอีเมล"` is unticked.
   - Toggle **ยินยอมรับการแจ้งเตือนทางอีเมล (Notification Consent)** to **เปิด (ON)**.
   - The TOR Matching notification preferences immediately appear.
4. Set preferences:
   - Budget range: e.g. ฿0 - ฿10,000,000
   - Preferred archetypes: select `web-portal` and `mobile-app`
   - Minimum match score: e.g. `50%`
5. Click **บันทึกโปรไฟล์ (Save Profile)**. Proactive match evaluation immediately runs in the background.

#### Step 2: Verify In-App Notification Feed & Unread Badge
1. Observe the top navigation header: the notification bell icon updates with an unread badge counter.
2. Click the bell or navigate to `http://localhost:3000/notifications`:
   - Matching TORs above your score threshold (≥ 50%) are displayed in the feed.
   - Cards display match percentage, project title, agency, and formatted Thai budget.
3. Click a notification card to view the single notification view (`/notifications/[id]`), which automatically marks it as read.
4. Click **"ทำเครื่องหมายอ่านแล้วทั้งหมด"** on `/notifications`: verify the unread badge resets to zero.

#### Step 3: Test Real Email Digest & Autolink Neutralization
1. Ensure SMTP credentials exist in `server/.env` (e.g. `SMTP_USER` and `SMTP_PASS`).
2. Run the manual test runner:
   ```powershell
   node server/scripts/test-notify.js your_email@gmail.com
   ```
3. Open the incoming email in Gmail, Outlook, or webmail:
   - Verify project cards render with match badges, agency, and formatted budget.
   - Inspect any tender title containing URLs/domains (e.g. `www.boi.go.th`): verify that the domain name renders as regular readable text **without** being turned into an underline blue hyperlink.
   - Inspect the footer: verify the presence of the 1-click unsubscribe link.

#### Step 4: Verify 1-Click PDPA Unsubscribe
1. In the received test email, click the unsubscribe link (**"ยกเลิกการรับการแจ้งเตือนนี้"**).
2. The browser navigates to `/api/notifications/unsubscribe?token=...`.
3. Verify that the response confirms successful opt-out and sets `notificationConsent = false` in the database.
4. Reload `http://localhost:3000/profile`: confirm that notification consent is now switched off and matching alerts are stopped.

