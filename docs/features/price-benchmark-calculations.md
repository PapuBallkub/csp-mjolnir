# Feature Specification: Price Benchmark Calculations (FR-20)

**Feature:** Price Benchmark Calculations & Reality Check  
**Related Requirements:**  
- `FR-19`: Identify and group historical IT procurement projects similar to a given TOR.  
- `FR-20`: Analyze a TOR against similar historical IT procurement projects by calculating price benchmarks and identifying deviations in price.  
- `NFR-15`: Thai primary locale with transparent, non-accusing copy ("Describe, don't accuse").  
**Related Decisions:**  
- [`0010 · Normalized TOR Detail Information`](../decisions/0010-normalized-tor-detail-Information.md)  
- [`0014 · Price names and data rules for TorInsight`](../decisions/0014-price-names-and-insight-data-rules.md)  
- [`0021 · Define comparable projects by architecture and complexity`](../decisions/0021-find-comparable-projects.md)  
- [`0022 · Pre-compute benchmarks in the pipeline, refresh by batch`](../decisions/0022-precompute-benchmarks-in-the-pipeline.md)  
- [`0024 · Price benchmark bands and sample size thresholds`](../decisions/0024-price-benchmark-bands-and-sample-size-thresholds.md)  
**Status:** Approved  
**Audience:** Product Owners, Developers, Domain Experts, SME Bidders, and Platform Users  

---

## 1. Feature Purpose (ทำไมต้องมีฟีเจอร์นี้ และทำหน้าที่อะไร)

### 1.1 The Problem It Solves
In Thai government IT procurement, small software companies (SMEs), freelance developers, and civic watchdogs face a major hurdle: **pricing opacity**.
- Official tender documents (TOR) state a budget (*งบประมาณ*) and a reference price (*ราคากลาง*), but offer **no historical context** on whether that price is reasonable.
- A vendor looking at a ฿4,500,000 project cannot easily tell if that amount is sufficient for the required scope, overly tight (carrying high risk of delivery failure or loss), or unusually generous.
- Currently, only large incumbent contractors with internal bidding histories know what similar systems typically cost in the public sector.

### 1.2 What This Feature Does
The **Price Reality Check** feature gives every user instant price transparency:
1. It takes the target project's reference price (or approved budget).
2. It looks up comparable past government IT projects identified by the similarity matching engine (FR-19).
3. It calculates objective market benchmarks (**Historical Median** and **Historical Average**).
4. It calculates the **difference** (both in Baht and as a percentage) between this project's price and past market norms.
5. It evaluates how much historical evidence exists (Sample Size & Reliability).
6. It provides a clear, plain-language Thai summary explaining whether the price is in line with historical standards.

### 1.3 Guiding Principle: "Describe, Don't Accuse"
In accordance with GIPDP design principles:
- The system presents **factual evidence and market comparisons**.
- It **never accuses** agencies or vendors of wrongdoing (no words like "ผิดปกติ", "ทุจริต", or "ฮั้วประมูล").
- High prices are described as "higher than historical median" (suggesting a well-funded project or potential premium allowance).
- Low prices are described as "lower than historical median" (alerting bidders to potential budget constraint risks).

---

## 2. Procurement Price Lifecycle: Timeline & Comparison

In Thai public procurement, government projects deal with **three distinct price figures**. Understanding when each price is born and how stable it is explains why GIPDP benchmarks against the **Reference Price** rather than the broad Budget.

### 2.1 The Procurement Price Timeline

**title Thai IT Procurement Pricing Lifecycle**
- Phase 1 : Annual Fiscal Budgeting (6–12 months prior) : Budget (งบประมาณที่ได้รับจัดสรร) : Preliminary spending ceiling approved by Bureau of the Budget
- Phase 2 : TOR Drafting & Hearing (e-GP Stage B0/D0) : Reference Price (ราคากลาง) : Statutory estimate calculated by agency committee based on DES ICT standards
- Phase 3 : Bidding & Auction (e-GP Stage D0) : Vendor Proposals : Vendors submit competitive bids below Reference Price
- Phase 4 : Award Announcement & Signing (e-GP Stage W0/W2) : Contract Price (ราคาตามสัญญา) : Actual transaction price agreed with winning bidder

### 2.2 Comparison Table of the Three Prices

| Price Type | Determination Stage / Timing | Determined By | Stability & Technical Reliability | Legal Constraint | Role in GIPDP |
|---|---|---|---|---|---|
| **Budget**<br>*(วงเงินงบประมาณ)* | **Annual fiscal planning**<br>(6–12 months prior to procurement) | Bureau of the Budget / Ministry / Local Assembly | **Low.** Macro-level financial envelope set before software architecture and technical specs are finalized. | Sets statutory ceiling; agencies legally cannot award any contract exceeding this amount. | **Fallback baseline.** Used only if the project is in early draft stage without a published reference price. |
| **Reference Price**<br>*(ราคากลาง)* | **TOR formulation stage**<br>(Weeks prior to tender announcement) | Agency Procurement Committee<br>*(คณะกรรมการกำหนดราคากลาง)* | **High.** Detailed micro-costing calculated directly against finalized technical deliverables using DES ICT standards. | Acts as bidding ceiling in e-GP; any bid higher than this is disqualified or subject to renegotiation. | **Primary benchmark ($T_{\text{price}}$).** Used to evaluate target projects and compute historical peer medians ($\tilde{P}$). |
| **Contract Price**<br>*(ราคาตามสัญญา)* | **Post-award signing**<br>(After competitive bidding outcome) | Winning Vendor + Agency Contracting Officer | **High (empirical market truth).** The actual financial amount the private vendor committed to deliver the software for. | Binding contract figure; must satisfy $\text{Contract Price} \le \text{Reference Price} \le \text{Budget}$. | **Historical peer context.** Displayed in the peer list (`comparableProjects`) to show real historical winning bids without distorting benchmark bands. |

---

## 3. Core Concepts Explained Simply

| Concept | Plain-Language Meaning | Why It Matters |
|---|---|---|
| **Target Price ($T_{\text{price}}$)** | **ราคาตั้งต้นของโครงการนี้**<br>The statutory reference price (*ราคากลาง*) set by the procurement committee. If the project is still a draft and has no reference price yet, the allocated budget (*งบประมาณ*) is used as a fallback. | This is the official baseline number being evaluated. |
| **Historical Median ($\tilde{P}$)** | **ค่ามัธยฐานในอดีต (เกณฑ์เปรียบเทียบหลัก)**<br>The true middle price among similar past projects. If you line up all past project prices from lowest to highest, the median is the value right in the center. | **Immune to extreme outliers.** If one past project had an abnormally high budget (e.g. ฿50M), the median is not skewed, unlike the average. |
| **Historical Average ($\bar{P}$)** | **ค่าเฉลี่ยในอดีต (เกณฑ์เปรียบเทียบรอง)**<br>The sum of all past project prices divided by the number of projects. | Provides secondary context on overall government spending for this category. |
| **Price Deviation ($\Delta$)** | **ความเบี่ยงเบนหรือส่วนต่างราคา (%)**<br>The percentage difference showing how much higher ($+$) or lower ($-$) the current price is compared to the historical median. | Tells the bidder immediately if the project is in line with market history ($\pm 15\%$), a premium budget ($> +15\%$), or constrained ($< -15\%$). |
| **Reliability Tier** | **ระดับความน่าเชื่อถือของผลวิเคราะห์**<br>Whether the benchmark is backed by enough past projects to represent a reliable market pattern: `none`, `low`, or `sufficient`. | Bidders know whether they are looking at a well-substantiated market trend or an early advisory based on limited past data. |

---

## 4. Result Data Dictionary (What Each Output Means)

When the benchmark calculation runs, it produces a structured result object (`priceAnalysis`). Below is the high-level explanation of every field: **its name, clear definition, and a sample value**.

### 3.1 Field-by-Field Breakdown

#### 1. `referencePriceTHB`
- **Friendly Name:** ราคากลางหรือราคาตั้งต้น (Target Evaluated Price)
- **Definition:** The baseline price evaluated for this project in Thai Baht (THB). Derived from the official reference price (*ราคากลาง*), or the approved budget (*งบประมาณ*) if reference price is not yet available. If the TOR document does not specify any price, this is `null` (never defaults to ฿0).
- **Sample Value:** `4,500,000` *(฿4,500,000)*

#### 2. `historicalMedianTHB`
- **Friendly Name:** ค่ามัธยฐานราคาในอดีต (Historical Median Benchmark)
- **Definition:** The middle price among comparable past projects. Half of similar historical projects cost less than this, and half cost more. This is the **primary benchmark** used by the platform because it resists distortions from extreme project budgets.
- **Sample Value:** `4,000,000` *(฿4,000,000)*

#### 3. `historicalAverageTHB`
- **Friendly Name:** ค่าเฉลี่ยราคาในอดีต (Historical Average Benchmark)
- **Definition:** The arithmetic mean price of all comparable past projects. Offered as a secondary reference point alongside the median.
- **Sample Value:** `4,000,000` *(฿4,000,000)*

#### 4. `diffAmountTHB`
- **Friendly Name:** ส่วนต่างราคาเทียบมัธยฐานเป็นตัวเงิน (Monetary Difference vs. Median)
- **Definition:** The exact difference in Thai Baht between this project's price and the historical median ($T_{\text{price}} - \tilde{P}$). A positive number means higher than median; a negative number means lower.
- **Sample Value:** `+500,000` *(+฿500,000)*

#### 5. `diffPercentage`
- **Friendly Name:** เปอร์เซ็นต์ส่วนต่างเทียบกับมัธยฐาน (Percentage Difference vs. Median)
- **Definition:** The percentage by which this project deviates from the historical median ($\frac{T - \tilde{P}}{\tilde{P}} \times 100\%$). A value between $-15.0\%$ and $+15.0\%$ is considered normal market variation.
- **Sample Value:** `+12.5` *(+12.5%)*

#### 6. `diffAverageAmountTHB`
- **Friendly Name:** ส่วนต่างราคาเทียบค่าเฉลี่ยเป็นตัวเงิน (Monetary Difference vs. Average)
- **Definition:** The difference in Thai Baht between this project's price and the historical arithmetic average ($T_{\text{price}} - \bar{P}$).
- **Sample Value:** `+500,000` *(+฿500,000)*

#### 7. `diffAveragePercentage`
- **Friendly Name:** เปอร์เซ็นต์ส่วนต่างเทียบกับค่าเฉลี่ย (Percentage Difference vs. Average)
- **Definition:** The percentage by which this project deviates from the historical arithmetic mean. Serves as secondary context if the median and mean diverge.
- **Sample Value:** `+12.5` *(+12.5%)*

#### 8. `sampleSize`
- **Friendly Name:** จำนวนโครงการเปรียบเทียบที่นำมาคำนวณ (Comparable Projects Count)
- **Definition:** The total number of valid historical peer projects found and included in this calculation (up to 5 projects maximum). Shows the reader how much historical evidence supports the benchmark.
- **Sample Value:** `3` *(3 projects)*

#### 9. `reliability`
- **Friendly Name:** ระดับความน่าเชื่อถือของข้อมูล (Reliability Level)
- **Definition:** A categorical indicator of statistical confidence based on the number of peer projects found:
  - `'none'` ($N = 0$): No historical peer projects found.
  - `'low'` ($1 \le N < 3$): Fewer than 3 peers found. Results are advisory only because they do not meet the standard 3-source quoting baseline.
  - `'sufficient'` ($3 \le N \le 5$): 3 or more peers found. Meets the standard market quorum for Thai procurement discovery.
- **Sample Value:** `"sufficient"`

#### 10. `interpretation`
- **Friendly Name:** บทสรุปผลการวิเคราะห์ภาษาไทย (Plain Thai Summary Verdict)
- **Definition:** A concise, human-friendly Thai sentence that explains the finding directly. It tells the reader whether the price is normal, high, or low, and notes if the sample size is limited.
- **Sample Value:** `"ราคากลางอยู่ในเกณฑ์ปกติเมื่อเทียบกับโครงการใกล้เคียงในอดีต (เบี่ยงเบน +12.5%)"`

#### 11. `comparableProjects`
- **Friendly Name:** รายการโครงการเปรียบเทียบในอดีต (List of Comparable Peer Projects)
- **Definition:** The list of past government projects that were used to establish the benchmark. For each project, it provides the project title, fiscal year (พ.ศ.), and the reference price (*ราคากลาง*) or agreed contract price (*ราคาตามสัญญา*). This ensures complete transparency—users can see exactly which projects their budget is being judged against.
- **Sample Value:** *(List of 3 project records, see example below)*

---

## 5. Complete Result Examples (ตัวอย่างข้อมูลจริง)

### Example 1: Standard Normal Market Project (เกณฑ์ปกติ — งบประมาณสมเหตุสมผล)
A web application project with a reference price of ฿4,500,000 and 3 historical peers with a median price of ฿4,000,000 (+12.5% deviation, within the normal $\pm 15\%$ range):

```json
{
  "referencePriceTHB": 4500000,
  "historicalMedianTHB": 4000000,
  "historicalAverageTHB": 4000000,
  "diffAmountTHB": 500000,
  "diffPercentage": 12.5,
  "diffAverageAmountTHB": 500000,
  "diffAveragePercentage": 12.5,
  "sampleSize": 3,
  "reliability": "sufficient",
  "interpretation": "ราคากลางอยู่ในเกณฑ์ปกติเมื่อเทียบกับโครงการใกล้เคียงในอดีต (เบี่ยงเบน +12.5%)",
  "comparableProjects": [
    {
      "title": "โครงการพัฒนาพอร์ทัลบริการข้อมูลและรับคำร้องออนไลน์",
      "year": 2567,
      "referencePriceTHB": 3800000
    },
    {
      "title": "โครงการพัฒนาระบบ Web Portal บริการข้าราชการ",
      "year": 2566,
      "referencePriceTHB": 4000000
    },
    {
      "title": "โครงการพัฒนาระบบ e-Service งานทะเบียนราษฎร",
      "year": 2567,
      "referencePriceTHB": 4200000
    }
  ]
}
```

**How the user understands this:**
- The current project's reference price is ฿4.5M.
- Past similar systems cost ฿4.0M on average/median.
- The difference is +12.5% (+฿500,000), which falls inside the normal market range ($\pm 15\%$).
- The finding is backed by 3 comparable government projects (`sufficient` reliability).
- Verdict: The budget is standard and reasonable.

---

### Example 2: Underfunded / Tight Budget Project (ราคากลางต่ำกว่าเกณฑ์ — เสี่ยงงบจำกัด)
A mobile application project with an evaluated reference price of ฿2,500,000, but historical peers had a median price of ฿3,800,000 ($-34.2\%$ deviation):

```json
{
  "referencePriceTHB": 2500000,
  "historicalMedianTHB": 3800000,
  "historicalAverageTHB": 3900000,
  "diffAmountTHB": -1300000,
  "diffPercentage": -34.2,
  "diffAverageAmountTHB": -1400000,
  "diffAveragePercentage": -35.9,
  "sampleSize": 4,
  "reliability": "sufficient",
  "interpretation": "ราคากลางต่ำกว่าค่ามัธยฐานในอดีตประมาณ -34.2% อาจมีความเสี่ยงเรื่องงบประมาณจำกัดเกินไปเมื่อเทียบกับขอบเขตงาน",
  "comparableProjects": [
    {
      "title": "โครงการพัฒนาแอปพลิเคชันบริการประชาชนบนมือถือ",
      "year": 2566,
      "referencePriceTHB": 3500000
    },
    {
      "title": "โครงการจัดทำ Mobile Application บริการข้อมูลสิทธิประโยชน์",
      "year": 2567,
      "referencePriceTHB": 3800000
    },
    {
      "title": "โครงการพัฒนาระบบ Mobile Portal ประชาสัมพันธ์หน่วยงาน",
      "year": 2566,
      "referencePriceTHB": 4100000
    },
    {
      "title": "โครงการยกระดับแอปพลิเคชันสำหรับเจ้าหน้าที่ภาคสนาม",
      "year": 2567,
      "referencePriceTHB": 4200000
    }
  ]
}
```

**How the user understands this:**
- The agency is offering ฿2.5M, but past agencies paid ฿3.8M for similar scopes.
- The project is funded 34.2% (฿1.3M) lower than historical norms.
- Verdict: This alerts potential SME bidders to be cautious—the scope of work may be too large for the allocated budget, carrying delivery or loss risks.

---

### Example 3: Low Sample Size Advisory (ข้อมูลในอดีตยังมีจำกัด)
A niche data analytics tender where only 1 comparable past project was found in the database ($N = 1$):

```json
{
  "referencePriceTHB": 6000000,
  "historicalMedianTHB": 5200000,
  "historicalAverageTHB": 5200000,
  "diffAmountTHB": 800000,
  "diffPercentage": 15.4,
  "diffAverageAmountTHB": 800000,
  "diffAveragePercentage": 15.4,
  "sampleSize": 1,
  "reliability": "low",
  "interpretation": "คำนวณจากโครงการเปรียบเทียบจำนวน 1 โครงการ ข้อมูลอาจยังไม่สะท้อนแนวโน้มตลาดทั้งหมด (เบี่ยงเบน +15.4%)",
  "comparableProjects": [
    {
      "title": "โครงการพัฒนาระบบเชื่อมโยงและวิเคราะห์ข้อมูล Big Data",
      "year": 2566,
      "referencePriceTHB": 5200000
    }
  ]
}
```

**How the user understands this:**
- The price comparison is shown (+15.4%), but the system explicitly warns that only 1 past project was found.
- The user is advised to treat this comparison as preliminary context rather than an established market trend.

---

## 6. Decision Rules & Legal Justifications Summary

The benchmarking rules are grounded in Thai procurement regulations and industry estimation standards (documented in **ADR 0014** and **ADR 0024**):

### 5.1 Why the $\pm 15\%$ Normal Band?
- **Thai Government ICT Pricing Standards (เกณฑ์ราคากลาง ICT กระทรวงดิจิทัลฯ):** Thai public sector IT cost estimation includes standard structural overheads:
  - Administrative overhead (ค่าอำนวยการ): ~5–7%
  - Contractor profit margin (กำไร): ~7–10%
  - Contingency buffer (ค่าเผื่อความผันผวน): ~3–5%
- These standard factors naturally produce an expected variance of $\pm 10\%$ to $\pm 15\%$ between different agencies for similar software scopes.
- Setting the normal band at $\pm 15\%$ ensures the system does not produce false alarms on normal market competition.

### 5.2 Why the "Rule of 3" Sample Size Threshold?
- **Thai Procurement Act B.E. 2560 (พ.ร.บ. จัดซื้อจัดจ้างฯ มาตรา 64 และระเบียบฯ ข้อ 28):** In Thai public procurement, establishing a legally valid reference price through market quotes requires surveying **at least 3 sources (ไม่น้อยกว่า 3 ราย)**.
- When GIPDP finds fewer than 3 historical projects ($N < 3$), the sample does not meet this statutory baseline, so it is marked `reliability: 'low'` with an advisory disclaimer. When $N \ge 3$, it meets the standard confidence threshold.
- The system caps peer matching at the **Top 5 projects** ($N \le 5$) to prevent diluting the comparison with projects that have different architectures or complexity tiers.

### 5.3 Missing Data Rule (ADR 0014)
- If a project document does not specify a reference price or budget, it is recorded as `null`.
- The system **never substitutes ฿0**, as ฿0 would corrupt statistics and falsely indicate a free service.
