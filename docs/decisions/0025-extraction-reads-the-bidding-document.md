# 0025 · Extraction reads the bidding document

Status: proposed · 2026-10-12

## Context

The bidding document (เอกสารประกวดราคา, `doc_*.pdf`) is the legal text of who
may bid and on what terms:
- eligibility: registered capital, past work, joint ventures
- the bid date
- payment instalments, bonds, the late-delivery penalty and the warranty
- how bids are judged

It has a real text layer, and [0020](0020-read-the-whole-egp-package.md)
stores it as `Tor.packages[].biddingText`.

Extraction read only the TOR, which is often a scan. Its OCR garbles exactly
these terms: one TOR's past-work minimum came out with its digits and words
disagreeing, while the bidding document stated it cleanly ("ผลงาน… วงเงินไม่
น้อยกว่า 2,000,000 บาท").

## Decision

**Extraction reads the TOR, then the bidding document.**
- The request holds both, each under a `=== Document: tor ===` or
  `=== Document: bidding ===` line.
- The bidding document's pages are headed `=== Page N ===` like the TOR's, and
  each document numbers its own.
- A TOR without a bidding document is read as before, under its one heading.
  That covers data.go.th records and anything downloaded before 0020.

**Each quote says which document it's from.**
- The schema asks for `document` (`tor` or `bidding`) right after the quote,
  so the quote is still written before the value it supports.
- The evidence keeps it: `evidence.<field>.document` is `bidding`, or null for
  the TOR.
- The grounding check looks for each quote in the document it names. A quote
  claimed from the wrong one fails, and the reviewer is told where it looked.
- A quoted list item (a technology, a certification) may come from either.

**The prompt says which document to trust for what** (extract-v5):
- **Use both.** When both state a term, take the fuller statement: one may
  give a detail the other leaves out, such as the number of instalments or a
  minimum daily penalty.
- **When they disagree,** take the bidding document for who may bid and on
  what terms, since its text wasn't OCR'd; take the TOR for the work itself.
- **Read the bidding document as the filled-in form it is,** with its values
  after the form's own words.

**Quotes are copied mistakes and all, never corrected or reordered.** In a
trial, the model "fixed" OCR misreads inside quotes (once inventing a budget
that neither document stated) and moved filled-in values back into their
sentences. The prompt now forbids both, with real examples.

**A bidding-document quote is checked as a form.** Its values sit after the
form's words, so a quote may hold its pieces in another order:
- **Every chunk must be close by:** within 1.5 times the quote's length (real
  quotes spread up to 1.34 times).
- **A number must keep the unit the quote gives it.** "๓ ปี" needs a "๓ปี" in
  the form. In the trial this let every genuine quote through and stopped
  every made-up value (a changed year count, date, closing time or penalty).

A bid window ("ระหว่างเวลา … ถึง … น.") gives its closing time.

**A result's fingerprint covers what it was built from.**
- A full extraction's covers the bidding document too, so a changed bidding
  document makes it out of date.
- An excluded or awaiting result was built from the TOR alone. Its fingerprint
  leaves the bidding document out, so non-IT TORs aren't classified again just
  because a bidding document appeared.

## Consequences

- **Trial on the two open IT TORs (dry runs, 2026-10-12).**

  | | Before (TOR only) | With the bidding document |
  |---|---|---|
  | Score | 90 and 85 | 85 and 90 |
  | Bid deadline | none in either | 19 Oct 2569, 12:00 in both |
  | Past-work minimum (69099683466) | unreadable (`๒๐๐๐,๐๐๐`) | 2,000,000 |

  It also found the TOR and the bidding document disagreeing on 69109062251's
  payment (12 instalments against 10), and reported both.
- **Each extraction request is larger:** about 51k and 55k input tokens for
  those two, a bidding document being 30–40k characters. Classification is
  unchanged.
- **A badly garbled amount can still be rebuilt from its words** inside a
  quote, against rule 4. Grounding catches it as a failed check, and the
  displayed budget comes from the price form
  ([0023](0023-read-the-budget-from-the-price-form.md)) regardless.
- **Re-extraction after merging:** the two open IT TORs are re-extracted with
  the next `npm run extract`, since their fingerprints now cover their bidding
  documents. Results from older prompts follow with `--outdated`. Non-IT TORs
  stay as they are.
- **No new fields.** Registered capital and joint ventures stay in
  `eligibility.companyRequirements` as text. Bonds (หลักประกันสัญญา) aren't
  extracted. Each would make a structured field worth adding once the page
  can show it.
