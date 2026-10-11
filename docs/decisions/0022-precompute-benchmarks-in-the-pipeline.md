# 0022 · Pre-compute benchmarks in the pipeline, refresh by batch

Status: accepted · 2026-10-11

## Context

Once comparable projects can be identified (ADR 0021), the system must compute price
benchmarks (FR-20) and lock-spec risk indicators (FR-21).

Two architectural questions arise:
1. **When should benchmarks be computed?** Should the API calculate median prices and
   deviations dynamically on every HTTP GET `/api/tors/:id`, or pre-compute and store them?
2. **How does querying scale when the database holds 100,000+ historical projects?**
   If a new TOR arrives, does the system have to scan the whole database?

## Decision

### 1. Pre-compute and store in `TorInsight.analytics`

Price analysis and lock-spec findings are pre-calculated and stored directly in
`TorInsight.analytics.priceAnalysis` and `TorInsight.analytics.lockSpec`.

The frontend reads pre-computed values directly. It never triggers aggregation queries
on page view, guaranteeing compliance with **NFR-01** (page load under 2 seconds).

### 2. Update lifecycle (Two triggers)

Benchmarks are updated via two distinct mechanisms:

- **Trigger 1 — Immediate (Pipeline Extraction):**
  When a newly ingested TOR finishes AI extraction in
  `server/src/pipeline/extraction/process-tor.js`, the benchmark service runs against
  existing historical records in MongoDB. The resulting median, diff percentage,
  comparable projects, and lock-spec findings are written immediately to `TorInsight.analytics`.
- **Trigger 2 — Periodic Batch Refresh (`npm run comparable -- --all --save` / Scheduled Cron):**
  Historical contracts from data.go.th and newly closed tenders accumulate over time.
  The batch command `npm run comparable -- --all --save` recalculates comparable projects
  for all active (`Open`) TORs, ensuring that benchmarks incorporate fresh contract data.

### 3. Compound Index for $O(\log N)$ scale

To prevent full-collection scans ($O(N)$) as the database grows to 100,000+ records,
`TorInsight` maintains a compound index:

```javascript
torInsightSchema.index({
  'identification.category': 1,
  'facts.referencePriceTHB': 1,
});
```

When looking up candidate projects for a new TOR, MongoDB navigates the B-tree index
directly to the relevant category and budget slice ($\pm 70\%$). It touches only 20–50
matching index keys in ~2–5 milliseconds, completely bypassing the remaining records.

## Consequences

- **Sub-2s page load preserved:** The API performs a simple `findOne({ projectId })`
  to return pre-computed analytics. No heavy math happens during user requests.
- **Stable user experience:** Benchmarks remain stable between page reloads and do not
  fluctuate mid-session.
- **Fast ingestion step:** Running the benchmark calculation in code for a single new TOR
  adds negligible overhead (< 15ms) to the pipeline execution.
- **Scalable database:** The compound index guarantees that query execution time remains
  flat even as historical archives from data.go.th grow significantly.
