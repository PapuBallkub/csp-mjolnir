# Data Dictionary & Schema Specification: `TorInsight`

**File:** `server/src/models/tor-insight.model.js`  
**Model Name:** `TorInsight`  
**Collection Name:** `torinsights`  
**Related Documents:** [TOR Detail Page Feature Spec](../features/tor-detail-page.md), [ADR 0010 · Normalized TOR Detail Information](../decisions/0010-normalized-tor-detail-Information.md), [Tor Raw Schema Specification](./tor-schema.md)  
**Status:** Active  

---

## 1. Overview

The `TorInsight` model represents the normalized, intelligence-enriched view of a Thai government procurement Terms of Reference (TOR) document, from any agency on e-GP.

**Missing is `null`, never a guess** ([0014](../decisions/0014-price-names-and-insight-data-rules.md)). A field the TOR doesn't state stays `null`, so the page shows "not specified" instead of ฿0 or a made-up label. Lists default to `[]`.

It serves as the data backbone for the **TOR Detail Page**, **Catalog Filters**, **Search**, **Matchmaker**, and **Risk Analysis Engines** (Lock-Spec Detector, Price Reality Check).

### Architectural Distinctions:
- **`Tor` (`server/src/models/tor.model.js`)**: Stores raw scraped procurement metadata and raw PDF file references.
- **`TorInsight` (`server/src/models/tor-insight.model.js`)**: Stores structured, OCR/LLM-extracted, normalized data and GIPDP analytical verdicts.

---

## 2. Sub-Schemas

### 2.1 `findingSchema`
Used within `analytics.lockSpec.findings` to represent individual lock-spec / bid-tailoring risk items identified in the TOR.

| Field | Type | Required | Default | Description | Example / Allowed Values |
|---|---|---|---|---|---|
| `id` | `String` | Yes | — | Unique identifier for the finding item | `"FINDING-001"`, `"LOCK-01"` |
| `title` | `String` | Yes | — | Concise headline summarizing the lock-spec finding | `"Proprietary OS requirement with no open-source alternative"` |
| `category` | `String` | No | `""` | Classification of the risk signal | `"Vendor Lock-in"`, `"Qualification Anomaly"`, `"Specification Tailoring"`, `"Closed Ecosystem"` |
| `requirementText` | `String` | Yes | — | The exact or paraphrased requirement clause from the TOR | `"Must run specifically on Windows Server 2019 Datacenter Edition"` |
| `normalBenchmark` | `String` | No | `""` | Industry or standard fair procurement benchmark comparison | `"Standard public sector practice allows equivalent enterprise Linux distributions."` |
| `sourceExcerpt` | `String` | No | `""` | Direct excerpt quoted from the source TOR text | `"ระบบต้องติดตั้งบนระบบปฏิบัติการ Windows Server 2019 เท่านั้น"` |
| `sourceLocation` | `String` | No | `""` | Document page and section citation for auditability | `"หน้า 7 · ข้อ 2.2.1"` |
| `severity` | `String` | No | `'medium'` | Severity level of the finding | `'high'`, `'medium'`, `'low'` |

---

### 2.2 `comparableProjectSchema`
Used within `analytics.priceAnalysis.comparableProjects` to list historical reference projects used for price benchmarking.

| Field | Type | Required | Default | Description | Example |
|---|---|---|---|---|---|
| `title` | `String` | Yes | — | Title of the historical comparable government IT project | `"โครงการพัฒนาระบบคลังข้อมูลกลาง BMA Phase 1"` |
| `year` | `Number` | Yes | — | Fiscal year of the historical project | `2024` or `2567` |
| `referencePriceTHB` | `Number` | Yes | — | Approved reference price (ราคากลาง) of that project in Thai Baht (THB) | `15000000` |

### 2.3 `evidenceSchema`
Used as the values of the `evidence` map (§3.2b): where an extracted value came from.

| Field | Type | Required | Default | Description | Example |
|---|---|---|---|---|---|
| `quote` | `String` | Yes | — | The exact text in the TOR that states the value | `"ราคากลาง ๑,๘๕๐,๐๐๐ บาท"` |
| `page` | `Number` | No | `null` | The page it's on | `3` |

### 2.4 `technologySchema`
Used in `technicalRequirements.requiredTechnologies`.

| Field | Type | Required | Default | Description | Example |
|---|---|---|---|---|---|
| `name` | `String` | Yes | — | Canonical name from the technologies vocabulary ([technology-schema.md](./technology-schema.md)) | `"Windows Server"` |
| `version` | `String` | No | `null` | The version the TOR requires, kept apart because a required exact version is itself a lock-spec signal | `"2019"` |

### 2.5 `checkSchema`
Used in `metadata.checks`: one entry per **failed** check.

| Field | Type | Required | Default | Description | Example |
|---|---|---|---|---|---|
| `check` | `String` | Yes | — | Which check failed | `grounding`, `cross-source`, `sanity`, `ocr-quality`, `truncation` |
| `field` | `String` | No | `null` | The field it failed on | `"facts.referencePriceTHB"` |
| `severity` | `String` | Yes | — | `critical` caps the confidence score below 80 | `'critical'`, `'minor'` |
| `detail` | `Mixed` | No | `null` | What a reviewer needs to see why | `{ "feed": 1850000, "ai": 1580000 }` |

### 2.6 `exclusionSchema`
Used in `metadata.excluded`, when the classify step finds the document isn't IT.

| Field | Type | Required | Default | Description | Example |
|---|---|---|---|---|---|
| `reason` | `String` | Yes | — | Why it isn't IT, in plain language | `"Road construction, no software or IT scope"` |
| `quote` | `String` | No | `null` | The text that shows it | `"จ้างก่อสร้างถนนคอนกรีต"` |

---

## 3. Main `torInsightSchema` Fields

### 3.0 Primary Identification

| Field | Type | Required / Indexed | Description |
|---|---|---|---|
| `projectId` | `String` | Required, Unique, Indexed | 11-digit e-GP project ID linking this insight document directly to the raw `Tor` document and government e-GP record. |

---

### 3.1 `identification` (Project Identification)
*Corresponds to Feature Spec Section 4.1*

| Field | Type | Required / Indexed | Default | Description | Example |
|---|---|---|---|---|---|
| `titleTh` | `String` | Required | — | Official Thai title of the procurement project | `"โครงการพัฒนาระบบบริหารจัดการข้อมูลภาครัฐ"` |
| `titleEn` | `String` | No | `null` | English title. Not extracted while output is Thai only. | `"Government Data Management Platform Development"` |
| `agency` | `String` | Required, Indexed | — | Name of the procuring government organization, from the feed first | `"กรุงเทพมหานคร"` |
| `department` | `String` | No | `null` | Division/office responsible for the project | `"สำนักยุทธศาสตร์และประเมินผล"` |
| `egpReference` | `String` | No | `null` | Official e-GP announcement reference code | `"e-GP 67011234567"` |
| `category` | `String` | Indexed | `null` | Set by the classify step | `'Software / IT'`, `'Network / Security'` |
| `status` | `String` | Required, Indexed | — | Copied from `Tor.status` at extraction; never extracted, never defaulted. **The API doesn't read this copy:** the feed keeps changing the status (a cancellation, a winner), so the API reads it live from `Tor` and uses this only when no `Tor` exists. | `'Draft'`, `'Open'`, `'Awarded'`, `'Closed'`, `'Cancelled'` |

> **Status Semantics:**
> - `Draft`: Pre-announcement or public hearing stage.
> - `Open`: Active tender currently accepting submissions.
> - `Awarded`: Contractor selected and contract awarded.
> - `Closed`: Submission deadline has passed without official winner posted yet. **Worked out when the data is read** ("Open and past the deadline"), not stored, so neither pipeline writes the other's collection ([0013](../decisions/0013-split-ingestion-and-ai-extraction.md)).
> - `Cancelled`: Procurement cancelled by procuring agency.

---

### 3.2 `facts` (Key Procurement Facts)
*Corresponds to Feature Spec Section 4.2*

| Field | Type | Default | Indexed | Description |
|---|---|---|---|---|
| `budgetTHB` | `Number` | `null` | No | Budget (งบประมาณ): what the agency has set aside, in Thai Baht (THB). From the feed first; the AI fills gaps. |
| `referencePriceTHB` | `Number` | `null` | Yes | Reference price (ราคากลาง): the official price bids are judged against, in Thai Baht (THB). From the feed first; the AI fills gaps. |
| `submissionDeadline` | `Date` | `null` | No | Deadline date & time for bids submission, set by an invitation (ประกาศเชิญชวน). Null in a draft out for public hearing. |
| `commentDeadline` | `Date` | `null` | No | A draft out for public hearing (ร่าง TOR): the last date to send comments. Never a bid date; the two are never swapped (extract-v4, [0019](../decisions/0019-stage-badges-and-deadlines-that-say-what-for.md)). |
| `deliveryPeriodDays` | `Number` | `null` | No | Project implementation & delivery period (calendar days). |
| `procurementMethod` | `String` | `null` | No | Bidding method (e.g. `"e-Bidding"`, `"Specific Method (เฉพาะเจาะจง)"`, `"Selection (คัดเลือก)"`). |
| `warrantyYears` | `Number` | `null` | No | Warranty / maintenance obligation duration (in years). |
| `contractDurationDays` | `Number` | `null` | No | Total legal contract validity duration (days). |
| `penaltyClause` | `String` | `null` | No | Late delivery penalty clause (e.g. `"0.20% of contract value per day"`). |
| `postedDate` | `Date` | `null` | No | Official publishing date of the TOR. |
| `sourceUrl` | `String` | `null` | No | The feed's own link, copied from `Tor.egpUrl`. For admins and tracing; not shown to users. |
| `webUrl` | `String` | `null` | No | The e-GP page users open ("Open on e-GP"). Built from `projectId` by `egpAnnouncementUrl()`, never by the AI. |

Our own numbers, such as the historical median and average, are **not** facts. They live in `analytics.priceAnalysis`.

### 3.2b `evidence` (Where each fact came from)
A map from a field name inside `facts` to an `evidenceSchema` (§2.3). Every value the AI extracts carries its quote and page, so a reviewer can check it against the TOR and the grounding check can find it in `rawText`. Values copied from the feed have no entry.

```json
"evidence": {
  "referencePriceTHB": { "quote": "ราคากลาง ๑,๘๕๐,๐๐๐ บาท", "page": 3 },
  "submissionDeadline": { "quote": "ยื่นข้อเสนอภายในวันที่ ๑๘ สิงหาคม ๒๕๖๙", "page": 1 }
}
```

---

### 3.3 `overview` (Project Overview)
*Corresponds to Feature Spec Section 4.3*

| Field | Type | Default | Description |
|---|---|---|---|
| `objective` | `String` | `null` | High-level business and technical objectives of the project. |
| `majorComponents` | `[String]` | `[]` | List of primary modules, sub-systems, or architectural blocks to be built. |
| `highLevelScope` | `String` | `null` | Plain-language summary of what is within the scope of work. |

---

### 3.4 `deliverables` (Contractor Deliverables)
*Corresponds to Feature Spec Section 4.4*

| Field | Type | Default | Description |
|---|---|---|---|
| `system` | `[String]` | `[]` | Software systems, platforms, modules, mobile apps, or APIs to be delivered. |
| `implementation` | `[String]` | `[]` | Setup, installation, cloud provisioning, data migration, and deployment deliverables. |
| `validation` | `[String]` | `[]` | Acceptance testing, UAT, vulnerability assessments, penetration testing, and code audits. |
| `supportingWork` | `[String]` | `[]` | Manuals, architecture blueprints, data dictionary, admin guides, and handover documentation. |

---

### 3.5 `technicalRequirements` (Technical Requirements)
*Corresponds to Feature Spec Section 4.5*

| Field | Type | Description |
|---|---|---|
| `requiredTechnologies` | `[technologySchema]` | Technologies the TOR requires, each as a canonical `name` from the vocabulary plus an optional `version` (§2.4), e.g. `[{ "name": "Windows Server", "version": "2019" }]`. Used for search, matching and lock-spec. |
| `requiredCapabilities` | `[String]` | Required functional or architectural capabilities (e.g. `["Single Sign-On (OAuth2/OpenID)", "Role-Based Access Control", "Full-text Search"]`). |
| `infrastructureSpecifications` | `[{ key: String, spec: String }]` | Hardware/server specifications (e.g. `key: "CPU"`, `spec: "≥ 24 cores"`). |
| `technicalConstraints` | `[{ metric: String, value: String }]` | Non-functional performance/SLA metrics (e.g. `metric: "System Availability"`, `value: "≥ 99.9% uptime"`). |

---

### 3.6 `integrationEnvironment` (Integration & Existing Environment)
*Corresponds to Feature Spec Section 4.6*

| Field | Type | Default | Description |
|---|---|---|---|
| `existingSystems` | `[String]` | `[]` | Existing agency databases or legacy platforms the system must interface with. |
| `interfacesAndApis` | `[String]` | `[]` | Specific integration protocols or web services (e.g. REST API, SOAP, Webhook, Kafka). |
| `dataMigrationNotes` | `String` | `null` | Details regarding legacy data volume, cleansing, transformation, and migration. |
| `deploymentLocation` | `String` | `null` | Target deployment environment (e.g. `"BMA Data Center (On-Premise)"`, `"GDCC Government Cloud"`). |

---

### 3.7 `operationalRequirements` (Implementation & Operational Requirements)
*Corresponds to Feature Spec Section 4.7*

| Field | Type | Default | Description |
|---|---|---|---|
| `installationAndConfig` | `[String]` | `[]` | Environment setup, staging, network configuration, and installation tasks. |
| `training` | `[String]` | `[]` | User and administrator training programs, course hours, and attendee requirements. |
| `technicalSupportAndSla` | `String` | `null` | Support SLA requirements (e.g. `"24x7 support with 2-hour response time for severity 1 incidents"`). |
| `maintenance` | `[String]` | `[]` | Preventive maintenance schedules, patch management, and support periods. |

---

### 3.8 `eligibility` (Bid Eligibility & Qualifications)
*Corresponds to Feature Spec Section 4.8*

| Field | Type | Default | Description |
|---|---|---|---|
| `standardConditions` | `[String]` (enum) | `[]` | Which of the conditions every e-GP TOR repeats this one lists, as fixed keys from `server/src/models/standard-conditions.js` (e.g. `juristic-person`, `egp-registered`). Matched against the user's profile checklist, and **not shown** on the TOR page, except `juristic-person`, which shows as "เฉพาะนิติบุคคล". |
| `companyRequirements` | `[String]` | `[]` | Only the conditions **specific** to this project, such as a registered-capital or financial-standing threshold. These are what the TOR page shows. |
| `requiredCertifications` | `[String]` | `[]` | Required company certifications (e.g. `["ISO 29110", "ISO 27001", "CMMI Level 3"]`). |
| `manufacturerAuthorizations` | `[String]` | `[]` | Manufacturer Authorization Letters (MAF) required from OEMs/vendors. |
| `previousExperience` | `String` | `null` | Description of required past government/enterprise track record. |
| `previousExperienceMinTHB` | `Number` | `null` | Minimum value of a single past completed contract in Thai Baht (THB). |
| `personnelQualifications` | `[String]` | `[]` | Qualifications and certificates required for key personnel (PM, Lead Architect, Security Engineer). |

---

### 3.9 `contractConditions` (Contract & Commercial Conditions)
*Corresponds to Feature Spec Section 4.9*

| Field | Type | Default | Description |
|---|---|---|---|
| `paymentTerms` | `String` | `null` | Milestone-based payment schedule (e.g. `"Installment 1: 20% on SRS approval, Installment 2: 40% on UAT, Installment 3: 40% on final acceptance"`). |
| `deliveryConditions` | `String` | `null` | Acceptance criteria, inspection conditions, and handover process. |
| `evaluationMethod` | `String` | `null` | Evaluation scheme: `'Price'` (เกณฑ์ราคา) or `'Price Performance'` (เกณฑ์คุณภาพ/ราคาประกอบผลงาน). |

---

### 3.10 `analytics` (Decision Support & Intelligence Analytics)
*Corresponds to Feature Spec Sections 4.10, 4.11, 4.12*

Analytical values generated by GIPDP algorithms and LLM pipelines. This section is reshaped when price analysis (FR-19) and lock-spec (FR-20, FR-21) are built, which is why it still has `0` defaults.

#### `analytics.lockSpec` (Lock-Spec Risk Analysis)
- `riskScore` (`Number`, 0–100): Calculated risk probability score (0 = clean, 100 = heavily locked/tailored).
- `verdictText` (`String`): Plain-language summary of the lock-spec risk verdict.
- `findings` (`[findingSchema]`): Array of specific flagged clauses with evidence (see §2.1).

#### `analytics.priceAnalysis` (Price Reality Check)
- `referencePriceTHB` (`Number`): Project reference price / budget.
- `historicalMedianTHB` (`Number`): Historical median price for comparable scope.
- `diffPercentage` (`Number`): Percentage variance vs historical median (e.g., `+18.5%` or `-25.0%`).
- `interpretation` (`String`): Plain-language explanation of whether the budget is fair, underfunded, or inflated.
- `comparableProjects` (`[comparableProjectSchema]`): Historical benchmark projects used (see §2.2).

---

### 3.11 `amendmentInfo` (Status & Amendment Information)
*Corresponds to Feature Spec Section 4.13*

Tracks post-publishing changes and revisions to the procurement document:

| Field | Type | Default | Indexed | Description |
|---|---|---|---|---|
| `isAmended` | `Boolean` | `false` | Yes | `true` if the TOR has been amended or revised after initial announcement. Copied from `Tor.isAmended` at extraction; like `identification.status`, the API reads it live from `Tor`. |
| `lastAmendedDate` | `Date` | `null` | No | Date of the latest amendment. |
| `amendmentSummary` | `String` | `""` | No | Plain-language summary of what was revised. |
| `changedSections` | `[String]` | `[]` | No | Array of paths/sections modified (e.g. `["facts.submissionDeadline", "eligibility.companyRequirements"]`). |

---

### 3.12 `metadata` (Pipeline Extraction Metadata & Traceability)
*Internal system metadata for pipeline debugging and auditability.*

| Field | Type | Default | Description |
|---|---|---|---|
| `origin` | `String` (Indexed) | `'pipeline'` | `'pipeline'` for real extraction output, `'demo'` for made-up seed data used to build the UI. Demo data is always labelled where shown, is never "checked", and is replaced when the pipeline extracts that TOR ([0015](../decisions/0015-pilot-mode-and-demo-data.md)). |
| `modelName` | `String` | `null` | The Gemini model that produced it (e.g. `"gemini-3.7-flash"`). |
| `promptVersion` | `String` | `null` | The prompt version (e.g. `"extract-v1"`). An older version is re-processed only with `--outdated`. |
| `processedAt` | `Date` | `Date.now` | Timestamp when the extraction and normalization pipeline completed. |
| `sourceFingerprint` | `String` | `null` | A hash over [main PDF hash, ...amendment document hashes]. When it no longer matches the `Tor`, the source changed, and the insight is always re-processed. |
| `confidenceScore` | `Number` (0–100) | `null` | Worked out from the checks, never reported by the model. Under 80, the TOR is hidden from the public and waits for review (NFR-17). |
| `checks` | `[checkSchema]` | `[]` | The checks that failed, with reasons (§2.5). |
| `reviewStatus` | `String` (Indexed) | `'pending'` | `'pending'`, `'approved'` or `'rejected'`. During the pilot, every result starts as `pending`. |
| `reviewedBy` | `ObjectId` → `User` | `null` | The admin who reviewed it. |
| `reviewedAt` | `Date` | `null` | When it was reviewed. |
| `excluded` | `exclusionSchema` | `null` | Set when the document isn't IT (§2.6). Extraction stops there, so the other sections stay empty (NFR-16). |

---

### 3.13 Mongoose Timestamp Fields
- `createdAt` (`Date`): Timestamp when record was created in database.
- `updatedAt` (`Date`): Timestamp when record was last updated.

---

## 4. Example Document (JSON)

```json
{
  "_id": "660e1f77bcf86cd799439011",
  "projectId": "67010012345",
  "identification": {
    "titleTh": "โครงการพัฒนาระบบบริหารจัดการข้อมูลภาครัฐ",
    "titleEn": "Government Data Management Platform Development",
    "agency": "กรุงเทพมหานคร",
    "department": "สำนักยุทธศาสตร์และประเมินผล",
    "egpReference": "e-GP 67010012345",
    "category": "Software / IT",
    "status": "Open"
  },
  "facts": {
    "budgetTHB": 15500000,
    "referencePriceTHB": 15000000,
    "submissionDeadline": "2026-10-15T09:30:00.000Z",
    "deliveryPeriodDays": 180,
    "procurementMethod": "e-Bidding",
    "warrantyYears": 2,
    "contractDurationDays": null,
    "penaltyClause": "0.20% of contract value per day",
    "postedDate": "2026-09-15T00:00:00.000Z",
    "sourceUrl": "https://process3.gprocurement.go.th/egp2procmainWeb/jsp/procsearch.sch?project_id=67010012345",
    "webUrl": "https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=67010012345"
  },
  "evidence": {
    "submissionDeadline": { "quote": "ยื่นข้อเสนอภายในวันที่ ๑๕ ตุลาคม ๒๕๖๙ เวลา ๑๖.๓๐ น.", "page": 1 },
    "deliveryPeriodDays": { "quote": "ส่งมอบงานภายใน ๑๘๐ วัน", "page": 12 },
    "penaltyClause": { "quote": "ค่าปรับเป็นรายวันในอัตราร้อยละ ๐.๒๐ ของราคาค่าจ้าง", "page": 14 }
  },
  "overview": {
    "objective": "To establish a centralized data management and API platform for BMA departments.",
    "majorComponents": [
      "Data Ingestion Pipeline",
      "API Management Gateway",
      "Administrative Dashboard"
    ],
    "highLevelScope": "Design, develop, and deploy a secure data platform with high availability."
  },
  "deliverables": {
    "system": [
      "Web-based Management Portal",
      "RESTful API Gateway"
    ],
    "implementation": [
      "Cloud Infrastructure Provisioning",
      "Data Migration from Legacy Oracle DB"
    ],
    "validation": [
      "OWASP Top 10 Security Audit Report",
      "UAT Sign-off by BMA Committee"
    ],
    "supportingWork": [
      "System Architecture Document",
      "User Manual & Admin Guide",
      "Training 30 Officers"
    ]
  },
  "technicalRequirements": {
    "requiredTechnologies": [
      { "name": "Kubernetes", "version": null },
      { "name": "PostgreSQL", "version": "16" },
      { "name": "Node.js", "version": null },
      { "name": "Docker", "version": null }
    ],
    "requiredCapabilities": [
      "OAuth 2.0 / OpenID Connect Single Sign-On",
      "Role-based Access Control (RBAC)",
      "Audit Logging"
    ],
    "infrastructureSpecifications": [
      { "key": "CPU", "spec": "≥ 32 Cores" },
      { "key": "RAM", "spec": "≥ 64 GB" }
    ],
    "technicalConstraints": [
      { "metric": "System Availability", "value": "≥ 99.9%" },
      { "metric": "Response Time", "value": "< 500ms under 500 concurrent users" }
    ]
  },
  "integrationEnvironment": {
    "existingSystems": [
      "BMA Citizen Portal",
      "e-Document System"
    ],
    "interfacesAndApis": [
      "RESTful JSON APIs",
      "SOAP Web Services"
    ],
    "dataMigrationNotes": "Migrate ~5 million records from Oracle 11g database.",
    "deploymentLocation": "Government Cloud (GDCC)"
  },
  "operationalRequirements": {
    "installationAndConfig": [
      "Setup Production & Staging clusters on GDCC"
    ],
    "training": [
      "2 days Administrator Training (10 people)",
      "1 day End-User Training (50 people)"
    ],
    "technicalSupportAndSla": "24/7 technical support with 2-hour response time for critical incidents.",
    "maintenance": [
      "Monthly security patching and quarterly preventive maintenance"
    ]
  },
  "eligibility": {
    "companyRequirements": [
      "Juristic person registered under Thai Law",
      "Minimum registered capital 5,000,000 THB"
    ],
    "requiredCertifications": [
      "ISO 29110 or CMMI Level 3"
    ],
    "manufacturerAuthorizations": [],
    "previousExperience": "Must have completed at least one government software project within 5 years.",
    "previousExperienceMinTHB": 5000000,
    "personnelQualifications": [
      "Project Manager with PMP certificate",
      "Lead Developer with ≥ 5 years experience"
    ]
  },
  "contractConditions": {
    "paymentTerms": "4 Installments: 20% on Inception, 30% on Prototype, 30% on Delivery, 20% on UAT.",
    "deliveryConditions": "Delivered and verified at Digital Services Division, BMA.",
    "evaluationMethod": "Price"
  },
  "analytics": {
    "lockSpec": {
      "riskScore": 15,
      "verdictText": "Low lock-spec risk. Requirements use open standards and standard certifications.",
      "findings": []
    },
    "priceAnalysis": {
      "referencePriceTHB": 15000000,
      "historicalMedianTHB": 14200000,
      "diffPercentage": 5.6,
      "interpretation": "Reference price is within normal historical range for this scope.",
      "comparableProjects": [
        {
          "title": "โครงการพัฒนาระบบคลังข้อมูลกลาง BMA Phase 1",
          "year": 2567,
          "referencePriceTHB": 14000000
        }
      ]
    }
  },
  "amendmentInfo": {
    "isAmended": false,
    "lastAmendedDate": null,
    "amendmentSummary": "",
    "changedSections": []
  },
  "metadata": {
    "modelName": "gemini-3.7-flash",
    "promptVersion": "extract-v1",
    "processedAt": "2026-09-15T08:30:00.000Z",
    "sourceFingerprint": "9f2c41d0…",
    "confidenceScore": 94,
    "checks": [],
    "reviewStatus": "pending",
    "reviewedBy": null,
    "reviewedAt": null,
    "excluded": null
  }
}
```
