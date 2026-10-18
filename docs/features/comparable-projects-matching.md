# Comparable Projects Matching Guide (FR-19 & ADR 0021)

This document provides a clear, mathematical, and field-by-field reference explaining how the platform finds and ranks **comparable historical IT procurement projects** without calling an LLM.

---

## 1. Core Philosophy: Why Code Matches, Not LLM

1. **Zero Runtime LLM Cost:** Calling Gemini for every project comparison across hundreds of records would be slow (>2s) and cost-prohibitive.
2. **Deterministic & Repeatable:** Two runs always produce identical similarity scores and benchmarks.
3. **No "Zero-Match" Traps:** Tech stacks in Thai government TORs are often unstated or use varied naming. Hard-requiring identical tech stacks returns zero results. Matching anchors on **category and budget**, using tech stack only as a soft scoring bonus.
4. **"The AI picks the label; code does the comparing":** During ingestion, Gemini classifies unstructured PDF text into structured labels (category, technologies). At query time, fast deterministic backend code performs the mathematical comparison.

---

## 2. What Defines a "Comparable Project"? (The Two Core Questions)

To find legitimate comparable peers, the matching engine must answer two distinct questions:

1. **Question 1: Architectural Type (What kind of software is it?)**
   - Answered by `overview.systemArchetype` (`mobile-app`, `web-portal`, `enterprise-erp`, `data-analytics`, `gis-mapping`, `infra-networking`, `other`) and `technicalRequirements.requiredTechnologies`.
   - A mobile application is compared against other mobile applications, never against a CCTV hardware tender or a giant database warehouse.
2. **Question 2: Engineering Scope & Complexity (How large and demanding is it?)**
   - Answered by `overview.complexityTier` (`basic`, `standard`, `enterprise`).
   - A simple 3-page registration form for a local district is never compared against a high-concurrency national citizen portal, even though both share the exact same architecture (`web-portal`) and stack (`React`, `PostgreSQL`).

### Why We Do NOT Match on the Specific Topic or `overview.objective`
- **The "Zero-Peer" Trap:** In Thai government procurement, an agency tenders a *"Calories Tracking Application"* once every few years. Requiring domain business topic matches results in 0 historical peers.
- **Identical Software Engineering Effort:** A ฿3M mobile app for tracking calories requires the exact same team structure, architecture, and deliverables (iOS/Android apps, user authentication, REST APIs, database, admin CMS, 180-day delivery, 1-year warranty) as a ฿3M mobile app for national park camping reservations. Their market prices are directly comparable.
- **`overview.objective` contains bureaucratic boilerplate:** Thai government project objectives are heavily padded with generic slogans (*"เพื่อยกระดับประสิทธิภาพตามหลักธรรมาภิบาล"*). Matching on objectives causes false-positive similarity based on shared slogans rather than shared technical work.

---

## 3. The `overview.complexityTier` Specification

During AI extraction (`server/src/pipeline/extraction/schema.js`), Gemini inspects the technical requirements of the TOR and assigns one of three standardized engineering tiers:

```javascript
export const COMPLEXITY_TIERS = [
  'basic',       // Small / Departmental Workgroup Tool
  'standard',    // Mid-sized Agency Operational System
  'enterprise'   // Mission-Critical / High-Concurrency / Nationwide
];
```

### Detailed Tier Breakdown:

| Tier | Definition | What Gemini Inspects in the TOR | Real-World Thai Procurement Examples |
|---|---|---|---|
| **`basic`** | **Small / Internal Workgroup Tool** | • Internal use only (10–100 staff)<br>• Single module, simple CRUD operations, 1 database<br>• Standalone: no integrations with external databases<br>• Standard timeline (30–90 days), 1–2 developers | Department meeting room booking, online training evaluation survey, internal stationery inventory, informational brochure website. |
| **`standard`** | **Agency-Wide Operational System** | • Serves an entire agency or department (hundreds to thousands of staff)<br>• Role-based access control (RBAC), approval workflows, audit logs<br>• 1–2 external API connections, data migration from legacy database<br>• Requires formal UAT, admin manuals, 180–240 day delivery | Provincial hospital equipment inventory, district land office queue management, municipal complaint management system with Line Notify. |
| **`enterprise`** | **Nationwide / High-Concurrency Platform** | • Public-facing to millions of citizens OR mission-critical ministry core<br>• High Availability (99.9% SLA, load balancing, Disaster Recovery site)<br>• Strict cybersecurity audits (OWASP Top 10, penetration testing, PDPA compliance)<br>• Multiple integrations (DOPA citizen registry, ThaID, national payment gateways) | Mor Prom (หมอพร้อม), Pao Tang (เป๋าตัง), National Tax E-Filing System, Court of Justice Case Management Platform. |

### What Sections of the TOR the AI Analyzes:
1. **Target Users & Concurrency:** `overview.highLevelScope` and project background for internal staff vs nationwide citizen usage.
2. **Deliverables Breadth:** `deliverables.system` and `deliverables.implementation` (single standalone app vs multi-platform ecosystem).
3. **Integration Requirements:** `technicalRequirements` for connections to external government databases (DOPA, ThaID, e-GP, payment gateways).
4. **Non-Functional & SLA:** High availability (HA), failover clusters, penetration testing, and 24/7 support clauses.

---

## 4. Summary of Data Fields Used

All fields are read from the normalized [`TorInsight`](../../server/src/models/tor-insight.model.js) document:

| Field Path | Data Type | Role in Matching | Why We Use It |
|---|---|---|---|
| `identification.category` | **`String`** | **Stage 1: Hard Filter** | Broad IT domain (e.g., `software-development`, `cloud-and-infrastructure`, `maintenance-and-support`). A web app is never compared against PC hardware. |
| `overview.systemArchetype` | **`String`** *(enum)* | **Stage 2: Architecture Score ($S_{\text{archetype}}$, 40%)** | Standardized deliverable architecture (`mobile-app`, `web-portal`, `enterprise-erp`, `data-analytics`, `gis-mapping`, `infra-networking`, `other`). Provides direct 100% match or penalty mismatch without regex guesswork. |
| `overview.complexityTier` | **`String`** *(enum)* | **Stage 2: Scope Score ($S_{\text{complexity}}$, 35%)** | Engineering scale tier (`basic`, `standard`, `enterprise`). Same tier = 1.0, adjacent tier = 0.5, two tiers apart = 0.1. Replaces circular price brackets. |
| `technicalRequirements.requiredTechnologies` | **`[Object]`** *(List of `{name, version}`)* | **Stage 2: Tech Bonus Score ($S_{\text{tech}}$, 25%)** | Calculates technology overlap (e.g., React, PostgreSQL, Docker) using Jaccard similarity. |
| `overview.majorComponents` & `highLevelScope` | **`[String]`** / **`String`** | **Stage 2: Scope Fallback** | Curated domain keyword extraction used **only** when `systemArchetype` or `complexityTier` is missing on unclassified legacy records. |
| `identification.titleTh` | **`String`** | **Display & Traceability Only** | Excluded from similarity scoring to eliminate administrative phrase noise. Populates the output `{ title, year, referencePriceTHB }` for user cards and citations. |

---

## 5. How Data is Converted into Scores (Step-by-Step)

The matching process runs in **two stages**:

```
Target TOR 
   │
   ▼
[ Stage 1: Candidate Pool Query (MongoDB) ]
   ├── Exact match on category
   ├── Candidate must be FULL_EXTRACTION (ADR 0028)
   └── Exclude target projectId
   │   (Note: NO price filter is applied!)
   ▼ (Candidates Pool)
[ Stage 2: In-Memory Composite Scoring ]
   ├── 1. System Archetype Score  (S_archetype,  weight = 40%)
   ├── 2. Complexity Tier Score   (S_complexity, weight = 35%)
   └── 3. Tech Stack Score        (S_tech,       weight = 25%)
   │
   ▼
Final Composite Score = (0.40 × S_archetype) + (0.35 × S_complexity) + (0.25 × S_tech)
   │
   ▼
Sort Descending ➔ Select Top 5 Comparable Projects
   │
   ▼
Calculate Historical Median from Top Peers' Reference Prices
```

---

### Step 1: System Archetype Score ($S_{\text{archetype}}$, 40% Weight)

When `overview.systemArchetype` has been extracted by Gemini during ingestion:
- **Same Archetype** (e.g. `mobile-app` vs `mobile-app`): **$1.00$ (100%)**
- **Different Archetype** (e.g. `mobile-app` vs `enterprise-erp`): **$0.15$ (Mismatch penalty)**
- **Hybrid Projects** (multiple archetypes): Jaccard overlap between archetype sets $\frac{|A \cap B|}{|A \cup B|}$.

---

### Step 2: Complexity Scope Score ($S_{\text{complexity}}$, 35% Weight)

Compares Gemini's extracted `overview.complexityTier`:
- **Same Tier** (`standard` vs `standard`, or `basic` vs `basic`): **$1.00$ (100%)**
- **Adjacent Tier** (`basic` vs `standard`, or `standard` vs `enterprise`): **$0.50$ (50%)**
- **Distant Tier** (`basic` vs `enterprise`): **$0.10$ (10% heavy penalty)**

#### Fallback for Legacy Records:
If `complexityTier` is missing (`null`), the algorithm checks keyword tokens from `majorComponents` and `highLevelScope`, or defaults to **$0.50$ (Neutral)** so that legacy projects are not unfairly disqualified.

---

### Step 3: Technology Similarity Score ($S_{\text{tech}}$, 25% Weight)

- **Input:** Two lists of technology objects: `technicalRequirements.requiredTechnologies` (e.g., `[{ name: "React" }, { name: "PostgreSQL" }]`).
- **Formula:**
  Normalize names (lowercase, trimmed) and compute Jaccard similarity:
  $$S_{\text{tech}} = \frac{|\text{Tech}_A \cap \text{Tech}_B|}{|\text{Tech}_A \cup \text{Tech}_B|}$$

#### Handling Missing Tech Stacks:
- If **both** projects have an empty tech stack: score = **$0.50$ (Neutral)**.
- If **one** has a tech stack and the other does not: score = **$0.20$ (Slight penalty)**.
- If **both** have tech stacks: score = Jaccard ratio ($0.0 - 1.0$).

---

### Step 4: Final Composite Ranking & Median Price

$$\text{Composite Score} = (S_{\text{archetype}} \times 0.40) + (S_{\text{complexity}} \times 0.35) + (S_{\text{tech}} \times 0.25)$$

1. Sort candidate projects descending by `Composite Score`.
2. Select the top **5** peers.
3. **Only now, examine their reference prices**: Compute the **Historical Median** of the peers' reference prices.
4. Calculate price deviation:
   $$\text{Deviation} = \frac{\text{TargetPrice} - \text{Median}}{\text{Median}} \times 100\%$$

---

## 6. Addressing Common Questions & Academic Defense

### Q1: Why do we select peers without looking at the price tag? (Eliminating Circular Reasoning)
In software engineering and data science, testing whether a project's price is abnormal while filtering candidate peers by price creates a **circular dependency**:
- If an agency inflates its price, a price filter biases the search toward other expensive projects, hiding the anomaly.
- If an agency underfunds a project, a price filter biases the search toward cheaper projects.
- By selecting peers **100% on technical specifications** (`systemArchetype` + `complexityTier` + `requiredTechnologies`), candidate selection is completely unbiased. The median price of those technical peers provides a clean, independent market benchmark.

### Q2: Why is `systemArchetype` alone not enough? Why do we need `complexityTier`?
Because technology and architecture alone do not indicate scale:
- A simple 3-page registration form for a local district office is a `web-portal` using React and PostgreSQL.
- The Ministry of Interior's national citizen platform is also a `web-portal` using React and PostgreSQL.
- Both use the same architecture and stack, but the national platform requires 100x more engineering effort (high availability, load balancers, penetration testing, citizen identity integration).
- `complexityTier` (`basic` vs `enterprise`) ensures that small workgroup tools are benchmarked against other workgroup tools, and nationwide platforms against other nationwide platforms.

### Q3: Why was sample size $N \ge 3$ chosen?
In statistics, **3 is the smallest sample that provides a distinct middle value for a true median**:
- $N = 1$: Single data point, not a market trend.
- $N = 2$: Median is just the average; impossible to identify central clustering.
- $N \ge 3$: Has a left, middle, and right value. The middle value is a true median.
- For $N < 3$, the system displays an advisory banner and refuses to issue a definitive normal verdict.

### Q4: Is `facts.deliveryPeriodDays` a hard filter?
**No.** In the codebase (`similarity.service.js`), `deliveryPeriodDays` is **not** a filter or score. Thai government deadlines are frequently compressed simply to finish before the fiscal year ends (September 30), rather than reflecting actual development complexity. Making duration a hard filter would eliminate valid peers.

---

## 7. Schema Definition: Enums Extracted by Gemini

Gemini's extraction schema (`server/src/pipeline/extraction/schema.js`) extracts two standardized enums directly during ingestion:

```javascript
// 1. Deliverable Architecture
export const SYSTEM_ARCHETYPES = [
  'mobile-app',         // Mobile applications (iOS / Android)
  'web-portal',         // Web portals, e-Services, public websites
  'enterprise-erp',     // ERP, CRM, HR, inventory, internal workflow
  'data-analytics',     // Data warehouse, BI dashboards, AI, Big Data
  'gis-mapping',        // Map / spatial systems
  'infra-networking',   // Cloud setup, server migration, cabling, CCTV
  'other'
];

// 2. Engineering Scope & Complexity
export const COMPLEXITY_TIERS = [
  'basic',              // Small / Departmental Workgroup Tool
  'standard',           // Mid-sized Agency Operational System
  'enterprise'          // Mission-Critical / High-Concurrency / Nationwide
];
```

Stored in `TorInsight.overview.systemArchetype` and `TorInsight.overview.complexityTier`.

Code similarity compares these enums directly (scoring 1.0 for match, 0.5 for adjacent tier, 0.1 for distant tier), strictly fulfilling:  
> **"The AI picks the label; code does the comparing."**
