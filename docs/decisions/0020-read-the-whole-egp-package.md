# 0020 · Read the whole e-GP package, and read it again at each stage

Status: proposed · 2026-10-11

## Context

e-GP builds a zip of documents for each stage of a project: one for the
draft, a new one for the invitation, probably another for each change
([process5_gprocurement.md](../data-sources/process5_gprocurement.md)). Only
four kinds of file in it are about the project:
- **The announcement** (`annoudoc_*.pdf`), 2 pages of real text: ราคากลาง, the
  bid date and time, and the agency in its heading.
- **The bidding document** (`doc_*.pdf`), 13–30 pages of real text:
  eligibility, payment, bonds, how the winner is chosen, and the bid date
  again.
- **The TOR**, under any name, often a scan.
- **Sometimes an extra file** from the agency.

The rest are blank forms, the same in every package.

The pipeline kept one PDF per project, chosen by file name, and threw the rest
away. It never downloaded again. That cost us:

- **No bid date and no ราคากลาง.** Both are in the announcement. 69109062251
  and 69099683466 had to be fixed by hand.
- **No agency.** The feed gives none, and a project whose TOR doesn't name one
  failed extraction ("No agency in the feed or the document").
- **The wrong file as "the TOR".** `PPC.29092569.pdf` scores below
  `annoudoc_*.pdf`, so the 2-page announcement would have been kept.
- **Garbage read as text.** One TOR's text layer is an old non-Unicode Thai
  font ("{rt ruxruifl…"). Any 50 characters counted as digital, so it skipped
  OCR.
- **A draft stays a draft.** A project first downloaded as a draft never gets
  the invitation's files, which hold the bid date.

## Decision

**Keep every project file from a package, and read the facts in code.**
- **What download keeps:** the announcement, the bidding document, the TOR,
  and any other file that isn't a known blank form. They go in
  `server/data/documents/<projectId>/<package>/`, under their own names, so
  each stage's files stay.
- **The TOR, by elimination** among the files that are neither announcement,
  bidding document, blank form nor price build-up:
  1. e-GP's own typed TOR (`tor_<projectId>_<uuid>.pdf`), when it has a text
     layer;
  2. else every file whose name says `tor`, in order. Agencies split a TOR
     over files (`Attach_TOR_1` to `_3`), and the main part was part 1 in one
     package, part 2 in another, and never reliably the largest. So all parts
     are the TOR, and OCR reads them in order as one document. A preview's 6
     pages are spent across them.
  3. else the largest file. This is a guess: in 3 of 4 such packages it was
     the TOR or its specification, and the fourth had no TOR, only drawings.
     Page count would guess worse: a six-page price form outnumbers a
     three-page specification.
  A package without any of these uses the bidding document, then the
  announcement.
- **What's read from the announcement, in code, with no AI:**
  - **The agency:** the heading, "ประกาศ<agency>".
  - **ราคากลาง:** the amount after "ราคากลาง", kept only when its digits and its
    words agree.
  - **The bid window:** the day, and the times from … to. The bidding document
    states it in a cleaner layout and is read first; if the two disagree,
    neither is kept.
- **Each value keeps the sentence it came from,** so the page can show its
  source. A value the document doesn't state stays null.
- **Values from the documents are the source's own, like the feed's.** The
  `Tor` holds them (`agency`, `referencePriceTHB`, the new
  `submissionDeadline`), and extraction lets them win over the AI's, as it
  does for the feed's ([0013](0013-split-ingestion-and-ai-extraction.md)). The
  agency is only filled in where the feed gave none.
- **Nothing from the price package yet.** The pipeline used to fall back to
  it when there was no announcement package, and then OCR a one-page price
  form as if it were the TOR. That fallback is gone; the price form is read
  for the budget instead ([0023](0023-read-the-budget-from-the-price-form.md)).

**A text layer has to be Thai to count as text.** A PDF whose text is under
20% Thai letters is treated as a scan and OCR'd. On our files, a garbled layer
had 0% Thai, and real Thai documents 94–100%. A TOR in English only would be
OCR'd needlessly, which costs time but loses nothing.

**Each new stage gets its package read again.** When the feed announces a new
draft, invitation or change (`B0`, `D0`, `D2`) for a project already
downloaded, fetch flags it (`packageCheckNeeded`). Download asks e-GP for the
current package:
- **Same `zipId`:** nothing to do.
- **A new package:** its files and facts are added to `Tor.packages`. Older
  packages stay, for amendment diffs later (FR-16).
- **The TOR changed:** it goes back to OCR. A TOR already found to be IT is
  read whole, since previewing it again would hide its page until extraction
  catches up.
- **Only the announcement changed** (a new bid date, say): the `Tor`'s facts
  change, and nothing is read or extracted again.

**The page shows the `Tor`'s facts as they are now.** The API already reads
the status from the `Tor` (#179). It now reads the agency, budget, ราคากลาง
and bid deadline from it too, wherever the `Tor` has one. So a changed bid
date shows without paying for another extraction.

**Evidence says which document it quotes.** `evidence.<field>.document` is
`announcement` for a quote from the announcement; null means the TOR, and its
`page` is a TOR page.

## Consequences

- **The workable TORs were downloaded once more** (2026-10-11), to record their
  packages: 28 packages, about 60 requests. Results:
  - **Agency:** found for all 28.
  - **ราคากลาง:** found for 27. One agency published it blank; one layout split
    the word across lines and is now read too.
  - **Bid window:** found for every invitation, and none for the 6 drafts.
  A TOR whose file was unchanged wasn't OCR'd or extracted again. Nine non-IT
  TORs got a better file: 4 in parts, 2 typed by e-GP, 3 under other names.
  They go back to OCR and one classify call each.
- **The hand fixes become unnecessary** for ราคากลาง, the bid date and the
  agency. The budget isn't in the announcement; it comes with the price form.
- **The bidding document's text is stored,** and extraction reads it
  ([0025](0025-extraction-reads-the-bidding-document.md)).
- **The bid window is a window, not a deadline.** e-bidding takes bids only
  on that day, between the two times. `submissionDeadline` is its closing
  time; the opening time is kept in the package for the page to show later.
- **A draft's comment deadline is still unknown:** no document states it
  ([0019](0019-stage-badges-and-deadlines-that-say-what-for.md)).
