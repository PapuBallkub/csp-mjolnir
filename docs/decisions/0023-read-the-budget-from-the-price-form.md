# 0023 · Read the budget from the price form

Status: proposed · 2026-10-11

## Context

The budget (วงเงินงบประมาณ) is in only one document: the price form, แบบ บก.
(e.g. บก.06 for goods and services, บก.05 for hiring software development).
It's the one page in each project's price package (`pricebuild_*.zip`), which
e-GP keeps apart from the announcement package
([process5_gprocurement.md](../data-sources/process5_gprocurement.md)).
[0020](0020-read-the-whole-egp-package.md) read the announcement package and
left the price form for this step.

Most price forms are scans, and OCR misreads Thai digits: ๑,๑๙๔,๖๐๐ came out
๑,๑๕๕,๒๐๐, and ๔,๙๑๗,๗๐๐ as ๕,๕๑๓,ซ๐๐. The amount in words beside the digits
("หนึ่งล้านหนึ่งแสนเก้าหมื่นสี่พันหกร้อยบาทถ้วน") survived in every scan we read,
with a few slips: a dropped tone mark (สีพัน, หมืน), ล read as ด (สี่ด้าน), ถ้วน
as ถ้าว. Many forms, though, give an amount in digits only.

## Decision

**Download the price package with the announcement package.**
- It's asked for once per project, and again whenever the feed announces a
  new stage. `15` (a reference price) now counts as one.
- It's kept in `Tor.packages` with `kind: 'price'`.
- A project without one isn't a failure (`priceCheckedAt` records that we
  asked).

**Read the form in code: OCR, then the amounts by their words.**
- The budget comes from "วงเงินงบประมาณที่ได้รับ(การ)จัดสรร", and ราคากลาง from
  "กำหนดราคากลาง". The form's title names both with no amount, so each mention
  is tried until one gives an amount.
- **Words give the value** when they read as an amount from start to finish,
  after repairing the slips above. A tail is never enough: "เก้าแสนเจ็ดหมืน
  ห้าพันบาท" once read as ห้าพันบาท, 5,000.
- **Digits check the words:** when they're a whole number with their commas,
  they must have as many places as the words, or the amount isn't kept.
- **Digits alone** are kept from a real text layer. From OCR they're kept only
  when the same form's ราคากลาง matches the announcement's, which is real text:
  that shows OCR read this form's digits right.
- **ราคากลาง from the form is a check, not a source:** the announcement's real
  text wins. The form's fills in only where the announcement left it blank,
  and a difference is noted on the package.

**A text layer's Private Use Area marks are put back** (`normalizeThaiPua`).
Some Thai fonts keep each position of a tone mark as its own glyph, and a PDF
set in one writes "ไดรับ" for ได้รับ.

## Consequences

- **Run on the 28 workable projects (2026-10-11):** the budget was read for
  12, including both open IT TORs, and matched what we'd read by eye. Of the
  16 misses:
  - 14 are construction, whose form (บก.01) lays its values out of order, or
    holds them in other files of the package. We don't read it: construction
    isn't our target.
  - In the other 2, a safeguard declined: the words and digits disagreed in
    size, or the form's OCR'd ราคากลาง didn't match the announcement's.
- **Nothing is guessed.** A budget is either read and checked, or null with
  the reason in `packages[].problems`.
- **The hand fixes are no longer needed:** the pipeline now reads every value
  we had fixed by hand.
- **Each new price form costs one OCR page,** a few seconds, in the download
  step.
- **บก.05's cost breakdown isn't read yet.** It splits hardware, software,
  development and other costs, which would tell a software graduate how much
  of a project is development. The form's text is stored (`priceFormText`) for
  when we do.
