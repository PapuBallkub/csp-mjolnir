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

### 1. The Two Fundamental Questions for Comparable Projects

To find legitimate comparable peers, a benchmarking engine must answer two separate questions:

1. **Question 1: Architectural Type (What kind of software is it?)**
   - Answered by `overview.systemArchetype` (`mobile-app`, `web-portal`, `enterprise-erp`, `data-analytics`, `gis-mapping`, `infra-networking`, `other`) and `technicalRequirements.requiredTechnologies`.
   - A mobile application is compared with other mobile applications, never with a CCTV installation or an ERP system.
2. **Question 2: Engineering Scope & Complexity (How large and demanding is it?)**
   - Answered by `overview.complexityTier` (`basic`, `standard`, `enterprise`).
   - A simple 3-page registration form is never compared with a high-concurrency national citizen portal, even though both share the same architecture (`web-portal`) and stack (`React`, `PostgreSQL`).

#### Why we deliberately do NOT match on business topic or `overview.objective`
- **The "Zero-Peer" Trap:** In Thai government procurement, an agency tenders a *"Calories Tracking Application"* once every few years. Requiring domain business topic matches results in 0 historical peers.
- **Identical Software Engineering Effort:** A ฿3M mobile app for tracking calories requires the exact same team structure, architecture, and deliverables (iOS/Android apps, user authentication, REST APIs, database, admin CMS, 180-day delivery, 1-year warranty) as a ฿3M mobile app for national park camping reservations. Their market prices are directly comparable.
- **`overview.objective` contains bureaucratic boilerplate:** Thai government project objectives are heavily padded with generic slogans (*"เพื่อยกระดับประสิทธิภาพตามหลักธรรมาภิบาล"*). Matching on objectives causes false-positive similarity based on shared slogans rather than shared technical work.

---

### 2. Elimination of Circular Logic: Moving from Price Brackets to `complexityTier`

#### The Problem with Budget Brackets ($[0.3\times, 3.0\times]$)
In earlier iterations, the system used reference price brackets as a proxy for project size. While economically motivated, this introduces **circular reasoning**:
- *If the goal of the feature is to detect whether a price is abnormal, filtering candidate peers by price biases the comparison.*
- An inflated project might pull in other expensive projects; an underfunded project might pull in cheaper projects.
- In academic and audit reviews, using price to test price undermines scientific credibility.

#### The Decision: Peer Selection 100% on Technical Specifications
Peers are selected **purely on technical characteristics extracted by Gemini during ingestion**:
$$\text{Category} \longrightarrow \text{System Archetype} \longrightarrow \text{Complexity Tier} \longrightarrow \text{Technology Stack}$$
**Price is NEVER used to select or filter candidate peers.** Once the technical peers are identified, their historical reference prices are analyzed to compute the true, unbiased market median.

---

### 3. Specification of `overview.complexityTier`

During AI extraction (`server/src/pipeline/extraction/schema.js`), Gemini inspects the technical requirements of the TOR and assigns one of three standardized engineering tiers:

```javascript
export const COMPLEXITY_TIERS = [
  'basic',       // Small / Departmental Workgroup Tool
  'standard',    // Mid-sized Agency Operational System
  'enterprise'   // Mission-Critical / High-Concurrency / Nationwide
];
```

#### Detailed Definitions & Justifications:

| Tier | Definition | What Gemini Inspects in the TOR | Real-World Thai Procurement Examples |
|---|---|---|---|
| **`basic`** | **Small / Internal Workgroup Tool** | • Internal use only (10–100 staff)<br>• Single module, simple CRUD operations, 1 database<br>• Standalone: no integrations with external databases<br>• Standard timeline (30–90 days), 1–2 developers | Department meeting room booking, online training evaluation survey, internal stationery inventory, informational brochure website. |
| **`standard`** | **Agency-Wide Operational System** | • Serves an entire agency or department (hundreds to thousands of staff)<br>• Role-based access control (RBAC), approval workflows, audit logs<br>• 1–2 external API connections, data migration from legacy database<br>• Requires formal UAT, admin manuals, 180–240 day delivery | Provincial hospital equipment inventory, district land office queue management, municipal complaint management system with Line Notify. |
| **`enterprise`** | **Nationwide / High-Concurrency Platform** | • Public-facing to millions of citizens OR mission-critical ministry core<br>• High Availability (99.9% SLA, load balancing, Disaster Recovery site)<br>• Strict cybersecurity audits (OWASP Top 10, penetration testing, PDPA compliance)<br>• Multiple integrations (DOPA citizen registry, ThaID, national payment gateways) | Mor Prom (หมอพร้อม), Pao Tang (เป๋าตัง), National Tax E-Filing System, Court of Justice Case Management Platform. |

#### What TOR Sections the AI Analyzes:
1. **Target Users & Concurrency:** Look at `overview.highLevelScope` and project background for internal staff vs nationwide citizen usage.
2. **Deliverables Breadth:** Inspect `deliverables.system` and `deliverables.implementation` (single module vs multi-platform ecosystem).
3. **Integration Requirements:** Inspect `technicalRequirements` for connections to external government databases (DOPA, ThaID, e-GP, payment gateways).
4. **Non-Functional & SLA:** Inspect high availability (HA), failover clusters, penetration testing, and 24/7 support clauses.

---

### 4. Fields Used from `TorInsight`

All fields are read from the normalized [`TorInsight`](../../server/src/models/tor-insight.model.js) document:

| Field in `TorInsight` | Data Type | Role in Matching | Rationale |
|---|---|---|---|
| `identification.category` | `String` | **Stage 1: Hard Filter** | Broad IT domain (`software-development`, `cloud-and-infrastructure`, `maintenance-and-support`). Prevents comparing software against hardware. |
| `overview.systemArchetype` | `String` (enum) | **Stage 2: Architecture Score ($S_{\text{archetype}}$, 40%)** | Standardized deliverable architecture (`mobile-app`, `web-portal`, `enterprise-erp`, etc.). Match = 1.0, mismatch = 0.15. |
| `overview.complexityTier` | `String` (enum) | **Stage 2: Scope Score ($S_{\text{complexity}}$, 35%)** | Engineering scale tier (`basic`, `standard`, `enterprise`). Same tier = 1.0, adjacent tier = 0.5, two tiers apart = 0.1. |
| `technicalRequirements.requiredTechnologies` | `[Object]` | **Stage 2: Tech Bonus Score ($S_{\text{tech}}$, 25%)** | Jaccard similarity of normalized technology names (`React`, `PostgreSQL`, `Docker`). Soft-weighted with neutral 0.5 fallback when unstated. |
| `identification.titleTh` | `String` | **Display & Traceability Only** | Excluded from similarity scoring to eliminate administrative phrasing noise. Populates the output `{ title, year, referencePriceTHB }` for user cards and citations. |

---

### 5. Deterministic Matching Algorithm

Matching executes entirely in backend code with **zero runtime LLM calls**:

#### Stage 1 — Candidate Pool Query (MongoDB)
- Exact match on `identification.category`
- Match target `overview.systemArchetype` (or candidate pool within category)
- Exclude target `projectId`
- Filter to `FULL_EXTRACTION` only (ADR 0028)
- *No price filter applied.*

#### Stage 2 — In-Memory Composite Scoring
$$\text{Score} = (S_{\text{archetype}} \times 0.40) + (S_{\text{complexity}} \times 0.35) + (S_{\text{tech}} \times 0.25)$$

1. **Architecture Similarity ($S_{\text{archetype}}$, 40%):**
   - Same `systemArchetype` = $1.00$
   - Different `systemArchetype` = $0.15$
   - Hybrid projects: Jaccard overlap on archetype sets $\frac{|A \cap B|}{|A \cup B|}$.
2. **Complexity Scope Similarity ($S_{\text{complexity}}$, 35%):**
   - Exact tier match (`standard` vs `standard`) = $1.00$
   - Adjacent tier (`basic` vs `standard`, or `standard` vs `enterprise`) = $0.50$
   - Distant tier (`basic` vs `enterprise`) = $0.10$
   - Fallback when unclassified: keyword matching over `majorComponents` and `highLevelScope`, or neutral $0.50$.
3. **Technology Similarity ($S_{\text{tech}}$, 25%):**
   - Jaccard similarity of normalized technology names: $\frac{|\text{Tech}_A \cap \text{Tech}_B|}{|\text{Tech}_A \cup \text{Tech}_B|}$.
   - Defaults to $0.50$ when neither project specifies technologies.

The top 5 highest-scoring candidates populate `analytics.priceAnalysis.comparableProjects`.

---

### 6. Sample Size Threshold ($N \ge 3$)

In accordance with ADR 0024, once technical peers are identified, their reference prices are used to compute the historical median:
- **$N = 0$:** `reliability: "none"`. No peer data; benchmarks remain `null`.
- **$1 \le N < 3$:** `reliability: "low"`. Benchmarks are shown, but the UI displays an advisory banner and refuses to issue a definitive normal verdict.
- **$N \ge 3$:** `reliability: "sufficient"`. Mathematically, $N=3$ is the smallest sample that provides a distinct middle value for a true median.

---

## Consequences

- **Zero circular reasoning:** Benchmarks are immune to criticism of price bias because peers are selected strictly on technical requirements (Archetype, Complexity Tier, Tech Stack).
- **Sub-2s page load preserved (NFR-01):** Classification happens once during ingestion; matching runs in deterministic code in < 10ms.
- **Realistic grouping:** A simple municipal form never compares against an enterprise ministry portal, even if both use React and PostgreSQL.
- **Traceable evidence:** Every comparable project provides title, year, and reference price so watchdogs and bidders can verify the benchmark source.
