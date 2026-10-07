# 0019 · Badges name e-GP's stage; deadlines say what they're for

Status: proposed · 2026-10-08

## Context

The catalog and the detail page showed one of five statuses and one deadline.
Both hid what a bidder needs to know:

- **"Cancelled" and "Awarded" are each several things.** A cancelled
  invitation (`D1`) and a cancelled award (`W1`) are both "Cancelled". A
  winner announced (`W0`), a winner changed (`W2`) and a signed contract are
  all "Awarded".
- **"5 days left" didn't say for what.** A draft out for public hearing
  (`B0`) asks for comments by a date and has no bid date yet; an invitation
  (`D0`) sets the date to submit bids. Extraction had one field,
  `submissionDeadline`, so a draft's comment date could land there and read
  as a bid deadline.

## Decision

**The badge keeps the five colours and names the stage.**
- The status still sets the colour and the glyph, so a dense list scans as
  before (open in colour, the rest in gray).
- The words come from e-GP's latest announcement: ร่าง TOR · รับฟังความเห็น,
  เปิดรับข้อเสนอ, เปลี่ยนแปลงประกาศเชิญชวน, ยกเลิกประกาศเชิญชวน, ประกาศผู้ชนะแล้ว,
  เปลี่ยนแปลงผู้ชนะ, ยกเลิกประกาศผู้ชนะ. A signed contract (data.go.th) says
  ลงนามสัญญาแล้ว. Closed says it's inferred from the deadline.
- The words never contradict the colour: a stage that disagrees with the
  status falls back to the status's own label.
- When the badge already says the invitation changed, the separate Amended
  flag isn't repeated.

**The API returns the stage.** `latestAnnouncement` (`{ code, publishedAt }`)
and `contractSigned`, read live from the `Tor` with the status (#179). Only a
TOR the e-GP feed announced has a latest announcement: an older record's
`announceType` is a guess.

**Two deadlines, never swapped (extract-v4).**
- `facts.commentDeadline`: a draft's last date for comments.
- `facts.submissionDeadline`: an invitation's last date for bids; null in a
  draft.
- A wrong comment date is a minor check failure: unlike a wrong bid date, it
  doesn't hide the TOR.

**The search filters use the same words.** The status filter keeps one group
per colour, named like its badges, with a bullet for each other badge it
holds, in the badge's own words (ยกเลิกแล้ว → • ยกเลิกประกาศเชิญชวน
• ยกเลิกประกาศผู้ชนะ). Notes, like Closed being inferred, go one sentence a line.
Nothing is cut short, since an explanation that has to be revealed doesn't work
on a phone. A test holds every badge to its group, word for word. The
deadline filter, the sort and the "hide" toggle say ยื่นข้อเสนอ, because they
are about bids. One file, `client/app/_lib/stage.ts`, holds the words for
both.

**Every deadline is labelled.** The catalog row and the detail page say
**ส่งความเห็นร่าง TOR ภายใน** or **ยื่นข้อเสนอภายใน** above the date and the time
left. A date the TOR doesn't state is said to be missing.

## Consequences

- Results from extract-v3 have no `commentDeadline`. Re-run them with
  `npm run extract -- --outdated`: one extraction per IT TOR, and one classify
  call per excluded one.
- **A TOR document often doesn't hold the bid date.** For 69109062251 the
  downloaded file is the TOR specification, which mentions วันยื่นข้อเสนอ only
  in general terms. The date is in the invitation announcement the feed links
  to. Reading that announcement is the next step for bid deadlines; until
  then the page says the TOR gives none.
- The stage and deadline rules live in `client/app/_lib/stage.ts`, tested
  without rendering.
