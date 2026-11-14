# Comparable Projects Matching Guide (FR-19 & ADR 0021)

This document provides the operational and mathematical reference for finding and ranking **comparable historical IT procurement projects** in GIPDP.

**Related Requirements & Decisions:**
- Requirements: `FR-19` (the historical median and average price of similar past projects: this guide covers how those projects are found). `FR-20`'s comparison of requirements with similar projects would use them too, but isn't built yet. Lock-spec (`FR-21`) doesn't use them.
- Architectural Decisions: [`ADR 0021 · Define comparable projects by architecture and complexity`](../decisions/0021-find-comparable-projects.md), [`ADR 0034 · A TOR can have several categories, main one first`](../decisions/0034-a-tor-can-have-several-categories.md)
- Schema Specification: [`tor-insight-schema.md`](../database/tor-insight-schema.md)

---

## 1. Overview & Core Philosophy

1. **"The AI picks the label; code does the comparing":** During ingestion, Gemini classifies unstructured TOR text into structured labels (categories, archetype, complexity tier, tech stack). At query time, fast deterministic backend code compares these labels in < 10ms with zero runtime LLM calls or token costs.
2. **Deterministic & Repeatable:** Two runs always produce identical similarity scores and benchmarks.
3. **No "Zero-Match" Traps:** Tech stacks in Thai government TORs are often unstated or use varied naming. Matching anchors on **categories, deliverable archetype, and complexity tier**, using the tech stack only as a soft scoring bonus.
4. **Zero Circular Price Bias:** Candidate selection relies 100% on technical specifications. Price is never an input filter; historical prices are only evaluated *after* peers are selected to establish an independent benchmark.

---

## 2. Data Fields Used for Similarity Matching

The matching service (`server/src/features/reality-check/similarity.service.js`) filters and scores candidate peers using these **normalized technical fields** from `TorInsight` (`server/src/models/tor-insight.model.js`):

| Data Field | Data Type | Role in Matching | Operational Purpose |
|---|---|---|---|
| `identification.categories` | `[String]` *(enum, main one first)* | **Stage 1: Domain Pre-filter**, then **Stage 2: Category (15%)** | Eliminates domain mismatches upfront (shares no category, e.g. `software-development` vs. `network-and-security`), then rewards sharing more of them, in the same order. |
| `identification.status` | `String` *(enum)* | **Stage 1: Stability Pre-filter** | Accepts only concluded projects (`'Closed'`, `'Awarded'`). Excludes volatile `Draft` (in hearing) and active `Open` tenders (subject to change/amendments). |
| `metadata.confidenceScore` | `Number` (0–100) | **Stage 1: Quality Pre-filter (NFR-17)** | Requires confidence $\ge 80\%$. Prevents low-confidence or unreviewed extractions from distorting price benchmarks. |
| `metadata.titleOnly` / `awaitingFullText` / `excluded` | `Boolean` / `Object` | **Stage 1: Full-Read Pre-filter (ADR 0028)** | Requires full document extraction. Title-only stubs and pending previews cannot be compared. |
| `overview.systemArchetype` | `String` *(enum)* | **Stage 2: Architecture (35%)** | Matches the software deliverable architecture (e.g. `mobile-app`, `web-portal`, `enterprise-erp`). |
| `overview.complexityTier` | `String` *(enum)* | **Stage 2: Scope (30%)** | Normalizes engineering scale (`basic`, `standard`, `enterprise`) based on concurrency, SLA, and integrations. |
| `technicalRequirements.requiredTechnologies` | `[Object]` *(List of `{name, version}`)* | **Stage 2: Tech Bonus (20%)** | Soft bonus for shared frameworks and databases (e.g., React, PostgreSQL) using Jaccard similarity. |

---

## 3. Classification Taxonomies Extracted by Gemini

During ingestion, Gemini extracts two standardized enums defined in `server/src/models/project-categories.js` and `server/src/pipeline/extraction/schema.js`:

### 3.1 Level 1 (`categories`) vs Level 2 (`systemArchetype`)
To prevent "apples-to-oranges" comparisons, procurement classification operates across two distinct levels:

| Dimension | `identification.categories` (Level 1) | `overview.systemArchetype` (Level 2) |
|---|---|---|
| **Role** | **Procurement Contract Transaction Type** | **Software Architecture Pattern** |
| **Question** | *"What kind of legal/budget transaction is this?"* | *"What architectural shape is physically handed over?"* |
| **Perspective** | Procurement officer / Government finance | Software architect / Development team |
| **Values** | `software-development`, `systems-integration`, `software-licenses`, `maintenance-and-support`, `network-and-security`, `data-and-ai`, `other-it` | `mobile-app`, `web-portal`, `enterprise-erp`, `edoc-workflow`, `data-analytics`, `gis-mapping`, `cybersecurity`, `iot-telemetry`, `infra-networking`, `other` |

> **Why Level 1 alone is not enough:** In the category `software-development`, an agency may tender a Mobile App, a 3D Geospatial Map, or an Accounting ERP. If we only filtered by `categories`, the mobile app would be compared against the map and the ERP. `systemArchetype` ensures only identical architectural deliverables are compared.

### 3.2 The 9 Canonical System Archetypes (`overview.systemArchetype`)
Grounded in DES ICT Reference Price standards and DGA/TDGA architectural guidelines:

| Canonical Archetype | Official DES / DGA Procurement Classification | Real-World Deliverables |
|---|---|---|
| **`mobile-app`** | ระบบบริการดิจิทัลบนอุปกรณ์เคลื่อนที่ | iOS/Android mobile apps, push notification feeds |
| **`web-portal`** | ระบบบริการประชาชนออนไลน์ (e-Service / Web Portal) | Citizen web services, online licensing, public CMS |
| **`enterprise-erp`** | ระบบบริหารจัดการทรัพยากรภายในองค์กร | HRMS, government accounting, asset & inventory management |
| **`edoc-workflow`** | ระบบงานสารบรรณอิเล็กทรอนิกส์และเอกสารดิจิทัล | e-Saraban, digital signatures, workflow approvals |
| **`data-analytics`** | แพลตฟอร์มการจัดการข้อมูลขนาดใหญ่และ AI | Data lakehouse, BI dashboards, open data, AI chatbots |
| **`gis-mapping`** | ระบบภูมิสารสนเทศเชิงพื้นที่ (GIS) | PostGIS, zoning maps, flood & satellite monitoring |
| **`cybersecurity`** | ระบบความมั่นคงปลอดภัยทางไซเบอร์ (NCSA) | SOC, SIEM, Firewall, Vulnerability Assessment |
| **`iot-telemetry`** | ระบบตรวจวัดและโทรมาตรอัจฉริยะ (IoT / Smart City) | PM2.5 sensors, water level telemetry, smart meters |
| **`infra-networking`** | ระบบคอมพิวเตอร์แม่ข่ายและเครือข่าย | Server virtualization, LAN cabling, cloud data centers |
| **`other`** | งานเทคโนโลยีสารสนเทศเฉพาะทาง | Specialized edge cases |

### 3.3 The 3 Complexity Tiers (`overview.complexityTier`)
Grounded in Barry Boehm's COCOMO II cost model and Comptroller General's Department software sizing guidelines:

| Tier | Definition | What Gemini Inspects in the TOR | Real-World Examples |
|---|---|---|---|
| **`basic`** | **Small / Internal Workgroup Tool** | Internal use (10–100 staff), single module, simple CRUD, standalone with no external database integrations, 30–90 days. | Meeting room booking, internal stationery inventory, evaluation survey. |
| **`standard`** | **Agency-Wide Operational System** | Entire agency (hundreds to thousands of staff), RBAC, audit logs, 1–2 external API connections, formal UAT, 180–240 days. | Hospital equipment inventory, district queue management, municipal complaint tracking. |
| **`enterprise`** | **Nationwide / High-Concurrency Platform** | Public-facing to millions of citizens or mission-critical core, 99.9% High Availability, penetration testing, DOPA/ThaID/payment integrations. | Mor Prom (หมอพร้อม), Pao Tang (เป๋าตัง), National Tax E-Filing, Court Case Management. |

---

## 4. The Two-Stage Matching Process

```
Target TOR 
   │
   ▼
[ Stage 1: Candidate Pool Query (MongoDB) ]
   ├── Shares at least one of identification.categories
   ├── Concluded status only: identification.status in ['Closed', 'Awarded']
   ├── High extraction confidence: metadata.confidenceScore >= 80 (NFR-17)
   ├── Full document extraction: isFullExtraction = true (ADR 0028)
   ├── Exclude target projectId
   └── (No price filter applied!)
   │
   ▼ (Candidates Pool)
[ Stage 2: In-Memory Composite Scoring ]
   ├── 1. Deliverable Architecture Score (S_archetype,  weight = 35%)
   ├── 2. Engineering Complexity Score   (S_complexity, weight = 30%)
   ├── 3. Tech Stack Overlap Score       (S_tech,       weight = 20%)
   └── 4. Category Score                 (S_category,   weight = 15%)
   │
   ▼
Final Composite Score = (0.35 × S_archetype) + (0.30 × S_complexity) + (0.20 × S_tech) + (0.15 × S_category)
   │
   ▼
Sort Descending ➔ Tie-break by price distance ➔ Select Top 5 Peers
   │
   ▼
Calculate Historical Median from Top Peers' referencePriceTHB
```

---

## 5. Detailed Scoring Algorithms & Walkthrough Examples

To illustrate how candidate projects are evaluated, consider a **Target Project ($T$)**:
- **Title:** *"โครงการพัฒนา Mobile Application สำหรับรับเรื่องร้องเรียนประชาชน"*
- **Categories:** `['software-development', 'maintenance-and-support']`
- **Archetype:** `mobile-app`
- **Complexity Tier:** `standard`
- **Tech Stack:** `["Flutter", "Node.js", "PostgreSQL"]`
- **Reference Price:** ฿4,000,000

---

### Step 1: System Archetype Score ($S_{\text{archetype}}$, 35% Weight)

- **Input:** `target.overview.systemArchetype` vs. `candidate.overview.systemArchetype`
- **Scoring Rules:**
  - **Same Archetype** (`mobile-app` vs `mobile-app`): **$1.00$ (100%)**
  - **Different Archetype** (`mobile-app` vs `enterprise-erp`): **$0.15$ (Mismatch penalty)**
  - **Hybrid Projects** (multiple archetypes): Jaccard set overlap $\frac{|A \cap B|}{|A \cup B|}$.
  - **Unstated / 'other':** **$0.50$ (Neutral baseline)**

#### Archetype Walkthrough
Target has `systemArchetype = "mobile-app"`:

| Candidate | Candidate Archetype | Alignment | Archetype Score ($S_{\text{archetype}}$) |
|---|---|---|---|
| Project A | `mobile-app` | Exact match | **$1.00$ (100%)** |
| Project B | `mobile-app` | Exact match | **$1.00$ (100%)** |
| Project C | `web-portal` | Different deliverable | **$0.15$ (Mismatch penalty)** |
| Project D | `enterprise-erp` | Different deliverable | **$0.15$ (Mismatch penalty)** |
| Project E | `other` | Unstated / specialized | **$0.50$ (Neutral)** |

---

### Step 2: Complexity Scope Score ($S_{\text{complexity}}$, 30% Weight)

- **Input:** `target.overview.complexityTier` vs. `candidate.overview.complexityTier`
- **Scoring Rules:**
  - **Same Tier** (`standard` vs `standard`): **$1.00$ (100%)**
  - **Adjacent Tier** (`basic` vs `standard`, or `standard` vs `enterprise`): **$0.50$ (50%)**
  - **Distant Tier** (`basic` vs `enterprise`): **$0.10$ (10% heavy penalty)**
  - **Unstated / Missing:** **$0.50$ (Neutral baseline)**

#### Complexity Scope Walkthrough
Target has `complexityTier = "standard"`:

| Candidate | Candidate Tier | Step Distance | Complexity Score ($S_{\text{complexity}}$) |
|---|---|---|---|
| Project A | `standard` | Exact match (0 steps) | **$1.00$ (100%)** |
| Project B | `basic` | Adjacent (1 step away) | **$0.50$ (50%)** |
| Project C | `enterprise` | Adjacent (1 step away) | **$0.50$ (50%)** |
| Project D | `standard` | Exact match (0 steps) | **$1.00$ (100%)** |
| Project E | `null` (missing) | Fallback | **$0.50$ (Neutral)** |

*(Note: If target had been `basic` and candidate was `enterprise`, the distance is 2 steps = $0.10$).*

---

### Step 3: Technology Similarity Score ($S_{\text{tech}}$, 20% Weight)

- **Input:** Two lists of technology objects: `technicalRequirements.requiredTechnologies`
- **Formula:** Normalize names (lowercase, trimmed) and compute Jaccard similarity:
  $$S_{\text{tech}} = \frac{|\text{Tech}_A \cap \text{Tech}_B|}{|\text{Tech}_A \cup \text{Tech}_B|}$$

#### Handling Missing Tech Stacks
- If **both** projects have an empty tech stack: score = **$0.50$ (Neutral)**.
- If **one** has a tech stack and the other is empty: score = **$0.20$ (Slight penalty)**.
- If **both** have tech stacks: score = Jaccard ratio ($0.0 - 1.0$).

#### Technology Walkthrough
Target has Tech Stack: `{"flutter", "nodejs", "postgresql"}` ($N=3$):

| Candidate | Candidate Tech Stack | Overlap ($A \cap B$) | Union ($A \cup B$) | Tech Score ($S_{\text{tech}}$) |
|---|---|---|---|---|
| Project A | `{"flutter", "nodejs", "postgresql"}` | 3 (`flutter`, `nodejs`, `postgresql`) | 3 | $\frac{3}{3} = \mathbf{1.00}$ |
| Project B | `{"flutter", "firebase"}` | 1 (`flutter`) | 4 | $\frac{1}{4} = \mathbf{0.25}$ |
| Project C | `{"react", "nodejs", "postgresql"}` | 2 (`nodejs`, `postgresql`) | 4 | $\frac{2}{4} = \mathbf{0.50}$ |
| Project D | `{"java", "oracle"}` | 0 | 5 | $\frac{0}{5} = \mathbf{0.00}$ |
| Project E | `[]` (unspecified) | — | — | **$0.20$ (One empty)** |

---

### Step 4: Category Score ($S_{\text{category}}$, 15% Weight)

- **Input:** `target.identification.categories` vs. `candidate.identification.categories`, each with the main kind of work first
- **Formula:** $S_{\text{category}} = \text{overlap} \times \text{order}$
  - **overlap** rewards sharing more: $\frac{|A \cap B|}{|A \cup B|}$, as for the tech stack.
  - **order** rewards the same order. For each shared category: same position **$1.00$**, one apart **$0.75$**, two apart **$0.50$**. Then take the average.
- **Unstated:** **$0.50$ (Neutral baseline)**. A project with no categories never reaches this step in a comparison, because the pre-filter needs one shared category.

#### Category Walkthrough
Target has `categories = ['software-development', 'maintenance-and-support']`:

| Candidate | Candidate Categories | Overlap | Order | Category Score ($S_{\text{category}}$) |
|---|---|---|---|---|
| Project A | `['software-development', 'maintenance-and-support']` | $\frac{2}{2} = 1.00$ | $1.00$ | **$1.00$** |
| Project B | `['maintenance-and-support', 'software-development']` | $\frac{2}{2} = 1.00$ | $0.75$ | **$0.75$** |
| Project C | `['software-development']` | $\frac{1}{2} = 0.50$ | $1.00$ | **$0.50$** |
| Project D | `['software-development', 'network-and-security']` | $\frac{1}{3} = 0.33$ | $1.00$ | **$0.33$** |
| Project E | `['maintenance-and-support']` | $\frac{1}{2} = 0.50$ | $0.75$ | **$0.375$** |

Why they're multiplied: sharing both categories in swapped order (Project B) should beat sharing only the main one (Project C), and within that, the same order should still score most.

---

### Step 5: Final Composite Ranking & Median Price

$$\text{Composite Score} = (S_{\text{archetype}} \times 0.35) + (S_{\text{complexity}} \times 0.30) + (S_{\text{tech}} \times 0.20) + (S_{\text{category}} \times 0.15)$$

#### End-to-End Walkthrough Table

| Candidate | Archetype ($35\%$) | Complexity ($30\%$) | Tech ($20\%$) | Category ($15\%$) | Composite Score | Rank | Ref Price |
|---|---|---|---|---|---|---|---|
| **Project A** | $1.00 \times 0.35 = 0.350$ | $1.00 \times 0.30 = 0.300$ | $1.00 \times 0.20 = 0.200$ | $1.00 \times 0.15 = 0.150$ | **$1.000$** | **#1** | ฿4,200,000 |
| **Project B** | $1.00 \times 0.35 = 0.350$ | $0.50 \times 0.30 = 0.150$ | $0.25 \times 0.20 = 0.050$ | $0.75 \times 0.15 = 0.113$ | **$0.663$** | **#2** | ฿3,800,000 |
| **Project E** | $0.50 \times 0.35 = 0.175$ | $0.50 \times 0.30 = 0.150$ | $0.20 \times 0.20 = 0.040$ | $0.375 \times 0.15 = 0.056$ | **$0.421$** | **#3** | ฿3,900,000 |
| **Project D** | $0.15 \times 0.35 = 0.053$ | $1.00 \times 0.30 = 0.300$ | $0.00 \times 0.20 = 0.000$ | $0.33 \times 0.15 = 0.050$ | **$0.403$** | **#4** | ฿4,100,000 |
| **Project C** | $0.15 \times 0.35 = 0.053$ | $0.50 \times 0.30 = 0.150$ | $0.50 \times 0.20 = 0.100$ | $0.50 \times 0.15 = 0.075$ | **$0.378$** | **#5** | ฿4,500,000 |

#### Tie-Breaking Rule:
If two candidates tie on Composite Score, the algorithm breaks ties by choosing the candidate whose reference price is closest to the target:
$$\Delta\text{Price} = |\text{CandidatePrice} - \text{TargetPrice}|$$

---

## 6. Output Schema & Storage

The primary output of the matching engine is the list of top-ranked peers saved directly to `TorInsight.analytics.priceAnalysis.comparableProjects`.

Below is an illustrative schema snippet (assuming we take the top 2 peers from the walkthrough above: **Project A** at ฿4,200,000 and **Project B** at ฿3,800,000):

```javascript
"priceAnalysis": {
  // --- Fields evaluated by the price reality check (FR-19) using these peers ---
  "referencePriceTHB": 4000000,
  "historicalMedianTHB": 4000000,    // Median of [3,800,000, 4,200,000]
  "historicalAverageTHB": 4000000,   // Mean of [3,800,000, 4,200,000]
  "diffPercentage": 0.0,             // Price deviation vs. historical median
  "sampleSize": 2,                   // Number of comparable peers found
  "reliability": "low",              // 'low' because N < 3 (ADR 0024)

  // --- Output produced by this Matching Engine (FR-19's sample) ---
  "comparableProjects": [
    {
      "projectId": "PROJECT-A",
      "title": "โครงการพัฒนา Mobile Application บริการประชาชน",
      "year": 2567,
      "referencePriceTHB": 4200000
    },
    {
      "projectId": "PROJECT-B",
      "title": "โครงการพัฒนาระบบ Mobile App แจ้งเหตุฉุกเฉิน",
      "year": 2567,
      "referencePriceTHB": 3800000
    }
  ]
}
```

*(For details on how the statistical median, averages, and deviation percentages are evaluated from these peers, see the [Reality Check & Benchmarking Feature Specification](./reality-check-and-benchmarking.md)).*
