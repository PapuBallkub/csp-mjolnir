# 0024 · Price benchmark bands and sample size thresholds

Status: accepted · 2026-10-12

## Context

Once comparable IT procurement projects are identified (FR-19, ADR 0021), the platform evaluates the target TOR's declared budget or reference price against these historical peers (FR-20, Price Reality Check).

Four questions arise for public display on the TOR Detail / Summary page:
1. **Which price point should be evaluated?** Government tenders state an approved budget (*งบประมาณ*), a reference price (*ราคากลาง*), and past tenders record winning contract prices (*ราคาตามสัญญา*). Evaluating the wrong price point risks false alarms.
2. **Which central tendency measure should be the primary benchmark?** Procurement budgets in government contracts can vary from ฿1M to ฿50M within broad categories. High outliers heavily skew the arithmetic mean.
3. **What percentage deviation constitutes a notable divergence?** Normal procurement variance, inflation, and differing contractor rates mean that a 5–10% difference is standard market noise, whereas large deviations indicate underfunding or premium allowances.
4. **How many historical peers ($N$) are needed before a benchmark is statistically credible?** In specialized software domains or emerging tech, the database may only match 1 or 2 historical projects. Displaying a rigid verdict on $N=1$ could mislead users.

## Decision

### 1. Historical Median over Average as Primary Baseline

- **The Historical Median ($\tilde{P}$)** is the primary reference price. It represents the 50th percentile of peers and is robust against skewed high-value outliers.
- **The Historical Average (Mean $\bar{P}$)** is retained in the data model and displayed as secondary context, but deviation percentages and risk bands are calculated relative to the Median.
- All benchmark calculations round to the nearest whole Baht (`Math.round()`).

### 2. Sample Size Thresholds ($N \le 5$)

The similarity engine selects up to 5 highest-ranking peers ($K = 5$). The system evaluates the number of valid peer prices ($N$) using three distinct reliability tiers:

| Sample Size ($N$) | Reliability Tier | System Behavior |
|:---:|:---:|---|
| **$N = 0$** | `none` | **No benchmark available.** `historicalMedianTHB`, `historicalAverageTHB`, and `diffPercentage` remain `null` (ADR 0014). The UI states plainly that no direct comparable projects were found. |
| **$1 \le N < 3$** | `low` | **Low sample size advisory.** Benchmarks and deviation percentages are computed but accompanied by a visible advisory note: *"คำนวณจากโครงการเปรียบเทียบจำนวน {N} โครงการ ข้อมูลอาจยังไม่สะท้อนแนวโน้มตลาดทั้งหมด"*. |
| **$3 \le N \le 5$** | `sufficient` | **Standard confidence.** Full deviation classification and verdict styling are applied. |

### 3. Price Tolerance Bands ($\pm 15\%$)

For records with `sufficient` reliability ($N \ge 3$), the percentage deviation from the median ($\Delta = \frac{T_{\text{price}} - \tilde{P}}{\tilde{P}} \times 100\%$) is classified into three bands:

1. **Market Normal ($-15.0\% \le \Delta \le +15.0\%$):**
   - **Tone:** Neutral / Open (`text-open`, green indicator).
   - **Copy:** *"ราคากลางอยู่ในเกณฑ์ปกติเมื่อเทียบกับโครงการใกล้เคียงในอดีต (เบี่ยงเบน {±Δ}%)"*.
2. **Premium / Over Benchmark ($\Delta > +15.0\%$):**
   - **Tone:** Amber (`text-amend`).
   - **Copy:** *"ราคากลางสูงกว่าค่ามัธยฐานในอดีตประมาณ +{Δ}% สำหรับโครงการขนาดใกล้เคียงกัน"*.
3. **Underfunded / Scope Risk ($\Delta < -15.0\%$):**
   - **Tone:** Crimson (`text-risk`).
   - **Copy:** *"ราคากลางต่ำกว่าค่ามัธยฐานในอดีตประมาณ {Δ}% อาจมีความเสี่ยงเรื่องงบประมาณจำกัดเกินไปเมื่อเทียบกับขอบเขตงาน"*.

### 4. Reference Price as the Evaluated Price Point ($T_{\text{price}}$ and $\tilde{P}$)

- **Target Evaluated Price ($T_{\text{price}}$):** Resolved as `facts.referencePriceTHB` (with fallback to `facts.budgetTHB` if the project is in early draft stage without a published reference price).
- **Historical Median Benchmark ($\tilde{P}$):** Computed from historical peers' `facts.referencePriceTHB` to preserve apples-to-apples statutory equivalence and avoid false alarms from post-bidding competition discounts.
- **Contract Price as Context:** Where available, historical winning contract prices (`contract.agreedPriceTHB`) are displayed alongside peer records in `comparableProjects` for bidder transparency, but are not mixed into the baseline deviation formula.

### 5. Non-Accusatory Tone Rule

In accordance with Section 7 of `AGENTS.md`, the platform presents factual evidence and never accuses. Deviations are labeled as descriptive price observations ("ราคากลางสูงกว่าค่ามัธยฐาน...", "อาจมีความเสี่ยงเรื่องงบประมาณจำกัด"), never as accusations of corruption, rigging, or collusion.

### 6. Rationale & Standards Grounding

#### Why Sample Size Thresholds ($N \le 5$, with $N < 3$ as Low and $3 \le N \le 5$ as Sufficient)?

1. **Thai Procurement Law "Rule of 3" (เกณฑ์การสืบราคาไม่น้อยกว่า 3 ราย):**
   - **Source:** *พระราชบัญญัติการจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560* (Section 64) and *ระเบียบกระทรวงการคลังว่าด้วยการจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560* (Clause 28).
   - When procurement committees determine a reference price (*ราคากลาง*) through market price investigation (*การสืบราคาจากท้องตลาด*) or past comparable contracts, statutory regulations require obtaining prices from **at least 3 active vendors/sources (ไม่น้อยกว่า 3 ราย)** to establish a legally defensible baseline.
   - When GIPDP finds $N < 3$ historical peers, the benchmark fails this standard 3-vendor quorum. The platform therefore marks it as `low` reliability with an advisory disclaimer. When $N \ge 3$, it meets the recognized statutory quorum for comparable price evaluation.
2. **Statistical Outlier Breakdown Point of the Median:**
   - In small-sample non-parametric statistics, the sample median ($\tilde{P}$) has a 50% breakdown point.
   - With $N = 3$, the median resists **1 extreme outlier** without distortion.
   - With $N = 5$, the median resists **up to 2 extreme outliers** (e.g., one bloated project and one heavily underfunded pilot), preserving a true central market rate.
3. **Prevention of "Peer Dilution" (Top-5 vs. Top-20):**
   - In comparative market analysis (Nearest-Neighbor / Comparable Sales method), expanding the peer group beyond the Top-5 forces the inclusion of lower-scoring matches (divergent tech stacks or borderline complexity tiers).
   - Restricting candidate peers to $K \le 5$ maximizes technical homogeneity while providing sufficient sample density for median calculation.

#### Why Price Tolerance Bands ($\pm 15\%$)?

1. **Thai ICT Cost Estimation Standards (เกณฑ์ราคากลาง ICT กระทรวงดิจิทัลฯ - DES):**
   - **Source:** *เกณฑ์ราคากลางและคุณลักษณะพื้นฐานการจัดหาอุปกรณ์และระบบคอมพิวเตอร์* โดยกระทรวงดิจิทัลเพื่อเศรษฐกิจและสังคม (DES) and Comptroller General's Department Software Development Costing Guidelines.
   - Standard government software estimation models derive budgets from Man-Month (MM) labor rates augmented by:
     - Administrative and management overhead (ค่าอำนวยการ): ~5–7%
     - Contractor profit margin (กำไร): ~7–10%
     - Fluctuation buffer / contingency (ค่าเผื่อความผันผวน): ~3–5%
   - These structural cost components naturally yield a **$\pm 10\%$ to $\pm 15\%$ variance** between differing agency estimates and contractor bidding models for an identical technical scope.
2. **State Audit & e-GP Scrutiny Thresholds (การตรวจสอบความผิดปกติของราคา):**
   - Guidelines from the State Audit Commission (*คตง.* / *สตง.*) and e-GP price evaluation standards treat variations within $\pm 15\%$ as standard market noise (attributable to inflation, agency location, or extended warranty terms).
   - Deviations beyond this band reflect genuine project risk:
     - **$\Delta > +15.0\%$ (Premium):** The budget substantially exceeds historical peers for identical technical scope and complexity tier.
     - **$\Delta < -15.0\%$ (Underfunded):** The reference price is depressed relative to historical peer norms, signaling high risk of **budget squeeze, contractor abandonment (*การทิ้งงาน*), or degraded deliverable quality**.
3. **Software Engineering Cost Estimation ("Cone of Uncertainty" / COCOMO II):**
   - Software engineering estimation literature (Barry Boehm's COCOMO II and IEEE software sizing standards) confirms that even when system archetypes and complexity tiers are well normalized, organizational factors and non-functional requirements introduce an expected **$\pm 15\%$ estimation band** across comparable software systems.
4. **Platform Principle: "Describe, Don't Accuse" (AGENTS.md Section 7):**
   - An excessively narrow band (e.g. $\pm 5\%$) would trigger false alarms on normal market variance, eroding user trust. Setting the tolerance at $\pm 15\%$ ensures visual warnings (Amber or Crimson) are reserved for statistically meaningful deviations.

#### Why Benchmark Against Reference Price over Budget or Contract Price?

1. **Budget (งบประมาณ) is structurally uncalibrated:**
   - Budgets are requested and approved 6–12 months prior during high-level fiscal planning. They represent an upper financial ceiling envelope rather than an engineering costing.
   - An agency may have a ฿5M approved budget for a system that only warrants ฿3.5M of actual engineering effort. Using budget as the primary benchmark evaluates administrative allocation rather than software scope.
2. **Target Reference Price vs. Historical Reference Price preserves "Apples-to-Apples" validity:**
   - Comparing the target TOR's pre-bidding estimate against historical *winning contract prices* introduces an artificial **+10% to +20% bid-discount spread** (since winning bids in competitive auctions are discounted below the ceiling). This would skew normal tenders into false "Over Benchmark / Premium" alerts.
   - Comparing Reference Price to Reference Price directly tests whether the agency's procurement committee followed standard DES ICT cost models relative to historical peer committees.
3. **Contract Prices are retained as empirical context:**
   - While the median calculation and $\pm 15\%$ tolerance bands evaluate Reference Prices, historical winning Contract Prices (`contract.agreedPriceTHB`) are displayed alongside each peer in the UI breakdown to give bidders full transparency into what winning contractors actually delivered for.

## Consequences

- **Protects against misleading small-sample claims:** Users immediately see whether a benchmark is based on 1, 2, or 5 projects.
- **Prevents false alarms on routine variance:** Normal pricing differences ($\le 15\%$) do not trigger risk warnings.
- **Statistically and legally defensible:** Grounded directly in the Thai Public Procurement Act (Rule of 3), DES ICT standards, and software engineering cost literature.
- **Adheres to ADR 0014:** Zero or missing values never display as ฿0 or 0%.
- **Consistent UI presentation:** The TOR Detail / Summary page presents the exact same metric structure across all procurement notices.
