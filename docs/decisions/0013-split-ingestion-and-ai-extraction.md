# 0013 · Split ingestion and AI extraction into two pipelines

Status: accepted · 2026-10-01 · supersedes the layout and OCR limits of
[0008](0008-tor-ingestion-pipeline.md)

## Context

[0008](0008-tor-ingestion-pipeline.md) built ingestion (fetch, download, OCR)
and stopped at `ocr_done`. The next step reads that text with an LLM and fills
`TorInsight` (FR-05–FR-07). Four things shape how the two fit together.

- **The AI step will be re-run far more often than ingestion.** Every prompt
  change after client feedback means re-processing TORs we already have.
  Downloading and OCR-ing them again each time would be slow and pointless.
- **The requirements keep them apart.** The AI pipeline must be separate from
  the web backend (NFR-14), and a failing source or service must not corrupt
  stored records (NFR-06).
- **An LLM gives no real confidence number.** NFR-17 hides anything under 80%,
  so the score has to come from something we can check.
- **0008's OCR limits cut real documents short.** A fixed 30-page cap and a
  4-minute ceiling stop well before the end of 60–80 page scanned TORs, and
  nothing recorded that the text was incomplete.

## Decision

**Two pipelines that meet only in the database.**

```
server/src/pipeline/
├── index.js        public surface of both
├── shared/         helpers both use (Thai text digits, for now)
├── ingestion/      fetch → download → OCR, writes Tor
└── extraction/     reads Tor, writes TorInsight
```

Ingestion writes only `Tor`, and extraction writes only `TorInsight`. Neither
imports the other; code they both need lives in `shared/`. Extraction finds its
own work: a `Tor` at `ocr_done` with no `TorInsight`, or one built from a
different document. `Tor.pipelineStatus` gets no AI state.

**Extraction is a fixed workflow, not an agent loop.**

```
select → classify → (not IT: save "excluded", stop) → copy feed fields → extract → check → save
```

- **Classify** is a small call on the title and the first few pages. A non-IT
  TOR is saved as `excluded`, with the reason, and never pays for extraction.
- **Extract** is one call with a response schema, so the output always has
  the shape of `TorInsight`. Arithmetic and comparisons happen in code
  afterwards, never in the model.
- **Where the feed and the AI both have a value, the feed wins.** A
  disagreement is recorded and sends the TOR to review. Status comes only from
  the feed. Closed is worked out when the data is read ("Open, and past its
  deadline"), so neither pipeline has to write the other's collection.

**Confidence comes from checks, not from the model.** These are grounding (the
quoted evidence exists in the text), cross-source (the value agrees with the
feed), sanity, OCR quality and truncation. A failed check on a critical field
caps the score below 80, so the TOR is hidden and queued for review (NFR-17).
The failed checks are stored with their reasons. During the pilot, every result
goes to review whatever its score.

**Re-processing is explicit.** A changed document is always re-processed. A
result from an older prompt or model is re-processed only with `--outdated`,
and one an admin has approved or edited only with `--force`, which warns.

**OCR limits grow with the document.** The page limit is 150, and the time
budget is 10 seconds per page. Scanned pages have measured 2.6 seconds each
(0008) and 3.8 seconds each (a 30-page TOR on a Windows laptop), so that leaves
2.5–4× headroom. Both limits can be raised with `OCR_MAX_PAGES` and
`OCR_SECONDS_PER_PAGE`. When a document is cut short anyway, `Tor.ocr.truncated`
records it, and extraction counts that as a failed check.

**Output is Thai only for now.**

**Not decided here:**
- the price field names and the rest of the `TorInsight` schema (next record)
- a shared vocabulary for list items such as technologies
- the gold set for measuring accuracy, which is deferred to a later sprint

## Consequences

- **Prompts can change freely.** Re-running extraction touches only
  `TorInsight`, and never re-downloads or re-OCRs anything.
- **Two AI calls per IT TOR, not one.** The classify call is small next to
  extraction, and it saves the large call for every non-IT document.
- **"Feed wins" trusts the feed over the document.** When an amendment changes
  a price before the feed catches up, the TOR shows the old value until a
  reviewer looks. We accept that, because a wrong price shown with confidence
  is worse than a flagged one.
- **The checks are only as good as their rules.** A value that is wrong but
  quoted, consistent and plausible passes. Without a gold set, the rate of
  those is unknown, which is why every result goes to review for now.
- **Long scans take longer.** An 83-page scan now finishes instead of
  stopping at page 30, which at 3.8 seconds per page takes about 5 minutes.
  The NFR-02 target (under 5 minutes for 50 pages, OCR and AI together) leaves
  under 2 minutes for AI after about 3 minutes of OCR. It is measured, not
  enforced, while development runs on laptops.
- **Revisit** if the database stops working as the hand-off between the two
  (at a volume where a queue would serve better), or if lock-spec analysis
  turns out to need an agent that can look things up.
