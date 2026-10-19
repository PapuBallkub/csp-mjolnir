# 0021 · Define comparable projects by architecture and complexity

Status: accepted · 2026-10-11 (updated 2026-10-19)

## Context

FR-19 requires grouping similar historical IT procurement projects to serve as the baseline for price reality checks (FR-20) and lock-spec detection (FR-21).

In Thai government procurement, defining what makes two software projects "comparable" faces three major hurdles:

1. **The "Zero-Peer" Trap:** Agencies describe requirements in diverse, highly specific domain terms (e.g., "Calorie tracking app" vs. "National park booking app"). If the system searches for similar project descriptions or business topics, it finds zero historical peers.
2. **Bureaucratic Noise:** Project objectives (`overview.objective`) are heavily padded with standard civil service slogans (*"เพื่อยกระดับประสิทธิภาพตามหลักธรรมาภิบาล"*). Text similarity on raw project descriptions produces false matches based on shared slogans rather than shared engineering effort.
3. **Circular Bias in Price Benchmarking:** If the system filters candidate peers by price, it introduces a circular dependency (an overpriced project is only compared against other overpriced projects, concealing the anomaly).

We needed a standardized, defensible way to identify comparable projects that reflects genuine software engineering effort without depending on subjective text matching or circular price filtering.

---

## Decision

**Peers are matched on technical specifications across two standardized levels, grounded in Thai government and software engineering standards.**

Similarity is evaluated in deterministic backend code over AI-extracted attributes, ensuring fast (<10ms), repeatable comparisons without runtime LLM latency or cost.

### 1. Data Fields Used for Similarity Matching

Peers are identified and ranked using **4 normalized technical fields** from the `torInsightSchema` in `server/src/models/tor-insight.model.js`:

| Data Field | Standard / Source | Role in Matching | Why We Chose It (Decision) |
|---|---|---|---|
| `identification.category` | Thai e-GP Procurement Categories | **Hard Filter (Pre-filter)** | **Prevents domain mismatch.** Eliminates completely different procurement types upfront (e.g. software development vs. hardware purchases vs. cabling maintenance). |
| `overview.systemArchetype` | DES & DGA ICT Standards (TDGA) | **Architecture Score (40%)** | **Matches software deliverable pattern.** Differentiates Mobile Apps, Web Portals, ERPs, and GIS Maps within the same broad category. Deliverables dictate team structure and cost. |
| `overview.complexityTier` | Barry Boehm's COCOMO II & DGA Guidelines | **Scope Score (35%)** | **Measures engineering scale without price bias.** Distinguishes small internal tools from nationwide high-concurrency platforms (`basic`, `standard`, `enterprise`). Replaces circular price brackets. |
| `technicalRequirements.requiredTechnologies` | Normalized Tech Vocabulary | **Tech Bonus Score (25%)** | **Soft scoring bonus for shared stack.** Jaccard similarity of frameworks/databases (e.g. React, PostgreSQL). Kept as a soft bonus (not hard filter) so unstated stacks don't return zero peers. |

```
All Ingested Projects in Database
        │
        ▼  [ Level 1: identification.category ]
Hard filter eliminates irrelevant domains:
  - Software development vs Hardware purchase vs Maintenance vs Licenses
        │
        ▼  (Inside ONE single category: e.g. "software-development")
        │
        ▼  [ Level 2: Composite Similarity Scoring ]
Scores candidates on technical specifications:
  ├── 1. Deliverable Architecture  (overview.systemArchetype,      weight = 40%)
  ├── 2. Engineering Complexity    (overview.complexityTier,       weight = 35%)
  └── 3. Tech Stack Overlap        (technicalRequirements.technologies, weight = 25%)
        │
        ▼
Select Top 5 Technical Peers  ──►  Only now, calculate median of their referencePriceTHB
```

---

### 2. Architectural Rationale: Why These Choices?

1. **Software Deliverables Determine Cost, Not Agency Topics:**
   A ฿3M mobile app for tracking calories requires the exact same team structure, mobile UX, API architecture, database, and testing effort as a ฿3M mobile app for booking park reservations. Their engineering costs are directly comparable. Matching on the deliverable archetype (`systemArchetype`) finds legitimate peers where topic matching would return zero results.
2. **Complexity Tiers Replace Circular Price Brackets:**
   Testing whether a price is abnormal while using price to filter candidate peers creates a circular dependency (an overpriced project is only compared against other overpriced projects). Replacing price filters with `complexityTier` (`basic`, `standard`, `enterprise`) ensures peers operate at comparable technical scale while keeping price benchmarking completely independent.
3. **Tech Stack as a Soft Bonus, Not a Hard Requirement:**
   Thai government TORs frequently omit specific programming languages or specify different modern stacks for identical jobs (e.g. React vs Vue, Flutter vs React Native). Weighting `requiredTechnologies` at 25% provides a scoring bonus when stacks align, without disqualifying valid peers when stacks differ or are unstated.
4. **Rejection of `overview.objective` and Semantic Text Search:**
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

- **High Comparability, Zero "Zero-Match" Traps:** Normalizing projects into canonical archetypes and complexity tiers ensures every project finds genuine engineering peers regardless of agency phrasing.
- **Unbiased Market Benchmarks:** Benchmarks are immune to circular price bias because peers are chosen strictly on technical requirements.
- **Traceable & Defensible:** The classification is grounded in official Thai ICT guidelines and standard software engineering cost models.
- **Fast Execution (NFR-01):** The AI assigns structured labels once during ingestion; similarity comparison runs in deterministic code in < 10ms.

