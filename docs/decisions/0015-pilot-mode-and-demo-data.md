# 0015 · Pilot mode, and demo data that says it's demo

Status: accepted · 2026-10-01

## Context

This sprint has to show the AI pipeline working end to end, on the real TOR
pages. Two things stood in the way.

**The rule meant to protect users would show nothing.** NFR-17 hides any
result scored under 80, and [0013](0013-split-ingestion-and-ai-extraction.md)
holds every result for review during the pilot. Human review moved to the
next sprint, so every result is `pending`, and a strict API would return an
empty catalog.

**The seed data passed for real results.** The frontend was built against 28
seeded insights. They were made up, including invented lock-spec findings
cited to TOR pages that say no such thing. Yet they were marked `approved`,
scored 91–94, and credited to a Gemini model. Nothing told them apart from
pipeline output. Running the seed also deleted every insight, including real
extractions, and replaced the technology vocabulary with a list whose keys
didn't match the pipeline's.

## Decision

**Pilot mode is one setting, `SHOW_UNREVIEWED_INSIGHTS`.**
- **On:** the API also returns unreviewed results and demo data.
- **Off:** it returns only pipeline results a person approved with a score of
  80 or more.
- **In every mode:** non-IT TORs and rejected results are never shown.
- **The default is on outside production and off in production,** so a public
  deploy only shows unreviewed data when someone turns it on deliberately.

**Every TOR the API returns says what it is.**
- `review` reports its origin (`pipeline` or `demo`), its review status, its
  score, and whether a person checked it. The frontend labels unchecked and
  demo records accordingly.
- The internal `metadata`, including the failed checks, stays internal.

**Demo data is marked as demo.**
- `TorInsight.metadata.origin` is `'pipeline'` or `'demo'`.
- Seed insights are `demo` and `pending`, with no score and no model.
- A test holds the seed files to the current schema.

**The seed never deletes, and never replaces real data.**
- Technologies are merged from the one starter vocabulary.
- A TOR is added only if ingestion hasn't saved that project.
- A demo insight is written only where no pipeline result exists, and
  `npm run extract` later replaces it with a real one.

**Analysis nobody ran is `null`, not `0`.** Until price and lock-spec analysis
exist, the stored zeros would read as "measured, low risk". The API returns
`null`, and the page says the analysis hasn't been done.

**Closed is worked out when the data is read**, as 0013 decided: an Open TOR
past its deadline is returned, and filtered, as Closed.

## Consequences

- **The demo shows real pipeline output next to demo filler,** and a visitor
  can always tell which is which. Real results sort first.
- **Unchecked AI summaries are public while pilot mode is on.** We accept this
  for a demo, because each one is labelled, and the checks have already
  flagged the doubtful ones. A real launch turns pilot mode off once reviews
  have approved enough results. The deployment checklist says so.
- **The seed can no longer reset a database.** Anyone who wants a clean slate
  drops the collections themselves.
- **Demo findings are still invented.** The label is what makes them
  acceptable, so a page that shows them must show the label.
- **Revisit** when human review starts. Pilot mode should be off for any
  public deploy from then on.
