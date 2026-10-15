# 0026 · Screen titles before downloading

Status: proposed · 2026-10-13 · amends [0018](0018-preview-ocr-before-classify.md)

## Context

[0018](0018-preview-ocr-before-classify.md) downloads every new Draft or Open
project and reads a 6-page preview before classify decides whether it's IT.
A non-IT project costs a download, about 6 pages of OCR (~23 s for a scan) and
a classify call.

That was fine for the national feed's ~20 new projects a day. The agency
sweep ([0027](0027-run-the-pipeline-on-a-schedule.md)) brings far more: its
first test found 8 new projects in 2 of 3 agencies, and it asks 267. About 1
project in 20 is IT, so most of that work would be spent on trucks and roads.
On a laptop, previews alone could take hours a night.

0018 rejected a keyword filter on titles, for two reasons:
- Keywords are bad at Thai titles: `คอมพิวเตอร์` missed a software licence and
  caught a lung tester.
- The team wants to know how many IT projects have titles that don't look it,
  and a filter in front hides exactly those.

## Decision

**Gemini reads the titles first. Only a project that is clearly not IT stops
there.**

```
fetch → screen titles ─┬─ not_it: stop (a sample goes on anyway)
                       └─ it / unsure → download → preview OCR → classify → …
```

- **One call screens a batch of 40 titles** (`npm run screen`). Each gets one
  verdict:
  - `it`: clearly software or IT services;
  - `not_it`: clearly nothing to do with IT, such as construction, vehicles,
    food or cleaning;
  - `unsure`: everything else, including computers and other hardware, which
    classify judges from the document as before.

  The prompt says that a wrong `not_it` loses a project for good while a wrong
  `unsure` only costs a download, so doubt goes to `unsure`.
- **The verdict is stored in a collection of its own,** `TitleScreen`, one
  document per project. Ingestion reads it to decide what to download, as it
  reads TorInsight to decide what to read whole
  ([0013](0013-split-ingestion-and-ai-extraction.md)). TorInsight doesn't
  change.
- **A tenth of the `not_it` projects go the whole way anyway** (`audit`). The
  choice is fixed by the project ID, so screening again never re-rolls it.
  When classify finds one of them IT, the screen got it wrong, which keeps
  0018's question answerable. `SCREEN_AUDIT_RATE` changes the share.
- **The screen has its own prompt version** (`screen-v1`). A new version
  screens again only the projects still waiting; nothing downloaded is
  affected.
- **A project is screened again when its title changes.** One Gemini doesn't
  answer for waits for the next run.
- **`--skip-screen`** on `ingest:download` downloads new projects without
  waiting, for when Gemini isn't set up. `--id` always downloads.
- **The screen only gates new projects.** A project already downloaded is
  checked at each new stage as before
  ([0020](0020-read-the-whole-egp-package.md)).

## Consequences

- **A non-IT project costs a fortieth of a small Gemini call** instead of a
  download, OCR and a classify call. The first live batch screened 8 titles
  for 1,310 input tokens.
- **A wrongly screened project is lost** unless it falls in the audit sample.
  The audit sample measures how often that happens. If it's too often, the
  prompt changes, or the screen reads the announcement too, which has a text
  layer and needs no OCR.
- **`npm run ingest` alone no longer downloads new projects.** They wait for
  `npm run screen`. `npm run pipeline` runs both, in order.
- Previews of the audited `not_it` projects are kept, like all previews, for
  the study of titles against content.
