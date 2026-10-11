# 0020 · Match comparable projects in code, not with an LLM

Status: accepted · 2026-10-11

## Context

FR-19 requires grouping similar historical IT procurement projects to a given TOR,
serving as the baseline for price reality checks (FR-20) and lock-spec detection
(FR-21).

When designing how to identify similar projects, three problems arose:
1. **Calling an LLM (Vertex AI) again is too expensive and slow.** Ingestion already
   calls Gemini to extract and normalize the document into `TorInsight`. Querying
   an LLM on every comparison across dozens or hundreds of candidates would blow up
   API token costs and violate NFR-01 (< 2s response).
2. **The technology stack alone is too narrow.** Many government TORs do not name
   specific technologies, or two projects with the exact same scope and budget
   (e.g., e-Service portals) pick different tech stacks (React vs. Vue, Python vs. C#).
   Requiring matching technologies causes a "zero-results" trap.
3. **Agency wording differs widely.** Even for identical work, agencies describe
   requirements in varied Thai bureaucratic prose.

## Decision

**The AI picks the label; code does the comparing (ADR 0013 / 0014).**

Similarity matching runs in deterministic backend code using fields already
normalized into `TorInsight`. No additional LLM calls are made.

### Fields used from `TorInsight` and why

| Field in `TorInsight` | Role in Matching | Rationale |
|---|---|---|
| `identification.category` | **Primary Hard Filter** | Broad IT domain (`software-development`, `data-and-ai`, `network-and-security`, etc.). A web application is never benchmarked against hardware or networking. |
| `facts.referencePriceTHB` (or `budgetTHB`) | **Scale Filter & Proximity Score** | Projects operate in budget tiers. Limits candidates to $[0.3\times, 3.0\times]$ of reference price, ensuring a 500k THB website is not benchmarked against a 100M THB enterprise system. |
| `overview.majorComponents` & `identification.titleTh` | **Scope Keyword Matching** | Provides domain context (e.g. "ERP", "e-Service", "Mobile App", "GIS"). Keyword overlap weights projects with similar functional scopes higher. |
| `technicalRequirements.requiredTechnologies` | **Bonus Ranking Weight (Jaccard)** | Shared technologies (`name`, `version`) boost similarity ranking when present, but are not a hard prerequisite. |
| `facts.deliveryPeriodDays` | **Timeline Proximity** | Similar contract durations (e.g. 180 days vs. 365 days) reflect similar delivery complexity. |

### Two-stage matching algorithm

1. **Stage 1 — Candidate Pool Query (MongoDB Filter):**
   - Exact match on `identification.category`
   - Bounded range on `facts.referencePriceTHB` ($\pm 70\%$ bracket)
   - Excludes target project ID
2. **Stage 2 — In-Memory Composite Scoring (Top $K$ ranking):**
   $$Score = 0.45 \cdot S_{\text{scale}} + 0.35 \cdot S_{\text{scope}} + 0.20 \cdot S_{\text{tech}}$$
   The top 2–5 highest-scoring candidates populate `analytics.priceAnalysis.comparableProjects`.

### 3. Implementation & Tooling

The algorithm is implemented in `server/src/features/reality-check/similarity.service.js`
and exported via the feature entrypoint (`#features/reality-check/index.js`).

A dedicated CLI script (`npm run comparable` -> `server/scripts/find-comparable.js`)
provides both inspection and automation:

```bash
# Local (from server/):
npm run comparable -- --id <projectId>
npm run comparable -- --all --save

# Docker (when containers are running):
docker compose exec server npm run comparable -- --id <projectId>
docker compose exec server npm run comparable -- --all --save

# Docker (as a one-off run):
docker compose run --rm server npm run comparable -- --id <projectId>
docker compose run --rm server npm run comparable -- --all --save
```

## Consequences

- **Zero runtime LLM cost:** Matching is instant, deterministic, and repeatable in tests.
- **No empty comparisons:** Because `category` and budget bounds are the primary anchor
  while technologies are soft-weighted, the system never returns zero matches simply because
  a TOR left its tech stack unspecified.
- **Traceable evidence:** Every comparable project saved includes title, fiscal year,
  and reference price, allowing bidders and watchdogs to verify the source of the benchmark.
- **CLI & Pipeline ready:** The service can be imported directly into pipeline steps or
  run via automated batch scripts.
