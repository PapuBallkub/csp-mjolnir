# 0016 · Pipeline runs are safe to repeat

Status: proposed · 2026-10-07

## Context

Both pipelines were built to be run by hand, one run at a time. Automating
them (FR-01) means running them on a schedule, again and again, with nobody
watching. Five things broke under that:

1. **Fetching a TOR again undid its progress.** Every fetch wrote
   `pipelineStatus` and `document`. A TOR at `ocr_done` that was still in the
   feed went back to `fetched` or `downloaded`, and was OCR'd again. The
   weekend fallback also dropped `document.contentHash`, which is part of the
   source fingerprint ([0013](0013-split-ingestion-and-ai-extraction.md)), so
   extraction saw a changed source and paid Gemini again.
2. **Every poll added the same RSS item to `announcementHistory` again.** The
   amendment history (FR-16) is built from that list.
3. **Downloads weren't paced.** Each TOR makes up to three requests to e-GP,
   back to back, so a run with more than a few TORs broke NFR-03.
4. **Two runs could overlap.** OCR of a long scan takes minutes. A run started
   meanwhile picks the same TOR: OCR twice, and Gemini paid twice.
5. **A failing TOR was retried on every run, for ever.** For extraction that
   costs money each time the failure comes after Gemini has answered.
6. **A dead feed looked like a working one.** When the e-GP RSS returned
   nothing, fetch filled the gap with data.go.th's FY2568 contracts, saved as
   new `B0` draft TORs, and reported the RSS errors only as a count. In
   October 2026 the feed had stopped answering, and every TOR in the
   database was a 2024–25 contract.

## Decision

**Fetch fills in, and never sends a TOR back.**
- Once download has handled a TOR, its `document` and `pipelineStatus` belong
  to download and OCR. Fetch leaves both alone, and doesn't parse or download
  the PDF again.
- An RSS item is recorded once: same code, same publish time, same link. A
  later amendment has its own publish time, so it's still recorded.
- All three fetch paths use the same rules, in
  `pipeline/ingestion/lib/fetch-rules.js`.

**One pacer for every request to a government site.**
`pipeline/shared/request-pacer.js` keeps requests to one site at least a
second apart. All e-GP hosts count as one site. Fetch and download share it.

**One run of each pipeline at a time.**
- One lock document per pipeline (`ingestion`, `extraction`), in
  `pipelinelocks`.
- It's a lease. The holder renews it every minute, and it expires five
  minutes after the last renewal, so a crashed run frees its lock by itself.
  Ctrl+C releases it at once.
- A second run prints who holds the lock and exits with code 1, having done
  nothing.

**A TOR gives up after three failures of its own.**
- `pipelinefailures` holds one document per TOR and step (`download`, `ocr`,
  `extract`) that is failing. The document is deleted when the step succeeds.
- An outage (no answer, a 5xx, a 429) is recorded but not counted, so a source
  going down doesn't make every waiting TOR give up. The downloader now tells
  "e-GP didn't answer" apart from "e-GP has no file".
- Failures count against one input: the PDF's hash for OCR; the source
  fingerprint, prompt version and model for extraction. A new PDF or a new
  prompt gets new tries.
- A TOR that gave up is skipped until someone runs with `--retry-failed`, or
  names it with `--id`.
- The limit is `PIPELINE_MAX_ATTEMPTS`, 3 by default.

**A source that fails says so, and nothing takes its place.**
- The data.go.th fallback is removed from e-GP fetching. data.go.th is still
  fetched on its own (`datago`), labelled as what it is: past contracts.
- Fetch prints every error a source reports, and says when the feed didn't
  answer at all (`unreachable`: every request failed).

**These two collections are run bookkeeping, not TOR data.** 0013 has each
pipeline write only its own collection, `Tor` or `TorInsight`. That rule is
about TOR data, and it still holds. Both pipelines write `pipelinelocks` and
`pipelinefailures`.

## Consequences

- Fetch can run on any schedule without undoing work or paying for it twice.
  This is the groundwork for scheduled runs; when and where they run is still
  open.
- A run killed with `kill -9`, or a machine that loses power, blocks the next
  run for up to five minutes.
- A run that stalls for longer than the lease can lose its lock to another run
  while it's still working. The stalled run logs that it lost the lock.
- `pipelinefailures` is the per-TOR failure data the admin dashboard needs
  (FR-22). Nothing shows it yet.
- While the RSS feed doesn't answer, fetch finds no open projects at all.
  Finding them needs another source; that's open.
- **Not covered:** data.go.th fetch still overwrites `status` with whatever
  the contract data says. That belongs to status tracking (FR-15).
