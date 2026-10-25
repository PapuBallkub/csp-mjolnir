# 0032 · Record what changed in a TOR

Status: proposed · 2026-10-25 · amends [0020](0020-read-the-whole-egp-package.md) and [0030](0030-run-the-night-in-priority-waves.md)

## Context

A changed TOR is one of the risk signals the product promises (FR-16). The
pipeline could already read a changed TOR again ([0020](0020-read-the-whole-egp-package.md)),
but only when the feed announced a changed invitation (`D2`), and the feed
never has: not one `D2` in over a thousand polls. Nothing else looked, and
nothing recorded what had changed.

From 2026-10-20, the recheck watched every draft and open IT TOR's packages
without acting ([0030](0030-run-the-night-in-priority-waves.md)). Its first
nights found new packages, and each one turned out to be a draft becoming an
invitation: the next stage, not a change. The recheck also saw those
invitation packages **days before** the feed's `D0` was recorded, because the
feed was lagging. So a rule like "a new package that a new feed notice
explains is the next stage" would have flagged them as changes.

`Tor.amendments` existed in the schema, but nothing wrote it. Its `date`
defaulted to now, which would invent a date.

## Decision

**The recheck acts.** For each draft and open IT TOR, it asks e-GP which
announcement and price packages it has now:
- **A package we lack:** the TOR is flagged (`packageCheckNeeded`), and the
  night's first wave downloads it ([0030](0030-run-the-night-in-priority-waves.md)).
- **Nothing new:** `packagesCheckedAt` records when it looked.
- **e-GP's amendment service** is still only logged: nothing yet shows where it
  keeps amendments.

**Download judges a new package by its own announcement, not by the feed.** A
draft says "ร่าง" in its heading (`isDraftAnnouncement`).

| The package before | The new one | What it is |
|---|---|---|
| A draft | An invitation | The next stage: no record |
| An invitation | An invitation | A change, if its TOR file or facts differ |
| A draft | A draft | A change (a revised draft), if they differ |
| Either can't be read | | Not counted as a change, unless the feed announced one |
| A price form | A price form | A change, if the budget or ราคากลาง differs |

**Each change is an entry in `Tor.amendments`:**
- **Its source:**
  - `feed`: e-GP announced it (a `D2`). Fetch opens the entry, and the next
    package fills it in.
  - `package`: the platform found it.
- **Its date:** the date the agency's notice or documents state, or none. A
  found change is dated as the window between `previousCheckAt` (the last
  look that found nothing) and `detectedAt`.
- **Both originals:** `zipId` (the new package) and `previousZipId` (the one
  it replaced).
- **`insightVersion`:** the summary version it replaced ([0031](0031-keep-the-summary-a-change-replaces.md)).

**What changed is said in two steps,** as rows of a field, before and after:
1. **Download** compares the facts: the TOR file (by package name), the bid
   deadline, the ราคากลาง and the budget (`diff: facts`).
2. **Extraction** adds the summary's own values, once the summary is made
   again because its source changed (`diff: complete`): the other dates and
   numbers, the technologies, and the standard eligibility conditions.

**Only values that can be compared get a row:** numbers, dates and lists of
known items. Two extractions word free text differently, so a row there would
report a change nobody made. A prompt update makes a new summary too, but it
isn't the agency's change, so it adds nothing to the record.

**The record of a change isn't part of a summary's source.** The fingerprint
no longer hashes `amendments`. An amended TOR is a new TOR file, which the
fingerprint already covers, and writing the record mustn't make a summary
look out of date.

**A rollback undoes its changes** ([0031](0031-keep-the-summary-a-change-replaces.md)).
Changes that replaced the version brought back, or a later one, are marked
`rolledBack`: kept, but not shown.

**The API reads it live:**
- **TOR detail:** the changes still standing, with both originals.
- **Catalog:** `lastChangeAt` and the latest change's source and fields.
- **Watchlist:** `lastChangeAt`, so "changed since you saved" is
  `savedAt < lastChangeAt`.
- **`amendmentInfo.lastAmendedDate` and `changedSections`** come from the
  `Tor`, as `isAmended` and the status already do.

`isAmended` keeps its meaning: e-GP announced a changed invitation.

## Consequences

- **A change shows by morning however the night ends.** The recheck and the
  changed packages' downloads come first, and the API reads the new deadline,
  ราคากลาง and budget live from the `Tor` ([0020](0020-read-the-whole-egp-package.md)).
- **A found change is the platform's inference, and has to be shown as one:**
  its own marker, a note that the agency hasn't announced it, dated as a
  window. That's the frontend's next PR.
- **About 135 requests a night** for the recheck at today's 67 TORs, plus a
  download for each new package.
- **A new package whose stage can't be read isn't counted** unless the feed
  announced a change. That's safer than flagging a stage change as an
  amendment. The log says so when it happens.
- **If e-GP turns out to keep amendments only in its amendment service,**
  this misses them. The recheck's log will show it, and acting on that
  service comes then.
