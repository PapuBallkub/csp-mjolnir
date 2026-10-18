# Comparable Projects Matching Guide (FR-19 & ADR 0021)

This document provides a clear, mathematical, and field-by-field reference explaining how the platform finds and ranks **comparable historical IT procurement projects** without calling an LLM.

---

## 1. Core Philosophy: Why Code Matches, Not LLM

1. **Zero Runtime LLM Cost:** Calling Gemini for every project comparison across hundreds of records would be slow (>2s) and cost-prohibitive.
2. **Deterministic & Repeatable:** Two runs always produce identical similarity scores and benchmarks.
3. **No "Zero-Match" Traps:** Tech stacks in Thai government TORs are often unstated or use varied naming. Hard-requiring identical tech stacks returns zero results. Matching anchors on **category and budget**, using tech stack only as a soft scoring bonus.
4. **"The AI picks the label; code does the comparing":** During ingestion, Gemini classifies unstructured PDF text into structured labels (category, technologies). At query time, fast deterministic backend code performs the mathematical comparison.

---

## 2. What Defines a "Comparable Project"?

In government IT procurement, two projects are comparable when they share:
1. **The same IT Category** (e.g. `software-development` is never benchmarked against hardware or networking).
2. **The same System Archetype** (e.g. a Mobile Application is benchmarked against other Mobile Applications, not against a hospital enterprise ERP).
3. **The same Economic Scale Tier** (e.g. a ฿500k simple utility is not benchmarked against a ฿50M enterprise platform).

### Why We Do NOT Match on the Specific Topic or `overview.objective`

A common question is: *"Why don't we match projects that do the exact same thing, like 'Calories Tracking App'?"*

1. **The "Zero-Peer" Trap:** In Thai government data, an agency might build a *"Calories Tracking Application"* once every few years. If we require the specific topic to match, the system finds 0 historical peers, leaving the user with no benchmark.
2. **Identical Software Engineering Cost:** A ฿3M mobile app for tracking calories requires the exact same team structure, architecture, and deliverables (iOS/Android apps, user authentication, REST APIs, database, admin CMS, 180-day delivery, 1-year warranty) as a ฿3M mobile app for national park camping reservations. Their market prices are directly comparable.
3. **`overview.objective` contains bureaucratic boilerplate:** Thai government objectives are heavily padded with generic slogans (*"เพื่อยกระดับประสิทธิภาพตามหลักธรรมาภิบาล"*). Matching on objectives causes false-positive similarity based on shared slogans rather than technical work.

---

## 3. Summary of Data Fields Used

All fields are read from the normalized [`TorInsight`](../../server/src/models/tor-insight.model.js) document:

| Field Path | Data Type | Role in Matching | Why We Use It |
|---|---|---|---|
| `identification.category` | **`String`** | **Stage 1: Hard Filter** | Broad IT domain (e.g., `software-development`, `data-and-ai`, `network-and-security`). A web app is never compared against PC hardware. |
| `facts.referencePriceTHB` *(or `budgetTHB`)* | **`Number`** | **Stage 1: Hard Bracket & Stage 2: Scale Score** | Enforces reasonable budget bounds ($[0.3\times, 3.0\times]$) and computes mathematical scale closeness. |
| `identification.titleTh` | **`String`** | **Stage 2: Scope Overlap** | Extracted into domain archetype keywords (`mobile`, `erp`, `gis`, etc.) to match system types. |
| `overview.majorComponents` | **`[String]`** *(List of strings)* | **Stage 2: Scope Overlap** | Combined with `titleTh` to identify core functional modules. |
| `technicalRequirements.requiredTechnologies` | **`[Object]`** *(List of `{name, version}`)* | **Stage 2: Tech Bonus Score** | Calculates technology overlap (e.g., React, PostgreSQL, Docker) using Jaccard similarity. |
| `facts.deliveryPeriodDays` | **`Number`** | **Excluded from Hard Filtering** | Contract durations in Thai procurement are frequently compressed to meet the September 30 fiscal budget year-end, rather than reflecting technical complexity. |

---

## 4. How Data is Converted into Scores (Step-by-Step)

The matching process runs in **two stages**:

```
Target TOR 
   │
   ▼
[ Stage 1: Database Query (MongoDB) ]
   ├── Exact match on category
   ├── Budget within [0.3×, 3.0×] of target price
   └── Exclude self & non-full-extraction records
   │
   ▼ (Candidates Pool)
[ Stage 2: In-Memory Composite Scoring ]
   ├── 1. Scale Proximity Score   (S_scale, weight = 45%)
   ├── 2. Scope Keyword Score     (S_scope, weight = 35%)
   └── 3. Tech Stack Score        (S_tech,  weight = 20%)
   │
   ▼
Final Composite Score = (0.45 × S_scale) + (0.35 × S_scope) + (0.20 × S_tech)
   │
   ▼
Sort Descending ➔ Select Top 5 Comparable Projects
```

---

### Step 1: Scale Proximity Score ($S_{\text{scale}}$, 45% Weight)

- **Input:** Two numbers: `targetPrice` and `candidatePrice`.
- **Formula:**
  $$S_{\text{scale}} = \frac{\min(\text{Price}_A, \text{Price}_B)}{\max(\text{Price}_A, \text{Price}_B)}$$

#### Numerical Walkthrough
Target Project has `referencePriceTHB = ฿10,000,000`:

| Candidate | Candidate Price | Calculation | Scale Score ($S_{\text{scale}}$) |
|---|---|---|---|
| Project A | ฿10,000,000 | $\frac{10\text{M}}{10\text{M}}$ | **$1.00$ (100%)** |
| Project B | ฿8,000,000 | $\frac{8\text{M}}{10\text{M}}$ | **$0.80$ (80%)** |
| Project C | ฿5,000,000 | $\frac{5\text{M}}{10\text{M}}$ | **$0.50$ (50%)** |
| Project D | ฿20,000,000 | $\frac{10\text{M}}{20\text{M}}$ | **$0.50$ (50%)** |
| Project E | ฿3,000,000 | $\frac{3\text{M}}{10\text{M}}$ | **$0.30$ (30%)** |

Both double the budget (20M) and half the budget (5M) yield a score of $0.50$.

---

### Step 2: Scope Similarity Score ($S_{\text{scope}}$, 35% Weight)

- **Input:** Raw text strings (`identification.titleTh`) and lists of component strings (`overview.majorComponents`).
- **How text becomes a score:**
  1. Combine `titleTh` and all items in `majorComponents` into one lowercase string.
  2. Scan against domain archetype keywords (`mobile`, `app`, `แอปพลิเคชัน`, `erp`, `crm`, `gis`, `e-service`, `portal`, `database`, `cloud`, etc.).
  3. Form a **Set of tokens** for each project.
  4. Compute the **Jaccard Similarity** (intersection over union):
     $$S_{\text{scope}} = \frac{|\text{Tokens}_A \cap \text{Tokens}_B|}{|\text{Tokens}_A \cup \text{Tokens}_B|}$$

#### Text Walkthrough Example
- **Target Project:**
  - Title: *"โครงการพัฒนา Mobile Application สำหรับรับเรื่องร้องเรียน"*
  - Extracted Keywords ($A$): `{"mobile", "app", "แอปพลิเคชัน"}`
- **Candidate 1 (Mobile App Peer):**
  - Title: *"จ้างพัฒนา Mobile App และ Web Portal บริการประชาชน"*
  - Extracted Keywords ($B_1$): `{"mobile", "app", "portal"}`
  - Shared ($A \cap B_1$): `{"mobile", "app"}` (2 words)
  - Union ($A \cup B_1$): `{"mobile", "app", "แอปพลิเคชัน", "portal"}` (4 words)
  - **$S_{\text{scope}} = 2 / 4 = \mathbf{0.50}$**
- **Candidate 2 (Hardware/CCTV):**
  - Title: *"ติดตั้งระบบกล้องวงจรปิด CCTV และเครือข่าย Network"*
  - Extracted Keywords ($B_2$): `{"cctv", "network", "เครือข่าย"}`
  - Shared ($A \cap B_2$): `0` words
  - **$S_{\text{scope}} = 0 / 6 = \mathbf{0.00}$**
- **Fallback Rule:** If neither project contains any recognized domain keywords, $S_{\text{scope}}$ defaults to **$0.50$ (Neutral)** so that neither project is unfairly disqualified.

---

### Step 3: Technology Similarity Score ($S_{\text{tech}}$, 20% Weight)

- **Input:** Two lists of technology objects: `technicalRequirements.requiredTechnologies` (e.g., `[{ name: "React" }, { name: "PostgreSQL" }]`).
- **Formula:**
  Normalize names (lowercase, trimmed) and compute Jaccard similarity:
  $$S_{\text{tech}} = \frac{|\text{Tech}_A \cap \text{Tech}_B|}{|\text{Tech}_A \cup \text{Tech}_B|}$$

#### Dynamic & Future-Proof:
This function does **NOT** use a hardcoded list of technologies. Whatever Gemini extracts from the PDF is compared directly. If a brand new technology (e.g. "Super SAI") is required by both projects, they match 100%!

#### Handling Missing Tech Stacks
Many Thai government TORs leave technology unspecified or allow any open-source tool.
- If **both** projects have an empty tech stack: score = **$0.50$ (Neutral)**.
- If **one** has a tech stack and the other does not: score = **$0.20$ (Slight penalty)**.
- If **both** have tech stacks: score = Jaccard ratio ($0.0 - 1.0$).

---

### Step 4: Final Composite Ranking

$$\text{Composite Score} = (S_{\text{scale}} \times 0.45) + (S_{\text{scope}} \times 0.35) + (S_{\text{tech}} \times 0.20)$$

#### Tie-Breaking Rule:
If two candidate projects tie on score, the algorithm picks the one whose reference price is closest to the target:
$$\Delta\text{Price} = |\text{CandidatePrice} - \text{TargetPrice}|$$

The top **5** candidates are selected.

---

## 5. Addressing Common Questions & Teammate Concerns

### Q1: If we use the Historical Median, why is the $[0.3\times, 3.0\times]$ price bracket necessary?
**Because the Median fails when projects come from different economic leagues.**
- The median resists a single freak outlier in a group of peers (e.g. one ฿200M project among ฿5M peers).
- However, if a target project is a small ฿500k app, and without a bracket the system picks ministry apps costing ฿10M, ฿25M, and ฿60M, the median is ฿25M. The system would falsely flag the ฿500k app as $-98\%$ underfunded!
- The bracket ensures we only compare projects operating in the same economic tier.

### Q2: Does searching around the budget $[0.3\times, 3.0\times]$ hide weird price anomalies?
**No. In fact, it is specifically how anomalies are caught!**
- The bracket spans a **10x price ratio** ($0.3\times$ to $3.0\times$, or $-70\%$ to $+200\%$).
- Meanwhile, [ADR 0024](../decisions/0024-price-benchmark-bands-and-sample-size-thresholds.md) defines "Market Normal" as **within $\pm 15\%$** of the median.
- If an agency inflates a standard ฿3M mobile app to **฿10M**:
  - The bracket finds peers at ฿3.0M, ฿3.2M, and ฿3.5M.
  - Historical median = ฿3.2M.
  - Price difference: $\Delta = \frac{10\text{M} - 3.2\text{M}}{3.2\text{M}} = \mathbf{+212.5\%}$!
  - The system easily surfaces it as **"ราคาสูงกว่าค่ามัธยฐานในอดีต +212%"**.

### Q3: Why was sample size $N \ge 3$ chosen?
In statistics, **3 is the smallest sample that provides a distinct middle value for a true median**:
- $N = 1$: Single data point, not a market trend.
- $N = 2$: Median is just the average; impossible to identify central clustering.
- $N \ge 3$: Has a left, middle, and right value. The middle value is a true median.
- For $N < 3$, the system displays an advisory banner and refuses to issue a definitive normal verdict.

### Q4: Is `facts.deliveryPeriodDays` a hard filter?
**No.** In the codebase (`similarity.service.js`), `deliveryPeriodDays` is **not** a filter or score. Thai government deadlines are frequently compressed simply to finish before the fiscal year ends (September 30), rather than reflecting actual development complexity. Making duration a hard filter would eliminate valid peers.

### Q5: Why not use `eligibility.previousExperienceMinTHB`?
`previousExperienceMinTHB` is the bidder's required past track record (ผลงาน). It is used for **User Profile Matchmaking (FR-12/13)**, but is not needed for project matching because:
1. It is almost always set to 40%–50% of the budget anyway (redundant with `referencePriceTHB`).
2. It is often null or unstated in smaller tenders.

---

## 6. Target Evolution: AI-Extracted System Archetypes

To replace heuristic regex keyword matching with direct enum matching:
Extend Gemini's extraction schema (`server/src/pipeline/extraction/schema.js`) to extract a standardized `systemArchetype` enum during ingestion:
```javascript
archetype: {
  type: 'string',
  enum: [
    'mobile-app',         // Mobile applications (iOS / Android)
    'web-portal',         // Web portals, e-Services, public websites
    'enterprise-erp',     // ERP, CRM, HR, inventory, internal workflow
    'data-analytics',     // Data warehouse, BI dashboards, AI, Big Data
    'gis-mapping',        // Map / spatial systems
    'infra-networking',   // Cloud setup, server migration, cabling, CCTV
    'other'
  ]
}
```
Then, code similarity simply compares `candidate.archetype === target.archetype`, strictly fulfilling:  
> **"The AI picks the label; code does the comparing."**
