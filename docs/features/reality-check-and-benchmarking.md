# Feature Specification: Reality Check Dashboard & Lock-Spec Flagging

**Feature:** Reality Check Dashboard & Lock-Spec Flagging  
**Related Requirements:**  
- `FR-19`: The system shall identify and group historical IT procurement projects that are similar to a given TOR based on their relevant project characteristics.  
  *(Description: The system identifies historical IT procurement projects that are comparable to a given TOR using relevant characteristics, such as project category, scope, and technical requirements. The resulting groups provide a consistent basis for historical price benchmarking and technical and qualification requirement analysis.)*
- `FR-20`: The system shall analyze a TOR against similar historical IT procurement projects by calculating price benchmarks and identifying deviations in price, technical requirements, and qualification conditions.  
  *(Description: The system calculates the historical median and average prices of comparable projects and compares the current TOR's budget against these benchmarks. It also compares the TOR's technical and qualification requirements against common patterns in similar historical projects. The resulting benchmarks and deviations provide context for evaluating project budgets and identifying potentially unusual requirements.)*
- `FR-21`: The system shall assess technical and qualification requirement deviations against defined lock-specification risk criteria and display a visual warning on TORs classified as high risk.  
  *(Description: The system evaluates requirement deviations identified by FR20 to determine whether they meet the criteria for a high lock-specification risk. For TORs that meet these criteria, the system displays a visual warning and provides supporting findings to help users examine potentially restrictive requirements. A warning indicates a need for further review and does not, by itself, establish that a procurement is unfair.)*
**Related Decisions:**  
- [`0021 · Match comparable projects in code, not with an LLM`](../decisions/0021-find-comparable-projects.md)  
- [`0022 · Pre-compute benchmarks in the pipeline, refresh by batch`](../decisions/0022-precompute-benchmarks-in-the-pipeline.md)  
- [`0024 · Price benchmark bands and sample size thresholds`](../decisions/0024-price-benchmark-bands-and-sample-size-thresholds.md)  
**Status:** Proposed  
**Last Updated:** 2026-10-13  

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

### 5.1 Purpose & Scope
The Price Reality Check evaluates whether a target TOR's declared budget or reference price is in line with historical market reality for comparable IT procurements. It computes statistical benchmarks—both **Historical Median** and **Historical Average**—using the Top-$K$ comparable projects identified by FR-19, and assesses price deviations.

### 5.2 Price Field Selection Rules

In Thai government procurement, projects state both an approved budget (*งบประมาณที่ได้รับจัดสรร*) and an official reference price (*ราคากลาง*).

#### A. Target TOR ($T$)
The evaluation baseline price is resolved using the following precedence:
1. **Primary:** `facts.referencePriceTHB` (*ราคากลาง*) — The statutory price ceiling used to evaluate bids.
2. **Fallback:** `facts.budgetTHB` (*งบประมาณที่ได้รับจัดสรร*) — Used only when the reference price is not yet declared (e.g. draft TOR stage `B0`).
3. **If neither is available:** Price benchmarking cannot be performed. The system records `sampleSize: 0, reliability: 'none'`, and sets calculated metrics to `null` (adhering to ADR 0014: *Missing is not invented — never default to ฿0*).

#### B. Comparable Historical Projects ($C_i$)
For historical projects in MongoDB (`TorInsight`) or archives synced from data.go.th:
- Baseline field: `facts.referencePriceTHB` (with fallback to `facts.budgetTHB`).
- All comparisons use positive numeric values in Thai Baht (THB).

### 5.3 Handling Invalid, Missing, and Outlier Prices

To guarantee statistical validity and prevent poisoned averages:

| Condition | Criteria | System Action |
|---|---|---|
| **Invalid Type / NaN** | `typeof price !== 'number' \|\| Number.isNaN(price)` | Exclude project from calculation pool. |
| **Zero or Negative** | `price <= 0` | Exclude project from calculation pool. |
| **Extreme Scale Outliers** | $C_{\text{price}} < 0.3 \times T_{\text{price}}$ or $C_{\text{price}} > 3.0 \times T_{\text{price}}$ | Filtered at Stage 1 in FR-19 candidate lookup (ADR 0021). |
| **Missing Target Price** | $T_{\text{price}} = \text{null}$ | Skip benchmarking; return `reliability: 'none'`. |

### 5.4 Mathematical Benchmark Calculations

Let the valid prices of the selected comparable projects be sorted in ascending order:
$$P = [p_{(1)}, p_{(2)}, \dots, p_{(N)}] \quad \text{where } p_{(1)} \le p_{(2)} \le \dots \le p_{(N)}$$
where $N = |P|$ is the sample size (`sampleSize`).

#### A. Historical Average (Mean: $\bar{P}$)
$$\bar{P} = \frac{1}{N} \sum_{i=1}^{N} p_i$$
- **Rounding:** Rounded to the nearest integer Baht (`Math.round(mean)`).

#### B. Historical Median ($\tilde{P}$)
The median is the **primary baseline** because procurement prices can have skewed distributions:
$$\tilde{P} = \begin{cases} 
p_{\left(\frac{N+1}{2}\right)} & \text{if } N \text{ is odd} \\
\frac{p_{\left(\frac{N}{2}\right)} + p_{\left(\frac{N}{2} + 1\right)}}{2} & \text{if } N \text{ is even}
\end{cases}$$
- **Rounding:** Rounded to the nearest integer Baht (`Math.round(median)`).

#### C. Price Difference Percentage ($\Delta$)
The primary deviation is calculated against the Historical Median:
$$\Delta = \left( \frac{T_{\text{price}} - \tilde{P}}{\tilde{P}} \right) \times 100\%$$
*(Secondary deviation against Average $\Delta_{\text{avg}} = \frac{T_{\text{price}} - \bar{P}}{\bar{P}} \times 100\%$ is also preserved for transparency).*
- **Rounding:** Stored to 1 decimal place (e.g. `+12.4%`, `-8.2%`).

### 5.5 Sample Size Reporting & Confidence Thresholds

The system explicitly reports the sample size ($N$) alongside reliability indicators:

| Sample Size ($N$) | Reliability | Interpretation & System Behavior |
|---|---|---|
| **$N = 0$** | `none` | **No benchmark available.**<br>Copy: *"ไม่พบโครงการเปรียบเทียบในหมวดหมู่และช่วงงบประมาณเดียวกัน"*<br>Metrics (`historicalMedianTHB`, `diffPercentage`) remain `null`. |
| **$1 \le N < 3$** | `low` | **Low sample size advisory.**<br>Calculations displayed with an advisory disclaimer.<br>Copy: *"คำนวณจากโครงการเปรียบเทียบจำนวน {N} โครงการ ข้อมูลอาจยังไม่สะท้อนแนวโน้มตลาดทั้งหมด (เบี่ยงเบน {Δ}%)"* |
| **$3 \le N \le 5$** | `sufficient` | **Standard confidence.**<br>Full Reality Check classification and verdict assigned. |

### 5.6 Verdict & Classification Rules (When $N \ge 3$)

| Difference Range | Classification | Tone | Interpretation Copy (Thai) |
|---|---|---|---|
| $\Delta > +15\%$ | Premium / Over Benchmark | Amber / Warning | *"ราคากลางสูงกว่าค่ามัธยฐานในอดีตประมาณ +X% สำหรับโครงการขนาดใกล้เคียงกัน"* |
| $-15\% \le \Delta \le +15\%$ | Market Normal | Neutral / Open | *"ราคากลางอยู่ในเกณฑ์ปกติเมื่อเทียบกับโครงการใกล้เคียงในอดีต (เบี่ยงเบน X%)"* |
| $\Delta < -15\%$ | Underfunded / Outlier | Crimson / Risk | *"ราคากลางต่ำกว่าค่ามัธยฐานในอดีตประมาณ -X% อาจมีความเสี่ยงเรื่องงบประมาณจำกัดเกินไป"* |

### 5.7 Data Model Schema (`TorInsight.analytics.priceAnalysis`)

Stored in `TorInsight` as pre-computed fields:

```javascript
priceAnalysis: {
  referencePriceTHB: { type: Number, default: null },
  historicalMedianTHB: { type: Number, default: null },
  historicalAverageTHB: { type: Number, default: null },
  diffPercentage: { type: Number, default: null }, // vs median
  diffAveragePercentage: { type: Number, default: null }, // vs mean
  sampleSize: { type: Number, default: 0 },
  reliability: { 
    type: String, 
    enum: ['none', 'low', 'sufficient'], 
    default: 'none' 
  },
  interpretation: { type: String, default: '', trim: true },
  comparableProjects: [comparableProjectSchema],
}
```

### 5.8 Reference Implementation

```javascript
export function calculatePriceBenchmarks(targetTor, comparableProjects = []) {
  const targetPrice = getProjectPrice(targetTor);

  // Filter valid positive prices
  const validPrices = (comparableProjects || [])
    .map((p) => p.referencePriceTHB ?? getProjectPrice(p.candidate))
    .filter((price) => typeof price === 'number' && !Number.isNaN(price) && price > 0)
    .sort((a, b) => a - b);

  const sampleSize = validPrices.length;

  if (!targetPrice || sampleSize === 0) {
    return {
      referencePriceTHB: targetPrice ?? null,
      historicalMedianTHB: null,
      historicalAverageTHB: null,
      diffPercentage: null,
      diffAveragePercentage: null,
      sampleSize: 0,
      reliability: 'none',
      interpretation: 'ไม่พบโครงการเปรียบเทียบในหมวดหมู่และช่วงงบประมาณเดียวกัน',
      comparableProjects: [],
    };
  }

  // 1. Average (Mean)
  const sum = validPrices.reduce((acc, val) => acc + val, 0);
  const average = Math.round(sum / sampleSize);

  // 2. Median (Odd vs Even handling)
  const mid = Math.floor(sampleSize / 2);
  const median =
    sampleSize % 2 !== 0
      ? validPrices[mid]
      : Math.round((validPrices[mid - 1] + validPrices[mid]) / 2);

  // 3. Difference Percentages
  const diffPercentage = Number((((targetPrice - median) / median) * 100).toFixed(1));
  const diffAvg = Number((((targetPrice - average) / average) * 100).toFixed(1));
  const reliability = sampleSize >= 3 ? 'sufficient' : 'low';

  // 4. Interpretation copy
  let interpretation = '';
  if (reliability === 'low') {
    interpretation = `คำนวณจากโครงการเปรียบเทียบจำนวน ${sampleSize} โครงการ ข้อมูลอาจยังไม่สะท้อนแนวโน้มตลาดทั้งหมด (เบี่ยงเบน ${diffPercentage > 0 ? '+' : ''}${diffPercentage}%)`;
  } else if (diffPercentage > 15) {
    interpretation = `ราคากลางสูงกว่าค่ามัธยฐานในอดีตประมาณ +${diffPercentage}% สำหรับโครงการขนาดใกล้เคียงกัน`;
  } else if (diffPercentage < -15) {
    interpretation = `ราคากลางต่ำกว่าค่ามัธยฐานในอดีตประมาณ ${diffPercentage}% อาจมีความเสี่ยงเรื่องงบประมาณจำกัดเกินไป`;
  } else {
    interpretation = `ราคากลางอยู่ในเกณฑ์ปกติเมื่อเทียบกับโครงการใกล้เคียงในอดีต (เบี่ยงเบน ${diffPercentage > 0 ? '+' : ''}${diffPercentage}%)`;
  }

  return {
    referencePriceTHB: targetPrice,
    historicalMedianTHB: median,
    historicalAverageTHB: average,
    diffPercentage,
    diffAveragePercentage: diffAvg,
    sampleSize,
    reliability,
    interpretation,
    comparableProjects: comparableProjects.map((p) => ({
      title: p.title,
      year: p.year,
      referencePriceTHB: p.referencePriceTHB,
    })),
  };
}
```

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
