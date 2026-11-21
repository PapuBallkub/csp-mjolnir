# 0037 · Wording for missing deadlines in draft and open projects

Status: accepted · 2026-11-21 · refines [0019](0019-stage-badges-and-deadlines-that-say-what-for.md)

## Context

Under [0019](0019-stage-badges-and-deadlines-that-say-what-for.md), `deadlineOf()`
in `client/app/_lib/stage.ts` returned two fallback strings when a deadline was
`null`:

- `"TOR ไม่ระบุวันรับฟังความเห็น"` for a `Draft` (`B0`) without `facts.commentDeadline`
- `"TOR ไม่ระบุวันยื่นข้อเสนอ"` for an `Open` project without `facts.submissionDeadline`

In practice, both phrases read backwards on the card and detail page:

1. **Drafts almost never carry a comment deadline in their PDF files.** An e-GP
   draft ZIP (`process5`) holds template documents marked **ร่าง** whose date
   blanks are not filled in yet. The public-comment period (`วันสิ้นสุดรับฟังความคิดเห็น`)
   is shown only on the e-GP web page behind Cloudflare Turnstile
   ([process5_gprocurement.md](../data-sources/process5_gprocurement.md#a-drafts-zip)),
   so our document extraction pipeline cannot read it. Saying
   `"TOR ไม่ระบุวันรับฟังความเห็น"` (or `"ไม่มีวันปิดรับ"`) under the catalog card's
   **กำหนดยื่นข้อเสนอ** heading sounded as though the project had no deadline at
   all—when in reality a comment deadline exists on e-GP and bid submission has
   simply not opened yet.
2. **Prefixing an open project's missing bid date with `"TOR ไม่ระบุ…"` sounded
   like the project itself had no closing date.** When `facts.submissionDeadline`
   is `null` on an `Open` project, the date is missing from the attached TOR
   document (often because the date lives only in the separate invitation
   announcement), not from the procurement itself. At the same time, a bare
   `"ไม่ระบุวันปิดรับ"` doesn't say *what* is closing—comments or bids.

## Decision

Update `deadlineOf()` in `client/app/_lib/stage.ts` (and use `deadline.missing.th`
in `client/app/_components/tor-detail/TorAside.tsx`) so missing dates describe
the project's state without claiming that no deadline exists:

- **Draft (`status === "Draft"`) with `commentDeadline: null`:** show
  **`"อยู่ระหว่างรับฟังความเห็น"`** (*Open for public comment*). This tells a bidder
  scanning the **กำหนดยื่นข้อเสนอ** slot why there is no bid submission date yet,
  without falsely claiming there is no comment deadline or implying the date is
  available on our site.
- **Non-draft (`Open`, etc.) with `submissionDeadline: null`:** show
  **`"ไม่ระบุวันปิดรับข้อเสนอ"`** (*No bid deadline specified*). Using
  `"วันปิดรับข้อเสนอ"` matches the rest of the lifecycle copy (`เปิดรับข้อเสนอ`,
  `ปิดรับข้อเสนอแล้ว`) and keeps bid submission distinct from a draft's comment
  period.

## Consequences

- Refines the missing-deadline wording from
  [0019](0019-stage-badges-and-deadlines-that-say-what-for.md); the data model
  and separation between `facts.commentDeadline` and `facts.submissionDeadline`
  stay unchanged.
- When a `Draft` does have `facts.commentDeadline` (for example, entered by an
  admin in `/admin/review/[id]` or extracted from an agency document that states
  it), the countdown and date still render as before.
- **Revisit** if the ingestion pipeline later fetches the comment period or bid
  closing date directly from e-GP's announcement page.
