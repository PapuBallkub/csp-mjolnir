# 0016 · Admin monitoring metrics, review queue fields, and dataset integrity

Status: accepted · 2026-10-05

## Context

GIPDP surfaces Thai government IT procurement opportunities by automatically
ingesting announcements from official portals (e-GP, data.go.th, and agency feeds),
downloading PDF terms of reference (TOR), extracting text via OCR, and structuring
key procurement criteria via an LLM extraction pipeline (ADR 0008, 0010, 0013).

However, government source feeds and probabilistic AI extractions present two
critical operational challenges that cannot be handled by fully automated flows:

1. **Source feeds fail frequently and unpredictably.** Official endpoints
   (`process3.gprocurement.go.th`, `data.go.th`, and municipal portals) experience
   transient network drops, HTTP 429 rate limits, sudden markup/DOM structural
   changes, and PDF download timeouts. Without real-time visibility into polling
   health and error diagnostics, silent feed stalls go unnoticed, leaving the catalog
   outdated.
2. **AI extraction and OCR are probabilistic, not infallible.** Scanned PDFs with
   stamps, low-resolution pages, or irregular bureaucratic formatting can yield
   low-confidence extractions or hallucinatory numbers. Under NFR-17, extractions
   scoring below 80% confidence must be withheld from the public until cleared.
   Furthermore, generic government feeds often categorize non-IT tenders (such as
   landscaping or civil construction) under broad IT procurement codes, violating
   the platform's IT-only discovery scope (NFR-16).

To satisfy **FR-22** (API ingestion uptime, polling health, and feed request failures)
and **FR-23** (manual edit of extracted data and reclassification of misclassified TORs),
the admin surface must provide actionable visibility and surgical data correction.
Exposing every raw database column would create overwhelming cognitive clutter,
while exposing too few fields would prevent administrators from correcting the
exact data points that determine whether a tech vendor or freelancer can bid.

This decision defines why specific operational metrics and editable fields were
selected for the platform's administrative tools.

---

## Decision

### 1. Ingestion Health & Monitoring Fields (FR-22)

The monitoring dashboard tracks pipeline operations across two visual levels:
per-source feed telemetry and system-wide rolling KPIs.

#### A. Per-Source Scraper Telemetry (`sources`)

| Field | Type | Why This Specific Field Was Chosen |
|---|---|---|
| `id` & `name` | string | Uniquely identifies each ingestion source (e.g. `process3` e-GP RSS, `datago` CKAN API, BMA municipal portals). |
| `portal` | string | Displays the specific remote domain/hostname being polled. When network connectivity or DNS issues occur, this immediately clarifies whether the issue is isolated to a specific department server or the central Comptroller General's Department. |
| `format` | enum (`json`, `html`, `scanned-pdf`, `image`) | Discloses the extraction ingestion mode. A failure in an `html` scraper typically points to DOM selector drift, while a failure in `scanned-pdf` signals OCR timeouts or unreadable attachments. |
| `health` | enum (`ok`, `degraded`, `failed`) | A tri-state operational signal. `ok` indicates healthy polling and document ingestion; `degraded` signals non-fatal partial failures (e.g. 3 of 7 PDF downloads timed out, or rate limits triggered retries); `failed` signals total obstruction (e.g. 0 rows returned, HTTP 5xx, or invalid auth). |
| `uptime` | percentage (0–100%) | Measures rolling availability over a 30-day window (`successful_runs / total_runs`). Enables maintainers to evaluate long-term source reliability and vendor SLA compliance. |
| `history` | boolean[14] | A 14-run historical sparkline (one unit per daily run, oldest to newest). Transient one-off network glitches are visually differentiated from persistent multi-day outages without requiring log parsing. |
| `docsLast7Days` | number | Quantifies recent ingestion yield. A source showing `health: ok` but `docsLast7Days: 0` immediately uncovers silent logic bugs (e.g. query filters that unintentionally drop valid notices). |
| `lastRun` | timestamp string | Indicates run recency. Confirms that background cron schedules and polling jobs are executing on cadence. |
| `error` | string (optional) | The literal runtime failure or exception snippet (e.g. `Selector .announce-list > tr matched 0 rows`, `HTTP 429 Too Many Requests`). Provides immediate troubleshooting context directly on screen without needing terminal SSH access. |

#### B. System-Wide Operational Counters (`stats`)

| Metric | Why This Specific Field Was Chosen |
|---|---|
| `docsIngestedToday` | Measures daily pipeline throughput, providing immediate feedback after manual or scheduled ingestion runs. |
| `docsAwaitingReview` | Tracks the human review backlog. Indicates the volume of TORs withheld from public search under NFR-17 waiting for administrative clearance. |
| `avgOcrConfidence` | Monitors the health of the upstream optical character recognition layer across scanned documents. A sharp drop indicates that incoming agency scans are corrupted or degraded. |
| `avgExtractionConfidence` | Gauges LLM schema compliance and validation check pass rates. Serves as an early indicator if model prompt adjustments degrade extraction quality. |
| `amendmentsDetected7d` | Tracks agency revision activity over the past week (e-GP notice codes D1/D2), ensuring amendment detection (FR-16) is capturing changes. |

---

### 2. Extraction Review Queue & Manual Edit Fields (FR-23)

The review queue allows administrators to inspect flagged TORs, correct data
discrepancies, and reclassify non-IT documents. The fields exposed for editing
are deliberately restricted to high-impact criteria that dictate bidder eligibility,
pricing, and technical relevance.

#### A. Document Header & Provenance

- **`docId` (`projectId`)**: The 11-digit official e-GP project ID. Anchors the
  record to the official procurement database.
- **`title` & `agency`**: Provides immediate context so administrators can recognize
  the project without opening raw payloads.
- **`ingestedAt`**: Date and time the document was processed by the pipeline.
- **Split Confidence Bars (`ocr` vs `extraction`)**:
  - Displays OCR confidence alongside the LLM extraction score (derived from
    failed validation checks per ADR 0013).
  - Pinpoints *why* the TOR was queued: an unreadable scan (low OCR) requires
    checking the physical document, whereas a failed check (e.g. reference price
    exceeding budget) indicates a logic or extraction conflict.

#### B. Classification & Scope Correction (`misclassified` / `excluded`)

- **Scope Check (NFR-16)**: Non-IT projects must never pollute the platform's
  discovery engine.
- **Fields**:
  - `predicted`: Category detected by the pipeline (e.g. "IT / software").
  - `likely`: Human or heuristic assessment (e.g. "Civil works — out of scope").
- **Admin Actions**:
  - **Reclassify as Out of Scope**: Sets `TorInsight.metadata.excluded = { reason, quote }`
    and sets `reviewStatus = 'rejected'`. The project is permanently excluded from
    public search and recommendations.
  - **Confirm Classification**: Clears the classification warning and confirms
    the tender is genuine IT procurement.

#### C. High-Impact Editable Procurement Fields (`lowFields` / `facts`)

Cosmetic variations in general project descriptions do not alter commercial bidding
decisions. In contrast, inaccuracies in the following five core fields directly
mislead contractors or cause disqualification:

| Editable Field | Target In Schema | Why This Specific Field Is Editable |
|---|---|---|
| **ราคากลาง (Reference Price)** | `facts.referencePriceTHB` | Directly dictates bidding price ceilings and fuels the Price Reality Check (FR-19). An OCR or extraction error here invalidates price comparisons against historical averages. |
| **งบประมาณ (Maximum Budget)** | `facts.budgetTHB` | Governs project scale filtering and company financial qualification matching. |
| **Submission Deadline (วันสิ้นสุดรับซอง)** | `facts.submissionDeadline` | A corrupted or misread submission deadline causes contractors to either submit late (disqualification) or disregard viable active opportunities. |
| **Penalty Clause (ค่าปรับรายวัน)** | `facts.penaltyClause` | High-liability legal clause (typically 0.20%/day for IT systems). Critical for contractor risk calculation. |
| **Required Tech Stack (เทคโนโลยีที่กำหนด)** | `technicalRequirements.requiredTechnologies` | Directly drives developer matchmaking (FR-12, FR-13) and technology search filters. Correcting unrecognized or mis-parsed versions ensures accurate contractor recommendations. |

#### D. Review Queue Actions & Dataset Integrity

- **Save and Publish (`reviewStatus: approved`)**:
  - Persists manual field adjustments to `TorInsight`.
  - Stamps `metadata.reviewedBy = req.user._id` and `metadata.reviewedAt = new Date()`.
  - Promotes `metadata.reviewStatus` from `pending` to `approved`.
  - **Impact on Public Catalog**: In strict mode (outside pilot mode), this
    immediately unblocks the TOR, allowing it to pass `visibilityFilter()` and
    appear in search results (NFR-17).
- **Open Source File / Portal Link**:
  - Provides a direct link to the official e-GP announcement and stored PDF.
  - Maintains the principle that the original government document is the sole
    authority (AGENTS.md §6).
- **Re-run Extraction**:
  - Queues the TOR for re-extraction when prompt versions or extraction schemas
    have been updated.

---

## Consequences

- **Focused Admin Workflow**: Administrators spend time verifying only critical
  commercial facts and resolving ambiguous classifications, rather than proofreading
  entire 50-page specifications.
- **Strict Role-Based Access Control**: All administrative endpoints reside under
  `/api/admin`, guarded by `requireAuth` and `requireRole('admin')` (ADR 0011).
  No operational telemetry, scraper failure details, or review queues leak to
  unauthenticated or standard users.
- **Traceable Human Audit Trail**: Every manual edit records the reviewing admin's ID
  and timestamp in `TorInsight.metadata`, ensuring accountability for dataset changes.
- **Public Catalog Safety**: Low-confidence or unreviewed documents remain shielded
  from public view until an admin explicitly saves and publishes them, upholding
  dataset credibility.
