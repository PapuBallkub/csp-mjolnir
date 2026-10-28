# 0029 · Admin monitoring metrics, review workspace fields, and dataset integrity

Status: accepted · 2026-10-25 · amended to cover the full 10-section review workspace, pipeline monitoring control center, and version rollback (amends [0010](0010-normalized-tor-detail-Information.md), [0013](0013-confidence-scoring.md); aligns with [0030](0030-run-the-night-in-priority-waves.md), [0031](0031-keep-the-summary-a-change-replaces.md), and [0032](0032-record-what-changed-in-a-tor.md))

## Context

GIPDP surfaces Thai government IT procurement opportunities by automatically
ingesting announcements from official portals (e-GP, data.go.th, and agency feeds),
downloading PDF terms of reference (TOR), extracting text via OCR, and structuring
key procurement criteria via an LLM extraction pipeline ([0008](0008-ocr-gemini-pipeline.md),
[0010](0010-normalized-tor-detail-Information.md), [0013](0013-confidence-scoring.md)).

However, government source feeds and probabilistic AI extractions present two
critical operational challenges that cannot be handled by fully automated flows:

1. **Source feeds fail frequently and unpredictably.** Official endpoints
   (`process3.gprocurement.go.th`, `data.go.th`, and municipal portals) experience
   transient network drops, HTTP 429 rate limits, sudden markup/DOM structural
   changes, and PDF download timeouts. Without real-time visibility into polling
   health and step-level diagnostics, silent feed stalls go unnoticed, leaving the catalog
   outdated.
2. **AI extraction and OCR are probabilistic, not infallible.** Scanned PDFs with
   stamps, low-resolution pages, or irregular bureaucratic formatting can yield
   low-confidence extractions or hallucinatory numbers. Under NFR-17, extractions
   scoring below 80% confidence must be withheld from the public until cleared.
   Furthermore, generic government feeds often categorize non-IT tenders (such as
   landscaping or civil construction) under broad IT procurement codes, violating
   the platform's IT-only discovery scope (NFR-16).

Initial designs exposed only 5 ad-hoc fields for administrative review (reference price,
budget, submission deadline, penalty clause, and tech stack). In practice, this proved
critically insufficient: administrators could not correct mis-extracted deliverable
milestones, missing system integrations, restrictive company certifications, or
amendment summaries—fields that directly dictate whether an SME or freelance developer
can bid.

To satisfy **FR-22** (API ingestion uptime, polling health, and feed request failures),
**FR-23** (manual edit of extracted data and reclassification of misclassified TORs),
and **NFR-07** (version rollback of faulty extractions or amendments), the administrative
surface must provide actionable pipeline control, full editing parity with the public
TOR detail page, and safe version rollback.

---

## Decision

### 1. Ingestion Health & Pipeline Monitoring Control Center (FR-22)

The monitoring dashboard tracks pipeline operations across three functional layers:
per-source feed telemetry, system-wide rolling KPIs, and a real-time phase-filtered
task control center.

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
| `amendmentsDetected7d` | Tracks agency revision activity over the past week (e-GP notice codes D1/D2, package checks), ensuring amendment detection ([0032](0032-record-what-changed-in-a-tor.md)) is capturing changes. |

#### C. Phase-Filtered Task Monitoring & Step Controls (`GET /api/admin/pipeline/tasks`)

Administrators monitor and manage TORs as they transition across the five pipeline stages:

1. **Pending Download (`download`)**: TORs fetched by the scraper (`pipelineStatus: 'fetched'`) or flagged for recheck (`packageCheckNeeded: true`).
2. **OCR Phase (`ocr`)**: Downloaded documents awaiting or undergoing optical character recognition (`pipelineStatus: 'downloaded'` or `'ocr_preview'`).
3. **AI Extraction Phase (`extract`)**: Text extracted from OCR (`pipelineStatus: 'ocr_done'`) awaiting LLM structuring or full-text parsing.
4. **Extracted / Ready (`extracted`)**: Fully structured records (`TorInsight` present, `metadata.origin !== 'demo'`).
5. **Failed / Stuck (`failed`)**: Items encountering errors recorded in `PipelineFailure` (e.g. PDF corrupted, 429 rate limit, OCR crash).

**Per-Row Operational Actions:**
- **Run Step Now (`POST /api/admin/pipeline/retry`)**: Allows admins to trigger a specific step immediately with optional `runNow: true` to bypass night-wave queues, locked via `withRunLock`.
- **Skip Step (`POST /api/admin/pipeline/skip`)**: Allows admins to advance a stalled pipeline record past a non-critical step (e.g. price package download when no price form exists).
- **Inspect Record (`RecordInspectorModal`)**: Displays raw diagnostic JSON including OCR statistics, raw documents, and error stack traces.
- **Bulk Retry Semantics**: Scoped strictly to transient network/rate-limit failures (`transient: true`). Permanent logic failures (e.g. syntax errors or missing schema properties) are excluded from blind retries to prevent wasteful API hammering. Decorative emojis (`⚡`) are strictly prohibited in favor of clean iconography (`↻`).

---

### 2. Full 10-Section TOR Review Workspace (FR-23, NFR-17)

Rather than exposing an arbitrary subset of fields, the dedicated review workspace
(`/admin/review/[id]`) provides complete editing parity with the public TOR Detail Page
([0010](0010-normalized-tor-detail-Information.md)):

```
┌────────────────────────────────────────────────────────────────────────┐
│                      Dedicated Review Workspace                        │
├───────────────────────────────┬────────────────────────────────────────┤
│ Sticky Section Navigation     │ 1. Identification & Classification     │
│  1. ข้อมูลทั่วไปและการจัดประเภท   │ 2. Key Facts, Deadlines & Pricing      │
│  2. ข้อมูลสำคัญและราคา          │ 3. Overview, Archetype & Complexity    │
│  3. ภาพรวมและขอบเขต            │ 4. Deliverables Breakdown (Dynamic)    │
│  4. ขอบเขตงานส่งมอบ            │ 5. Tech Stack & Specs (Key-Value)      │
│  5. ข้อกำหนดเทคโนโลยี            │ 6. Integration, APIs & Data Migration  │
│  6. ระบบเดิมและสภาพแวดล้อม      │ 7. Operations, Training & SLA Terms    │
│  7. การติดตั้งและบำรุงรักษา        │ 8. Bidder Qualifications & Experience  │
│  8. คุณสมบัติผู้ยื่นข้อเสนอ        │ 9. Contract Terms & Payment Milestones │
│  9. เงื่อนไขสัญญา               │ 10. Amendment Information & Tracking   │
│ 10. ประวัติการแก้ไข             ├────────────────────────────────────────┤
│                               │ Evidence Drawer · Version Rollback     │
└───────────────────────────────┴────────────────────────────────────────┘
```

#### A. Structured Field Coverage Across All 10 Sections

1. **Identification & Classification**:
   - `title`, `titleEn`, `agency`, `department`, `category`, and `status`.
   - Allows reclassifying non-IT tenders as `excluded` (NFR-16).
2. **Key Facts & Pricing**:
   - `referencePriceTHB`, `budgetTHB`, `submissionDeadline`, `postedDate`, `penaltyClause`.
   - Enforces strict positive numeric validation to prevent phantom or corrupt prices.
3. **Overview & Scope**:
   - `objective`, `systemArchetype`, `complexityTier`, `majorComponents`, `highLevelScope`.
   - Directly drives similarity matching and price reality checks ([0021](0021-compare-realistic-projects.md)).
4. **Deliverables Breakdown**:
   - Managed via `DynamicListEditor` across `system`, `implementation`, and `validation` deliverables.
5. **Technical Requirements & Stack**:
   - `requiredTechnologies` (integrated with standard technology vocabulary and version tagging).
   - `requiredCapabilities` (dynamic list).
   - `infrastructureSpecs` & `technicalConstraints` (managed via structured `KeyValueListEditor`).
6. **Integration Environment**:
   - `existingSystems`, `interfacesAndApis` (dynamic list).
   - `dataMigrationNotes`, `deploymentLocation`.
7. **Implementation & Operational Requirements**:
   - `installationAndConfig`, `training`, `technicalSupportAndSla`, `maintenance`.
8. **Bidder Qualifications & Certifications**:
   - `companyReqs`, `requiredCertifications`, `manufacturerAuthorizations`, `personnelQualifications`.
   - `previousExperience` text and `previousExperienceMinTHB` threshold.
9. **Contract & Commercial Conditions**:
   - `paymentTerms` (milestone schedule), `deliveryConditions`, `evaluationMethod`.
10. **Amendment History & Tracking**:
    - `isAmended` boolean flag, `amendmentSummary`, and `changedSections` list ([0032](0032-record-what-changed-in-a-tor.md)).

#### B. Evidence Grounding Drawer

Extracted fields feature an inline **Evidence Grounding Drawer** linking each fact
directly to the source document page and verbatim excerpt. Admins can verify
extracted numbers and requirements against the scanned source PDF without leaving
the editing surface.

#### C. Real Verification Check Confidence

Confidence scores are no longer synthetic deductions. Instead, field-level confidence
badges map directly to verification check failures stored in `insight.metadata.checks`
([0013](0013-confidence-scoring.md)):
- A failed price check flags `referencePriceTHB` and `budgetTHB`.
- A failed deadline check flags `submissionDeadline`.
- A low OCR score flags company eligibility and narrative fields.

---

### 3. Version History & Safe Rollback (NFR-07, ADR 0031)

To protect dataset integrity and satisfy **NFR-07**:
1. **Immutable Snapshots on Edit**: Whenever an admin saves edits to a TOR, the
   existing `TorInsight` document is preserved as a snapshot in `TorInsightVersion`
   with `reason: 'admin-review'` and author attribution (`reviewedBy`).
2. **Side-by-Side Diffing**: The `VersionHistoryDrawer` enables admins to inspect
   exact field changes between the active record and any historical version.
3. **One-Click Rollback (`POST /api/admin/review/:projectId/rollback`)**:
   - Restores the selected version's summary and associated TOR facts.
   - Marks subsequent amendments with `rolledBack: true` ([0032](0032-record-what-changed-in-a-tor.md)),
     ensuring public search and detail views immediately reflect the restored state.

---

## Consequences

- **Full Parity Between Public and Admin Surfaces**: Administrators can inspect and
  correct any field that a developer or SME sees on the public TOR Detail Page.
- **Operational Safety**: Any human error introduced during review can be reversed
  instantaneously via version rollback without data loss.
- **Zero Mock Fallbacks**: All pipeline counts, failures, stage tasks, and review
  queues reflect actual database states in MongoDB, preventing misleading administrative
  diagnostics.
- **Thai-First Legibility**: Admin interfaces adhere to Thai-first copy guidelines
  (NFR-15), with clean typography, clear section hierarchy, and no decorative emojis.
