# 0021 · Define comparable projects by architecture and complexity

Status: accepted · 2026-10-11 (updated 2026-11-06, [0034](0034-a-tor-can-have-several-categories.md))

## Context

FR-19 requires grouping similar historical IT procurement projects to serve as the baseline for price reality checks (FR-20) and lock-spec detection (FR-21).

In Thai government procurement, defining what makes two software projects "comparable" faces three major hurdles:

1. **The "Zero-Peer" Trap:** Agencies describe requirements in diverse, highly specific domain terms (e.g., "Calorie tracking app" vs. "National park booking app"). If the system searches for similar project descriptions or business topics, it finds zero historical peers.
2. **Bureaucratic Noise:** Project objectives (`overview.objective`) are heavily padded with standard civil service slogans (*"เพื่อยกระดับประสิทธิภาพตามหลักธรรมาภิบาล"*). Text similarity on raw project descriptions produces false matches based on shared slogans rather than shared engineering effort.
3. **Circular Bias in Price Benchmarking:** If the system filters candidate peers by price, it introduces a circular dependency (an overpriced project is only compared against other overpriced projects, concealing the anomaly).

We needed a standardized, defensible way to identify comparable projects that reflects genuine software engineering effort without depending on subjective text matching or circular price filtering.

---

## Decision

**Peers are matched on technical specifications across two standardized levels, grounded in Thai government and software engineering standards, with strict baseline data stability and extraction confidence pre-filters.**

Similarity is evaluated in deterministic backend code over AI-extracted attributes, ensuring fast (<10ms), repeatable comparisons without runtime LLM latency or cost.

### 1. Data Fields Used for Similarity Matching

Peers are identified and ranked using pre-filters for data stability and quality, followed by **normalized technical fields** from the `torInsightSchema` in `server/src/models/tor-insight.model.js`:

| Data Field | Standard / Source | Role in Matching | Why We Chose It (Decision) |
|---|---|---|---|
| `identification.categories` | Thai e-GP Procurement Categories | **Hard Filter (Pre-filter), then Category Score (15%)** | **Prevents domain mismatch.** A peer shares at least one category, which eliminates completely different procurement types upfront (e.g. software development vs. cabling maintenance). Sharing more of them, in the same order, then scores higher (ADR 0034). |
| `identification.status` | Thai e-GP Lifecycle Status | **Hard Filter (Stability Pre-filter)** | **Accepts only concluded projects (`'Closed'`, `'Awarded'`).** Excludes `Draft` (still in public hearing) and active `Open` tenders (which can be amended, re-budgeted, or cancelled) to guarantee price and specification stability. |
| `metadata.confidenceScore` | AI Extraction Rules Engine (NFR-17) | **Hard Filter (Quality Pre-filter)** | **Requires confidence score $\ge 80\%$.** Low-confidence or unverified extractions are withheld from peer benchmarking to avoid skewing price reality checks. |
| `metadata.titleOnly` / `awaitingFullText` / `excluded` | Ingestion Status (ADR 0028) | **Hard Filter (Full Read Pre-filter)** | **Requires full document extraction.** Title-level stubs and pending previews lack technical attributes and cannot be scored. |
| `overview.systemArchetype` | DES & DGA ICT Standards (TDGA) | **Architecture Score (35%)** | **Matches software deliverable pattern.** Differentiates Mobile Apps, Web Portals, ERPs, and GIS Maps within the same broad category. Deliverables dictate team structure and cost. |
| `overview.complexityTier` | Barry Boehm's COCOMO II & DGA Guidelines | **Scope Score (30%)** | **Measures engineering scale without price bias.** Distinguishes small internal tools from nationwide high-concurrency platforms (`basic`, `standard`, `enterprise`). Replaces circular price brackets. |
| `technicalRequirements.requiredTechnologies` | Normalized Tech Vocabulary | **Tech Bonus Score (20%)** | **Soft scoring bonus for shared stack.** Jaccard similarity of frameworks/databases (e.g. React, PostgreSQL). Kept as a soft bonus (not hard filter) so unstated stacks don't return zero peers. |

```
All Ingested Projects in Database
        │
        ▼  [ Level 1: Pre-filters (Domain, Stability & Quality) ]
Hard filters eliminate irrelevant, volatile, or unverified records:
  ├── 1. Shares a procurement category: identification.categories
  ├── 2. Concluded status only: identification.status in ['Closed', 'Awarded']
  ├── 3. High extraction confidence: metadata.confidenceScore >= 80 (NFR-17)
  └── 4. Full document extraction: isFullExtraction = true (ADR 0028)
        │
        ▼  (Sharing at least one category: e.g. "software-development")
        │
        ▼  [ Level 2: Composite Similarity Scoring ]
Scores candidates on technical specifications:
  ├── 1. Deliverable Architecture  (overview.systemArchetype,           weight = 35%)
  ├── 2. Engineering Complexity    (overview.complexityTier,            weight = 30%)
  ├── 3. Tech Stack Overlap        (technicalRequirements.technologies, weight = 20%)
  └── 4. Category Overlap & Order  (identification.categories,          weight = 15%)
        │
        ▼
Select Top 5 Technical Peers  ──►  Only now, calculate median of their referencePriceTHB
```

---

### 2. Architectural Rationale: Why These Choices?

1. **Only Concluded Projects (`Closed` / `Awarded`) Provide a Stable Baseline:**
   Tenders in `Draft` are still open to public comments and hearings (วิจารณ์ร่าง) and their technical specifications or budgets often shift. Active `Open` tenders may receive amendments (`D2`), deadline extensions, or outright cancellations (`D1`). Only tenders that have completed their bidding cycle (`Closed`) or reached contractor award (`Awarded`) offer reliable, unalterable historical evidence for market pricing.
2. **Extraction Confidence $\ge 80\%$ (NFR-17) Protects Benchmark Integrity:**
   If an AI extraction had low confidence (< 80%) or failed sanity checks, using its extracted numbers in historical peer pools risks polluting subsequent price reality checks for other projects. Filtering candidates by `confidenceScore >= 80` enforces NFR-17 across analytical peer selection.
3. **Software Deliverables Determine Cost, Not Agency Topics:**
   A ฿3M mobile app for tracking calories requires the exact same team structure, mobile UX, API architecture, database, and testing effort as a ฿3M mobile app for booking park reservations. Their engineering costs are directly comparable. Matching on the deliverable archetype (`systemArchetype`) finds legitimate peers where topic matching would return zero results.
4. **Complexity Tiers Replace Circular Price Brackets:**
   Testing whether a price is abnormal while using price to filter candidate peers creates a circular dependency (an overpriced project is only compared against other overpriced projects). Replacing price filters with `complexityTier` (`basic`, `standard`, `enterprise`) ensures peers operate at comparable technical scale while keeping price benchmarking completely independent.
5. **Tech Stack as a Soft Bonus, Not a Hard Requirement:**
   Thai government TORs frequently omit specific programming languages or specify different modern stacks for identical jobs (e.g. React vs Vue, Flutter vs React Native). Weighting `requiredTechnologies` at 20% provides a scoring bonus when stacks align, without disqualifying valid peers when stacks differ or are unstated.
6. **Rejection of `overview.objective` and Semantic Text Search:**
   Government TOR objectives reflect administrative rhetoric rather than technical deliverables (*"เพื่อยกระดับประสิทธิภาพตามหลักธรรมาภิบาล"*). Matching on raw objectives causes false-positive similarity on shared slogans while missing actual engineering peers.

---

### 3. Standards Grounding

Both classification dimensions are formally anchored in established public-sector and academic standards:

- **System Archetypes (9 canonical classes):** Directly synthesized from the Ministry of Digital Economy and Society (DES / กระทรวงดิจิทัลเพื่อเศรษฐกิจและสังคม) official ICT Reference Price Catalog and the Digital Government Development Agency (DGA / สพร.) Thailand Digital Government Architecture Framework (TDGA):  
  `mobile-app`, `web-portal`, `enterprise-erp`, `edoc-workflow`, `data-analytics`, `gis-mapping`, `cybersecurity`, `iot-telemetry`, `infra-networking` (plus `other`).
- **Complexity Tiers (3 tiers):** Grounded in Barry Boehm’s COCOMO II model (*Organic*, *Semi-Detached*, *Embedded*) and Comptroller General's Department / DGA function-point software sizing guidelines:  
  `basic` (departmental/workgroup), `standard` (agency-wide/moderate), `enterprise` (high-concurrency/nationwide/mission-critical).

*(For the complete mathematical scoring formulas, field schemas, and implementation pipeline, see the [Comparable Projects Matching Feature Guide](../features/comparable-projects-matching.md)).*

---

## Consequences

- **Stable Historical Benchmarks:** Excluding active `Open` and `Draft` listings ensures peers represent immutable, completed government procurements.
- **High Quality Data Pool:** Restricting candidates to extractions with confidence $\ge 80\%$ (NFR-17) guarantees benchmarks are computed from clean, validated data.
- **High Comparability, Zero "Zero-Match" Traps:** Normalizing projects into canonical archetypes and complexity tiers ensures every project finds genuine engineering peers regardless of agency phrasing.
- **Unbiased Market Benchmarks:** Benchmarks are immune to circular price bias because peers are chosen strictly on technical requirements.
- **Traceable & Defensible:** The classification is grounded in official Thai ICT guidelines and standard software engineering cost models.
- **Fast Execution (NFR-01):** The AI assigns structured labels once during ingestion; similarity comparison runs in deterministic code in < 10ms.
