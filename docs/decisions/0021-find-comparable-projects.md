# 0021 · Match comparable projects in code, not with an LLM

Status: accepted · 2026-10-11 (updated 2026-10-18)

## Context

FR-19 requires grouping similar historical IT procurement projects to a given TOR, serving as the baseline for price reality checks (FR-20) and lock-spec detection (FR-21).

When designing how to identify similar projects, several architectural and domain problems arose:

1. **Calling an LLM (Vertex AI) at query time is too expensive and slow.** Ingestion already calls Gemini to extract and normalize the document into `TorInsight`. Querying an LLM on every comparison across dozens or hundreds of candidates blows up API token costs and violates NFR-01 (< 2s response).
2. **The technology stack alone is too narrow.** Many government TORs do not name specific technologies, or two projects with the exact same scope and budget (e.g. citizen mobile apps) pick different tech stacks (Flutter vs React Native, Python vs Node.js). Requiring matching technologies causes a "zero-results" trap.
3. **Agency wording differs widely.** Even for identical work, agencies describe requirements in varied Thai bureaucratic prose, mixing English loanwords, transliterations, and formal phrasing.
4. **What defines a "comparable project" in software procurement?** Software development costs are determined by **deliverable complexity and architecture** (e.g. mobile app with backend API vs enterprise ERP vs data warehouse), not the specific agency subject matter (e.g. calorie tracking vs national park ticketing).

---

## Decision

**The AI picks the label; code does the comparing (ADR 0013 / 0014).**

Similarity matching runs in deterministic backend code using fields already normalized into `TorInsight`. No additional LLM calls are made at query time.

### 1. Definition of a "Comparable Project"

For GIPDP's price benchmarking (FR-20), two projects are considered comparable when they share:
1. **The same IT Category** (e.g., `software-development` is never benchmarked against network cabling or PC leasing).
2. **The same System Archetype / Deliverable Nature** (e.g., a Mobile App is benchmarked against other Mobile Apps, not against a hospital enterprise ERP).
3. **The same Economic Scale Bracket** (e.g., a ฿500k prototype is not benchmarked against a ฿50M national platform).

#### Why we deliberately do NOT match on specific business topic or `overview.objective`
- **The "Zero-Peer" Trap:** In Thai government procurement, an agency might tender a *"Calories Tracking Application"* once every few years. If we require the domain topic to match, the system finds 0 historical peers, leaving the user with no benchmark.
- **Identical Software Engineering Effort:** A ฿3M mobile app for tracking calories requires the exact same team structure, architecture, and deliverables (iOS/Android apps, user authentication, REST APIs, database, admin CMS, 180-day delivery, 1-year warranty) as a ฿3M mobile app for national park camping reservations. Their market prices are directly comparable.
- **`overview.objective` contains bureaucratic boilerplate:** Thai government project objectives are heavily padded with generic slogans (*"เพื่อยกระดับประสิทธิภาพตามหลักธรรมาภิบาล"*). Matching on objectives causes false-positive similarity based on shared slogans rather than shared technical work.

---

### 2. Fields used from `TorInsight` and why

| Field in `TorInsight` | Data Type | Role in Matching | Rationale |
|---|---|---|---|
| `identification.category` | `String` | **Stage 1: Hard Filter** | Broad IT domain (`software-development`, `data-and-ai`, `network-and-security`, etc.). Guaranteed by Gemini during ingestion. |
| `facts.referencePriceTHB` *(or `budgetTHB`)* | `Number` | **Stage 1: Hard Bracket & Stage 2: Scale Score** | Enforces economic tier bounds ($[0.3\times, 3.0\times]$) and calculates budget scale proximity. |
| `identification.titleTh` & `overview.majorComponents` | `String` / `[String]` | **Stage 2: Scope Archetype Score** | Identifies system archetypes (Mobile, Web Portal, ERP, GIS, Data Platform) via curated domain keyword clusters. |
| `technicalRequirements.requiredTechnologies` | `[Object]` | **Stage 2: Bonus Tech Score (Jaccard)** | Shared technologies (`name`, `version`) boost similarity ranking when present, but are soft-weighted with neutral fallbacks ($0.5$). |
| `facts.deliveryPeriodDays` | `Number` | **Excluded from Hard Filtering** | Contract durations in Thai procurement are frequently compressed to meet the September 30 fiscal budget year-end, rather than reflecting technical complexity. It must never act as a hard filter. |

---

### 3. Why the $[0.3\times, 3.0\times]$ Price Bracket is Necessary

A common question is: *If we calculate the Historical Median anyway, why do we need a hard price bracket? Does it hide price anomalies?*

#### A. The Median alone cannot protect across different economic tiers
The median resists a single freak outlier within a peer group. However, **the median fails completely if candidates come from different economic leagues**:
- Suppose a target project is a small ฿500k mobile app.
- Without a bracket, the system selects large ministry apps costing ฿5M, ฿15M, and ฿40M.
- The median of those peers is ฿15M.
- The system would flag the ฿500k project as $-96.7\%$ underfunded—triggering a false alarm simply because small tools were benchmarked against enterprise platforms.

#### B. The $[0.3\times, 3.0\times]$ bracket DOES NOT hide price anomalies
The bracket spans a **10x price ratio** ($0.3\times$ to $3.0\times$, or $-70\%$ to $+200\%$):
- ADR 0024 defines "Market Normal" as **within $\pm 15\%$** of the median.
- If an agency inflates a standard ฿3M mobile app to **฿10M**:
  - The bracket looks between ฿3M and ฿30M.
  - It finds standard peer apps at ฿3.0M, ฿3.2M, ฿3.5M.
  - Historical median = ฿3.2M.
  - Difference: $\Delta = \frac{10\text{M} - 3.2\text{M}}{3.2\text{M}} = \mathbf{+212.5\%}$.
  - The system easily catches and flags it as **Premium / Above Benchmark**.
- Any abnormal project deviating by $+25\%$, $+50\%$, $-30\%$, or $-60\%$ falls well inside the 10x bracket and is immediately surfaced.

#### C. Database performance
The compound index `{ 'identification.category': 1, 'facts.referencePriceTHB': 1 }` allows MongoDB to fetch 10–20 bounded records in <5ms, rather than scanning thousands of documents into memory.

---

### 4. Sample Size Threshold ($N \ge 3$)

In accordance with ADR 0024, the median requires a minimum sample size:
- **$N = 0$:** `reliability: "none"`. No peer data; benchmarks remain `null`.
- **$1 \le N < 3$:** `reliability: "low"`. Benchmarks are shown, but the UI displays an advisory banner and refuses to issue a definitive normal verdict.
- **$N \ge 3$:** `reliability: "sufficient"`. Mathematically, $N=3$ is the smallest sample that provides a distinct middle value for a true median.

---

### 5. Two-Stage Matching Algorithm

#### Stage 1 — Candidate Pool Query (MongoDB Filter)
- Exact match on `identification.category`
- Bounded range on `facts.referencePriceTHB`:
  $$\text{minPrice} = \text{targetPrice} \times 0.3, \quad \text{maxPrice} = \text{targetPrice} \times 3.0$$
- Exclude target `projectId`
- Filter to `FULL_EXTRACTION` only (ADR 0028)

#### Stage 2 — In-Memory Composite Scoring
$$\text{Score} = 0.45 \cdot S_{\text{scale}} + 0.35 \cdot S_{\text{scope}} + 0.20 \cdot S_{\text{tech}}$$

1. **Scale Proximity ($S_{\text{scale}}$, 45%):**
   $$S_{\text{scale}} = \frac{\min(\text{Price}_A, \text{Price}_B)}{\max(\text{Price}_A, \text{Price}_B)}$$
2. **Scope Overlap ($S_{\text{scope}}$, 35%):**
   Jaccard similarity on domain keyword tokens extracted from `titleTh` and `majorComponents`. If neither project contains recognized domain tokens, defaults to a neutral $0.5$ fallback.
3. **Tech Stack Similarity ($S_{\text{tech}}$, 20%):**
   Jaccard similarity of normalized technology names from `requiredTechnologies`. Defaults to $0.5$ when neither project specifies technologies.

The top 5 highest-scoring candidates populate `analytics.priceAnalysis.comparableProjects`.

---

### 6. Architectural Evolution

- **Current Implementation:** Curated domain keyword clusters in `server/src/features/reality-check/similarity.service.js`.
- **Target Evolution:** Extend the Gemini extraction schema (`schema.js`) to extract a standardized `systemArchetype` enum (`mobile-app`, `web-portal`, `enterprise-erp`, `data-analytics`, `gis-mapping`, `infra-networking`) directly during ingestion. This completely replaces regex keyword matching with direct enum matching, strictly adhering to *"The AI picks the label; code does the comparing."*

---

## Consequences

- **Zero runtime LLM cost:** Matching executes in milliseconds, deterministic and repeatable in tests.
- **No empty comparisons:** Because `category` and economic bounds anchor the search while tech is soft-weighted, the system never fails just because a TOR omitted its stack.
- **Traceable evidence:** Every comparable project includes title, fiscal year, and reference price, allowing bidders and watchdogs to verify the source of the benchmark.
- **Clear separation of concerns:** Discovery search uses specific topic keywords; price benchmarking uses deliverable archetypes and scale.
