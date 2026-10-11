# Feature Specification: Reality Check Dashboard & Lock-Spec Flagging

**Feature:** Reality Check Dashboard & Lock-Spec Flagging  
**Related Requirements:**  
- `FR-19`: Identify and group historical IT procurement projects based on relevant characteristics  
- `FR-20`: Analyze TOR against similar historical projects (price benchmarks & requirement deviations)  
- `FR-21`: Assess requirement deviations against lock-spec risk criteria & display visual warning  
**Related Decisions:**  
- [`0021 · Match comparable projects in code, not with an LLM`](../decisions/0021-find-comparable-projects.md)  
- [`0022 · Pre-compute benchmarks in the pipeline, refresh by batch`](../decisions/0022-precompute-benchmarks-in-the-pipeline.md)  
**Status:** Proposed  
**Last Updated:** 2026-10-11  

---

## 1. Overview & Objective

The Reality Check & Lock-Spec feature is GIPDP's signature analytical capability. It shifts the platform from a passive PDF viewer into an **active decision-support discovery tool**.

Small Thai tech companies and freelance developers often cannot tell if:
1. **The budget is realistic** (is the project underfunded or inflated vs. historical market norms?)
2. **The procurement is locked / tailored** (are qualification conditions or technical specs rigged to favor an incumbent?)

This feature addresses both questions by:
- Grouping comparable historical projects (**FR-19**)
- Computing statistical price benchmarks and identifying requirement deviations (**FR-20**)
- Scoring and visually flagging lock-spec risks with concrete evidence (**FR-21**)

---

## 2. Information Architecture & Data Flow

```
                      Raw TOR / Scanned PDF
                                │
                                ▼
                       AI Extraction Step
              (Classifies category & extracts facts)
                                │
                                ▼
               ┌─────────────────────────────────┐
               │    Normalized TorInsight Doc    │
               └────────────────┬────────────────┘
                                │
            ┌───────────────────┴───────────────────┐
            │                                       │
            ▼                                       ▼
    [ FR-19 Similarity Engine ]            [ Single-TOR Checks ]
    - Query candidate pool via             - Check exact version mandates
      compound index                       - Check MAF on service contracts
    - Calculate composite score            - Check experience vs. budget ratio
    - Select Top-K comparable projects              │
            │                                       │
            ▼                                       │
    [ FR-20 Reality Check ]                         │
    - Compute Historical Median & Avg               │
    - Calculate diffPercentage                      │
    - Compare qualification baselines               │
            │                                       │
            └───────────────────┬───────────────────┘
                                │
                                ▼
                    [ FR-21 Lock-Spec Scoring ]
                    - Aggregate deviation findings
                    - Compute riskScore (0–100)
                    - Assign verdict & tone
                                │
                                ▼
         Save to `TorInsight.analytics` in MongoDB
         (Rendered on Detail Page & Watchdog View)
```

---

## 3. Data Fields Used from `TorInsight`

All benchmarking and analysis rely on fields already normalized by the extraction pipeline:

| Section in `TorInsight` | Field | Role & Justification |
|---|---|---|
| `identification` | `category` | **Primary Hard Filter.** Ensures comparisons remain within the same domain (`software-development`, `systems-integration`, `data-and-ai`, `network-and-security`, etc.). |
| `identification` | `titleTh` | **Scope Keyword Matching.** Distinguishes sub-domains (e.g. ERP, Mobile App, GIS, Portal). |
| `facts` | `referencePriceTHB`, `budgetTHB` | **Scale Proximity & Price Benchmarking.** Establishes budget bracket and serves as the baseline for deviation calculation. |
| `facts` | `deliveryPeriodDays` | **Scope Scale Context.** Reflects expected project delivery timeframe. |
| `overview` | `majorComponents` | **Scope Similarity.** Overlapping functional modules increase project comparability score. |
| `technicalRequirements` | `requiredTechnologies` | **Bonus Ranking (Jaccard).** Shared technologies (`name`, `version`) boost similarity ranking. Explicit versions are flagged as lock-spec signals. |
| `eligibility` | `previousExperienceMinTHB` | **Qualification Deviation Check.** Compares past experience requirement against project reference price. |
| `eligibility` | `requiredCertifications` | **Market Standard Check.** Compares required company/personnel certificates against category baselines. |
| `eligibility` | `manufacturerAuthorizations` | **Lock-Spec Check.** Detects OEM authorization requirements (MAF) on pure software development services. |

---

## 4. FR-19: Grouping & Similarity Matching Algorithm

### 4.1 Candidate Pool Query (Stage 1)
Given a target TOR $T$, query MongoDB with a compound index on `(identification.category, facts.referencePriceTHB)`:

$$\text{Category} = T.\text{category}$$
$$0.3 \times T.\text{referencePriceTHB} \le \text{referencePriceTHB} \le 3.0 \times T.\text{referencePriceTHB}$$
$$\text{projectId} \neq T.\text{projectId}$$

### 4.2 Composite Similarity Scoring (Stage 2)
For each candidate $C$ in the retrieved pool, calculate a composite similarity score $S \in [0, 1]$:

$$S = 0.45 \cdot S_{\text{scale}} + 0.35 \cdot S_{\text{scope}} + 0.20 \cdot S_{\text{tech}}$$

- **Scale Proximity ($S_{\text{scale}}$):**
  $$S_{\text{scale}} = \frac{\min(T.\text{price}, C.\text{price})}{\max(T.\text{price}, C.\text{price})}$$
- **Scope Keyword Similarity ($S_{\text{scope}}$):**
  Jaccard overlap of domain tokens (ERP, GIS, e-Service, Mobile, Cloud, Security) found in title and `majorComponents`. (Defaults to 0.5 if neither project contains specialized domain tokens).
- **Technology Overlap ($S_{\text{tech}}$):**
  Jaccard index of normalized technology names:
  $$S_{\text{tech}} = \frac{|T.\text{tech} \cap C.\text{tech}|}{|T.\text{tech} \cup C.\text{tech}|}$$
  *(Defaults to 0.5 if both have unspecified tech; 0.2 if one is specified and the other empty).*

The candidates are sorted descending by $S$. The **top 3 to 5** candidates are selected as `comparableProjects`.

---

## 5. FR-20: Price Reality Check & Deviation Calculation

### 5.1 Benchmark Metrics
Using the reference prices $P = [p_1, p_2, \dots, p_k]$ of the selected comparable projects:

- **Historical Median ($\tilde{P}$):**
  $$\tilde{P} = \text{median}(P)$$
- **Price Difference Percentage ($\Delta$):**
  $$\Delta = \frac{T.\text{referencePriceTHB} - \tilde{P}}{\tilde{P}} \times 100\%$$

### 5.2 Verdict & Interpretation Rules

| Difference Range | Classification | Tone | Interpretation Copy (Thai) |
|---|---|---|---|
| $\Delta > +15\%$ | Premium / Over Benchmark | Amber / Warning | *"ราคากลางสูงกว่าค่ามัธยฐานในอดีตประมาณ X% สำหรับโครงการขนาดใกล้เคียงกัน"* |
| $-15\% \le \Delta \le +15\%$ | Market Normal | Neutral / Open | *"ราคากลางอยู่ในเกณฑ์ปกติเมื่อเทียบกับโครงการใกล้เคียงในอดีต (เบี่ยงเบน X%)"* |
| $\Delta < -15\%$ | Underfunded / Outlier | Crimson / Risk | *"ราคากลางต่ำกว่าค่ามัธยฐานในอดีตประมาณ X% อาจมีความเสี่ยงเรื่องงบประมาณจำกัดเกินไป"* |

---

## 6. FR-21: Lock-Spec Risk Scoring & Flagging

FR-21 assesses requirement deviations from FR-20 against defined lock-specification risk criteria.

### 6.1 Lock-Spec Risk Findings

Each deviation is modeled as an individual, self-contained finding (`findingSchema`):
- `id`: Unique finding identifier (e.g., `FIND-68039469567-01`)
- `title`: Short verdict title (e.g. *"กำหนดหนังสือแต่งตั้งตัวแทนจำหน่าย (MAF) ในงานจ้างบริการ"*)
- `category`: Finding category (`Vendor Lock-in`, `Qualification Barrier`, `Specification Tailoring`)
- `requirementText`: The exact clause extracted from the TOR
- `normalBenchmark`: The market/historical baseline (e.g. *"งานจ้างพัฒนาทั่วไปไม่กำหนด MAF"*)
- `sourceExcerpt` & `sourceLocation`: Page and section reference for traceability
- `severity`: `high` (30 pts), `medium` (15 pts), `low` (5 pts)

### 6.2 Key Deviation Criteria Evaluated

1. **Prior Experience Exceeds Normal Ratio:**
   - Standard practice in Thai government procurement sets minimum past experience $\le 50\%$ of the reference price.
   - If `eligibility.previousExperienceMinTHB` $> 0.5 \times \text{referencePriceTHB}$ $\rightarrow$ **Medium Severity**.
   - If $> 0.8 \times \text{referencePriceTHB}$ $\rightarrow$ **High Severity**.
2. **MAF Required on Software Development (`hire`):**
   - If `eligibility.manufacturerAuthorizations` is present for `procurementKind === 'hire'` $\rightarrow$ **High Severity**.
3. **Exact Outdated / Single-Vendor Version Locked:**
   - If `technicalRequirements.requiredTechnologies` specifies an exact minor version or end-of-life platform where peers accept open standards $\rightarrow$ **High Severity**.
4. **Disproportionate Certifications:**
   - Demanding CMMI Level 5 or ISO 27001 on small budget projects (< 5M THB) $\rightarrow$ **Medium Severity**.

### 6.3 Risk Score Calculation & Visual System

$$\text{riskScore} = \min(100, \sum \text{severity\_points})$$

- **High Risk ($\ge 70$):** Visual warning banner (`text-risk`, crimson hue) prominently displayed on the detail page and catalog row. Verdict copy states: *"ความเสี่ยงสูง: พบเงื่อนไขที่อาจจำกัดการแข่งขันเฉพาะราย"*.
- **Medium Risk ($35 \le \text{riskScore} < 70$):** Amber advisory banner (`text-amend`).
- **Low / Clean ($< 35$):** Normal status (`text-open`).

---

## 7. Update Lifecycle & Operational Commands

### 7.1 Lifecycle Triggers
1. **Pipeline Execution (Ingestion Trigger):**
   Computed immediately after Gemini extraction in `server/src/pipeline/extraction/process-tor.js`. Pre-calculated data is written to `TorInsight.analytics`.
2. **Batch Refresh Trigger (`npm run comparable -- --all --save`):**
   Scheduled job (e.g., weekly) that re-runs similarity and median calculations across active `Open` TORs to incorporate newly completed historical tenders from data.go.th.
3. **HTTP Serving:**
   API endpoints (`/api/tors/:id`) read pre-computed analytics directly from MongoDB with zero on-the-fly math, ensuring page load times remain $< 2\text{s}$ (NFR-01).

### 7.2 Operational Commands

#### Local Execution (from `server/`)
```bash
# Test one TOR
npm run comparable -- --id <projectId>

# Run across all projects and save to MongoDB
npm run comparable -- --all --save
```

#### Docker Execution
```bash
# If containers are already running (docker compose up):
docker compose exec server npm run comparable -- --id <projectId>
docker compose exec server npm run comparable -- --all --save

# As a one-off task (starts dependencies automatically):
docker compose run --rm server npm run comparable -- --id <projectId>
docker compose run --rm server npm run comparable -- --all --save
```
