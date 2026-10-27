# Feature Specification: Watchlist, Changed Since You Saved

**Feature:** Telling a reader which of their saved TORs changed after they saved them  
**Related Requirements:**  
- `FR-16`: Diff an amended TOR and summarize what changed  
- `FR-17`: Users save TORs to a personal watchlist  
- `FR-18`: Alert users, in-app or by email, when a watchlisted TOR changes status or is amended  
- `NFR-07`: Roll a TOR back when an amendment was processed wrongly  
**Related Decisions:**  
- [`0031 · Keep the summary a change replaces`](../decisions/0031-keep-the-summary-a-change-replaces.md)  
- [`0032 · Record what changed in a TOR`](../decisions/0032-record-what-changed-in-a-tor.md)  
**Status:** Ready to build. The data, the API fields and the helpers are in place; the watchlist UI is not.  
**Last Updated:** 2026-10-26  

---

## 1. Overview

A reader saves a TOR, then the agency changes it: a new bid deadline, a new
ราคากลาง, a new TOR file. The watchlist should say so, and only for changes
the reader hasn't seen, that is, changes found **after** they saved it.

| Piece | State |
|---|---|
| Recording each change (`Tor.amendments`, `Tor.lastChangeAt`) | Done ([0032](../decisions/0032-record-what-changed-in-a-tor.md)) |
| `GET /api/watchlist` returns `savedAt`, `lastChangeAt` and `latestChange` | Done |
| The change marker on every catalog row, watchlist rows included (`ChangeMarker`) | Done |
| The detail page's banner and change history (`/tor/{id}#changes`) | Done |
| Helpers `changedSinceSaved()` and `changedFields()` | Done and tested, not used yet |
| **The watchlist alert, "changed since you saved"** | **To build** (§5) |
| A dismissal that survives a reload | To build; needs one stored field (§7.1) |
| In-app and email notices | Later, FR-18 (§8) |

**Replace the current alert.** `client/app/(app)/(private)/watchlist/page.tsx`
shows "TOR มีการออกเอกสารแก้ไขประกาศหรือเงื่อนไข" whenever
`amendmentInfo.isAmended` is true. That misses most changes and repeats old ones:

1. `isAmended` only knows changes the agency announced (e-GP code `D2`). The
   feed has not sent one `D2` in over a thousand polls; the changes we do see
   are found by the platform (§2).
2. It ignores when the reader saved the TOR, so a TOR amended long before it
   was saved alerts forever.

---

## 2. Where a change comes from

Every change, whatever its source, is one entry in `Tor.amendments[]`:

| `source` | Meaning | Written by | When |
|---|---|---|---|
| `feed` | The agency announced a changed invitation (`D2`) | the feed poll (`process3`) | 08:00 and 17:05 polls |
| `package` | e-GP's documents differ from the ones we saved: a new package in the same stage with a different TOR file, ราคากลาง, budget or bid deadline. The platform's inference, not an announcement | the download step, for a TOR the nightly recheck or a new notice flagged | mostly the 22:00 job, after its recheck; also each poll's download |

**Not a change:** a draft becoming an invitation (`B0` → `D0`) is the next
stage; a new package with the same contents is recorded, but isn't a change.

```
feed poll (D2 in the feed) ───────┐
download (a package that differs) ┼──► Tor.amendments[] + Tor.lastChangeAt
admin rollback (NFR-07) ──────────┘                       │
                                                          ▼
PUT /api/watchlist/:id ──► User.watchlist[].savedAt ──► GET /api/watchlist ──► watchlist page
```

- **`lastChangeAt` is when we found the change**, the entry's `detectedAt`,
  not the date printed on the notice. §4 explains why that is the right clock.
- **A rollback** marks entries `rolledBack: true` and moves `lastChangeAt`
  back to the latest change still standing, or to null. Rolled-back entries
  never reach the API.

---

## 3. The data you get

`GET /api/watchlist` (signed in) answers `{ tors: WatchlistItem[], savedIds: string[] }`,
newest save first. Each item is the same summary a catalog row gets from
`/api/tors` (live status, live facts, `latestAnnouncement`, `contractSigned`),
plus:

| Field | Type | Meaning |
|---|---|---|
| `savedAt` | ISO string | When the reader saved it. Saving again changes nothing; removing it and saving again resets it |
| `lastChangeAt` | ISO string or null | When the latest standing change was found. null: no change known |
| `latestChange` | object or null | The latest change not rolled back |
| `latestChange.source` | `"feed"` or `"package"` | §2 |
| `latestChange.date` | ISO string or null | The date the notice or the documents state; null when neither says |
| `latestChange.detectedAt` | ISO string or null | When we found it |
| `latestChange.previousCheckAt` | ISO string or null | The last check before that found nothing new: a found change happened between the two |
| `latestChange.fields` | string[] | What changed, each field once (§3.1) |

The type is `WatchlistItem` in `client/app/_lib/api.ts`. An item, trimmed:

```json
{
  "projectId": "69099324161",
  "identification": { "titleTh": "โครงการจ้างบริการบำรุงรักษา…", "status": "Open" },
  "facts": { "referencePriceTHB": 4952350, "submissionDeadline": "2026-10-29T03:00:00.000Z" },
  "savedAt": "2026-10-20T02:00:00.000Z",
  "lastChangeAt": "2026-10-25T15:05:00.000Z",
  "latestChange": {
    "source": "package",
    "date": null,
    "detectedAt": "2026-10-25T15:05:00.000Z",
    "previousCheckAt": "2026-10-21T15:03:00.000Z",
    "fields": ["document", "facts.referencePriceTHB"]
  }
}
```

### 3.1 Field keys

| Key | Thai | English |
|---|---|---|
| `document` | เอกสาร TOR | TOR document |
| `facts.submissionDeadline` | วันยื่นข้อเสนอ | Bid deadline |
| `facts.referencePriceTHB` | ราคากลาง | Reference price |
| `facts.budgetTHB` | วงเงินงบประมาณ | Budget |
| `facts.deliveryPeriodDays` | ระยะเวลาส่งมอบ | Delivery period |
| `facts.contractDurationDays` | ระยะเวลาสัญญา | Contract duration |
| `facts.warrantyYears` | ระยะเวลารับประกัน | Warranty |
| `eligibility.previousExperienceMinTHB` | ผลงานในอดีตขั้นต่ำ | Minimum prior contract |
| `technicalRequirements.requiredTechnologies` | เทคโนโลยีที่กำหนด | Required technologies |
| `eligibility.standardConditions` | (not shown) | (not shown) |

`changedFields(fields, lang)` turns the keys into one line, "ราคากลาง, วันยื่นข้อเสนอ".
It leaves out `eligibility.standardConditions`, because the page never shows
that list, and any key it doesn't know.

The facts rows (deadline, ราคากลาง, budget) are there as soon as the package
is downloaded. The summary's rows (technologies, delivery period, …) are
added once the new TOR has been read again, usually the same night.

### 3.2 The full history

`GET /api/tors/{id}` has `amendments[]`, every standing change, oldest first,
each with its rows (`changes[{ kind, field, before, after }]`), both e-GP
packages (`zipId`, `previousZipId`) and `rereadPending` (the summary on the
page predates it). Section 12 of the detail page already shows all of it, so
for most needs linking to **`/tor/{id}#changes`** is enough.

---

## 4. The rule

> **Changed since you saved** = `lastChangeAt` is later than `savedAt`.
> Helper: `changedSinceSaved(tor)`.

| Story | Alert? |
|---|---|
| Saved 20 Oct; a change found 25 Oct | **Yes** |
| A change found 24 Oct; saved 25 Oct. The reader saw the changed version | No |
| The agency dated a `D2` 23 Oct; the reader saved it 24 Oct 09:00; our poll received it 24 Oct 17:05 | **Yes.** The reader may have read the version before the change reached us. Comparing with the notice's `date` would hide it |
| The change is rolled back | Goes away, unless an earlier standing change was also found after the save |
| The reader removes it and saves it again | Goes away (`savedAt` resets) |
| Demo data, or a summary with no Tor | Never (`lastChangeAt` is null) |
| Amended before changes were recorded (`isAmended`, no entries) | Never. The row's marker still shows it |

---

## 5. Suggested UI

**Which TORs:** draft and open ones (`!isDead(status)`), as the page's alerts
do today. A change to a closed, awarded or cancelled TOR rarely matters to a
bidder, and the row's marker still shows it. Your call.

**One alert per TOR**, matching the row's marker in look and words, so colour
is never the only difference:

| `latestChange.source` | Container classes | Thai | English |
|---|---|---|---|
| `feed` | `border-amend-line bg-amend-bg text-amend` | หน่วยงานประกาศแก้ไขหลังจากคุณบันทึก | The agency announced a change after you saved it. |
| `package` | `border-dashed border-closed-line bg-surface text-ink-2` (muted and dashed, like Closed) | พบการแก้ไขเอกสารบน e-GP หลังจากคุณบันทึก | We found a change to the documents on e-GP after you saved it. |

- A second line when `changedFields()` isn't empty: "เปลี่ยน: ราคากลาง, วันยื่นข้อเสนอ" / "Changed: …".
- Link to `/tor/{id}#changes`.
- **Describe, don't accuse:** say what changed and when, never why. "พบ"
  (found) marks the platform's inference; keep "แก้ไขแล้ว" for the agency's own notice.

A sketch, in the page's existing `alerts` memo:

```tsx
import type { WatchlistItem } from "../../../_lib/api";
import { changedFields, changedSinceSaved } from "../../../_lib/changes";

const [tors, setTors] = useState<WatchlistItem[]>([]); // typed with savedAt

for (const tor of activeTors) {
  if (changedSinceSaved(tor) && tor.latestChange) {
    const announced = tor.latestChange.source === "feed";
    list.push({
      projectId: tor.projectId,
      kind: announced ? "announced" : "found",
      title,
      message: announced
        ? { th: "หน่วยงานประกาศแก้ไขหลังจากคุณบันทึก", en: "The agency announced a change after you saved it." }
        : { th: "พบการแก้ไขเอกสารบน e-GP หลังจากคุณบันทึก", en: "We found a change to the documents on e-GP after you saved it." },
      detail: changedFields(tor.latestChange.fields, lang) || undefined,
    });
  }
}
```

---

## 6. Ready-made pieces

| Import | From | What it does |
|---|---|---|
| `changedSinceSaved(tor)` | `client/app/_lib/changes.ts` | The rule in §4 |
| `changedFields(fields, lang)` | `client/app/_lib/changes.ts` | The changed fields' names, one line |
| `CHANGE_SOURCE[source]` | `client/app/_lib/changes.ts` | The marker's words: `marker`, `hint` (tooltip), `by` ("หน่วยงานประกาศผ่าน e-GP") |
| `markerSource(tor, saysChanged)` | `client/app/_lib/changes.ts` | Which marker a row shows, if any |
| `ChangeMarker` | `client/app/_components/verdict.tsx` | The marker itself, both looks |
| `WatchlistItem`, `LatestChange` | `client/app/_lib/api.ts` | Types |

Their tests are in `client/test/changes.test.ts`.

---

## 7. What needs storage (not built)

### 7.1 A dismissal that sticks

"รับทราบ" is page state: a reload brings the alert back, and the rule stays
true until the reader saves the TOR again. Suggested:

- `User.watchlist[].seenChangeAt: Date`, null by default.
- `PUT /api/watchlist/:id/seen` sets it to the item's current `lastChangeAt`,
  read on the server, not the browser's clock.
- The rule becomes: `lastChangeAt` later than both `savedAt` and `seenChangeAt`.

A newer change brings the alert back by itself. One field, no new collection.

### 7.2 Every change since the save

`latestChange.fields` belongs to the latest change only. When two changes
were found after the save, the line names the newer one's fields. The simplest
answer is the `#changes` link (§3.2). If the watchlist should count them, the
server can add, per item, the number of standing entries with `detectedAt`
later than `savedAt`.

---

## 8. Notices (FR-18), later

The same rule drives notices: one per change entry, for each reader who saved
the TOR before the entry's `detectedAt`. In-app first. Email needs explicit
consent: off by default and easy to withdraw (PDPA).

FR-18 also covers **status** changes (Open → Awarded, Cancelled). Those are
not in `amendments`. A status comes from the feed's codes, and each code's
arrival is stored in `Tor.announcementHistory[]` (`code`, `receivedAt`), which
gives the same "after `savedAt`" comparison. Closed is the platform's
inference from the deadline, with no event behind it.

---

## 9. Testing

- **Server:** `server/test/watchlist.test.js`, "a saved TOR says when it was
  saved and what changed last", saves a TOR, then gives its Tor a later
  `lastChangeAt` and one entry. Copy that shape for new cases.
- **Client:** the helpers' tests are in `client/test/changes.test.ts`.
- **By hand:** no real change has been recorded yet (as of 2026-10-26). Make
  one in a **separate database** (`connectDatabase({ dbName })`), never in the
  shared data. In `mongosh`, on that database:

```js
db.tors.updateOne({ projectId: '69099324161' }, { $set: {
  lastChangeAt: new Date('2026-10-25T22:05:00+07:00'),
  amendments: [{
    source: 'package', stage: 'invitation', rolledBack: false, diff: 'facts',
    detectedAt: new Date('2026-10-25T22:05:00+07:00'),
    previousCheckAt: new Date('2026-10-21T22:03:00+07:00'),
    changes: [{ kind: 'changed', field: 'facts.referencePriceTHB', before: '5213000', after: '4952350' }],
  }],
} });
// Saved before the change
db.users.updateOne({ email: 'you@example.test' }, { $set: { 'watchlist.$[].savedAt': new Date('2026-10-20T09:00:00+07:00') } });
```
