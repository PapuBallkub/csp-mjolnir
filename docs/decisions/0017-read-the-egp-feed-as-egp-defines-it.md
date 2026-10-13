# 0017 · Read the e-GP feed the way e-GP defines it

Status: proposed · 2026-10-07 · corrects part of [0016](0016-pipeline-runs-are-safe-to-repeat.md)

## Context

The feed code and FR-02 were written from values "observed in production
feeds". On 2026-10-07 we checked them against กรมบัญชีกลาง's own manual,
"คู่มือการเชื่อมโยงประกาศจัดซื้อจัดจ้างจากระบบ e-GP ไปยังเว็บไซต์หน่วยงานของรัฐ
ในรูปแบบ RSS" (a copy is published at
`stock.rbru.ac.th/doc-download/manualRSS.pdf`), and against the live feed.
The pipeline had never read a single real item:

1. **The parameter is `anounceType`**, with one "n". We sent `announceType`,
   which the feed ignores; it then returns no items at all.
2. **The project id is in `description`**, written as
   `"69099615682, ประกวดราคาอิเล็กทรอนิกส์ (e-bidding), ประกาศเชิญชวน"`. The
   parser looked for it in `link` and `guid`, found nothing, and skipped
   every item.
3. **`D1` is a cancellation** (ยกเลิกประกาศเชิญชวน); `D2` is the change
   (เปลี่ยนแปลงประกาศเชิญชวน). FR-02, the docs and the code all called `D1` an
   amendment, so a cancelled project would have shown as Open and Amended.
4. **Winner announcements weren't fetched** (`W0`, `W1`, `W2`), so the feed
   could never award or cancel a project.
5. **The feed closes during office hours:** 09:00–12:00 and 13:00–17:00,
   Bangkok time (manual 4.5). A request then hangs until it times out. 0016
   read those timeouts as a dead feed. Outside those hours it answers in
   seconds.
6. **Each request returns the 20 latest items of its type,** topped up from
   up to 7 days back on a quiet day (manual 4.2).

The tests passed all along, because their XML was written to fit the parser,
not the feed.

## Decision

**The codes, and the status each one gives:**

| Code | e-GP's name | Status |
|---|---|---|
| `15` | ประกาศราคากลาง | No change |
| `B0` | ร่างเอกสารประกวดราคา (e-Bidding) และร่างเอกสารซื้อหรือจ้างด้วยวิธีสอบราคา | Draft |
| `D0` | ประกาศเชิญชวน | Open |
| `D2` | เปลี่ยนแปลงประกาศเชิญชวน | Open, and Amended |
| `D1` | ยกเลิกประกาศเชิญชวน | Cancelled |
| `W0` | ประกาศรายชื่อผู้ชนะการเสนอราคา / ประกาศผู้ได้รับการคัดเลือก | Awarded |
| `W2` | เปลี่ยนแปลงประกาศรายชื่อผู้ชนะการเสนอราคา | Awarded |
| `W1` | ยกเลิกประกาศรายชื่อผู้ชนะการเสนอราคา / ประกาศผู้ได้รับการคัดเลือก | Cancelled, until a new winner or invitation follows |

`P0` (แผนการจัดซื้อจัดจ้าง) isn't fetched: a plan has a plan id, not a
project id.

**The latest announcement decides.**
- "Latest" is by publish date. Items from the same day keep the order they
  were recorded in, and the codes are requested in lifecycle order, so a
  cancellation lands after its invitation.
- A new invitation after a cancellation opens the project again.
- A contract on data.go.th still means Awarded.
- `announceType` holds the latest code, so an older item seen again can't
  turn it back.

**Which items we keep.**
- Only `15`, `B0`, `D0` and `D2` can add a project we don't follow yet. A
  cancellation or a winner for a project we never saw is past data.
- The keyword and `--limit` apply to new projects only. A followed project
  always gets its updates, and every type is requested on every run.

**Reading the feed defensively.**
- Each item names its own type. One that doesn't match the code we asked for
  is reported and not saved; that check would have caught the misspelling.
- No requests during the closed hours. Fetch says the feed is closed.
- The test fixture is a recorded live response, in the feed's own
  Windows-874 bytes, not hand-written XML.
- `procurementMethod` is taken from the description. เฉพาะเจาะจง and
  คัดเลือก projects aren't open to every bidder.

## Consequences

- The pipeline can find open projects. Its first live read found one IT
  invitation (69109062251) among the 20 latest invitations.
- **Coverage is thin.** With 20 items per type per request, a national poll
  sees a small slice of each day: 1 of the 20 invitations on 2026-10-07 was
  IT. Wider coverage needs per-agency requests (`deptId`, 4 digits) or
  polling often within the open hours. That's open.
- The ราคากลาง (`15`) request timed out twice on 2026-10-07, while the other
  types answered in about 3 seconds.
- FR-02 in the SRS needs the same correction. `docs/requirements.md` notes it,
  and AGENTS.md now follows e-GP's codes.
- `W1` as Cancelled is the recommended reading, not yet confirmed by the team.
