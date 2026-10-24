# 0031 · Keep the summary a change replaces

Status: proposed · 2026-10-24

## Context

A TOR's summary (`TorInsight`) is overwritten whenever it's made again:
- a draft becomes an invitation with a different TOR file ([0020](0020-read-the-whole-egp-package.md));
- a newer prompt is run on it (`extract --outdated`);
- an admin corrects a field in the review queue (FR-23).

Nothing kept the old one. By 2026-10-23, 9 TORs had a replaced TOR file, and
their first summaries were gone. That loses two things the requirements ask
for:
- **What changed** in an amended TOR (FR-16): the comparison needs a "before".
- **Rolling a TOR back** when an amendment was processed wrongly (NFR-07). The
  same goes for a wrong correction, which also overwrote the AI's own answer.

## Decision

**Every summary a change replaces is kept, in a separate collection,
`TorInsightVersion`: one document per replaced summary.** It holds:
- the whole summary as it was, stored as-is, so a later schema change never
  breaks an old version;
- why it was replaced: `source-changed`, `prompt-update`, `forced`,
  `rebuilt`, `corrected` or `rollback`;
- who replaced it, for an admin's correction or rollback;
- the Tor's state it went with: its file, OCR details, and the facts an
  admin edit also changes on the Tor;
- the OCR text it was built from.

The summary itself gains `metadata.version`: 1, then one more each time.

**It's kept where its source is about to be lost,** once, by whichever comes
first:

| Where | When | Why there |
|---|---|---|
| Download | Before a package whose TOR file differs is applied | The old file and text are still on the Tor |
| OCR | Before changed text overwrites the old | The same, when the text changes without a new file |
| `saveInsight` | Before extraction overwrites the summary | A prompt update, `--force`, `--recheck` |
| The review queue | Before an edit that changes the summary | A correction; approving or rejecting alone keeps none |

A title-level past project ([0028](0028-past-projects-from-data-go-th.md)), a
preview waiting for its full text ([0018](0018-preview-ocr-before-classify.md)),
and a record found not IT are replaced without one: none is a summary.

**Each OCR text is stored once,** by the version it was about to be lost from
(`source-changed`). The others keep its hash, and a rollback finds the text by
it. A prompt re-run reads the same text, so it adds about 20 KB, not about
100 KB.

**Rollback** (`npm run rollback -- --id <projectId> --to <version>`, or
`POST /api/admin/review/:projectId/rollback`):
1. The current summary is kept as a version first (`rollback`), so a rollback
   can itself be undone.
2. The summary comes back, with the Tor's file, OCR text and facts it went
   with, under the next version number.
3. Its source matches the Tor again, so the next extraction leaves it alone. A
   later, really new package takes the normal path. If its text wasn't kept
   anywhere, it's marked as built from the Tor's present text instead, and the
   command says so.

It takes both pipeline locks: with a run going, it refuses rather than race
it. `GET /api/admin/review/:projectId/versions` lists a TOR's versions for an
admin screen to offer.

**The review queue keeps the extracted category** on approve and confirm,
instead of setting `'IT / software'`. That value isn't one of the categories
the comparison and the past-project selection group by. A category an earlier
reclassify set to `'non-IT'` comes back from the version it kept.

## Consequences

- **The "before" now exists for PR C's amendment diffs,** from the day this
  lands. Summaries replaced before it are gone.
- **Storage grows with real changes only:** about 100 KB for a version with
  its text, 20 KB without. Every version is kept for now; old
  `prompt-update` versions would be the first to prune if needed.
- **Nothing that reads TorInsight changes:** the catalog, the TOR page,
  comparisons and admin read the current summary as before.
- **An admin's correction keeps the AI's answer,** so a later check-tuning
  can compare the two.
- **The rollback button is for the admin screens to add;** the API is here.
