# Data Dictionary & Schema Specification: `Tor`

**File:** `server/src/models/tor.model.js`  
**Model Name:** `Tor`  
**Collection Name:** `tors`  
**Related Documents:** [ADR 0008 · TOR Ingestion Pipeline](../decisions/0008-tor-ingestion-pipeline.md), [ADR 0003 · Feature-based Server Layout](../decisions/0003-feature-based-server-layout.md), [TorInsight Schema Specification](./tor-insight-schema.md)  
**Status:** Active  

---

## 1. Overview

The `Tor` model represents the **raw, ingested government procurement entity** collected directly from upstream sources (e-GP process3 API, Open Data portal data.go.th, or manual ingestion).

### Architectural Role:
- **Raw Document & Pipeline Anchor**: Holds the original procurement metadata, PDF file paths, OCR raw text, and pipeline progression state (`pipelineStatus`).
- **Amendment & Verification Trail**: Tracks historical revisions, PDF SHA-256 hashes (`contentHash`), and round-by-round field changes for watchdog auditing (FR09, FR10, FR11).
- **Relation to `TorInsight`**: Once raw text is extracted via OCR, the LLM intelligence pipeline normalizes this data into a downstream `TorInsight` record keyed by `projectId`.

---

## 2. Sub-Schemas & Embedded Objects

### 2.1 `contract`
Stores contractor award, winning bidder, and contract finalization data (available for `Awarded` tenders, typically sourced from data.go.th).

| Field | Type | Default | Description | Real Example |
|---|---|---|---|---|
| `winnerName` | `String` | `null` | Name of the winning bidding company/vendor | `"บริษัท บางกอก เมดิคอล ซอฟต์แวร์ จำกัด"` |
| `winnerTaxId` | `String` | `null` | 13-digit Juristic Tax ID of the winning company | `"0105548152334"` |
| `contractNo` | `String` | `null` | Official government contract number | `"9/2568"` |
| `contractSignDate` | `String` | `null` | Date when the contract was signed (Thai format) | `"14 ม.ค. 69"` |
| `contractEndDate` | `String` | `null` | Contract expiration or completion date | `null` or `"30 ก.ย. 69"` |
| `agreedPriceTHB` | `Number` | `null` | Final agreed contract price (ราคาตกลงซื้อ/จ้าง) in Thai Baht (THB). `null` when the source doesn't give one. | `12300000` |
| `projectStatus` | `String` | `""` | Description of the contract status from upstream agency | `"ประกวดราคาจ้างพัฒนาคลังข้อมูลสุขภาพดิจิทัล..."` |

---

### 2.2 `document`
Tracks physical storage, metadata, and SHA-256 fingerprint of the downloaded procurement PDF.

| Field | Type | Default | Indexed | Description | Real Example |
|---|---|---|---|---|---|
| `fileName` | `String` | `null` | No | Original or standardized PDF filename | `"68049205582_TOR.pdf"` |
| `storagePath` | `String` | `null` | No | Absolute filesystem or container path to the PDF | `"/app/data/documents/68049205582_TOR.pdf"` |
| `sizeBytes` | `Number` | `null` | No | File size in bytes | `9735994` (~9.7 MB) |
| `pages` | `Number` | `null` | No | Total page count of the PDF document | `30` |
| `documentType` | `String` | `'UNKNOWN'` | No | Document type classification (`'DIGITAL_TEXT_PDF'`, `'SCANNED_PAPER_PDF'`, `'UNKNOWN'`) | `"SCANNED_PAPER_PDF"` |
| `contentHash` | `String` | `null` | Yes | SHA-256 cryptographic hash of the PDF file (used for amendment change detection) | `"47f6959e4b0bb5ba788836b2950093f5a6578958c8a6350cd22b63fddc1e6e2f"` |
| `version` | `Number` | `1` | No | Document revision version number | `1` |

---

### 2.3 `ocr`
Stores extraction output, pipeline flags, and confidence scores from OCR processing.

| Field | Type | Default | Description | Real Example |
|---|---|---|---|---|
| `rawText` | `String` | `""` | Complete raw text extracted from PDF pages | `"รายละเอียดคุณลักษณะเฉพาะ..."` |
| `confidence` | `Number` | `0` | Confidence score of the extraction (0.0 to 1.0 or percentage) | `0.92` |
| `usedOcr` | `Boolean` | `false` | `true` if Tesseract / Vision OCR was invoked (for scanned PDFs) | `true` |
| `truncated` | `Boolean` | `false` | `true` if part of the document never reached `rawText` (page limit, timeout, or failed pages). Extraction treats it as a failed check ([0013](../decisions/0013-split-ingestion-and-ai-extraction.md)). | `false` |
| `preview` | `Boolean` | `false` | `true` while `rawText` holds only the first pages of a scan, read so classify can decide whether the TOR is IT. Extraction refuses to extract from a preview [0018](../decisions/0018-preview-ocr-before-classify.md). | `true` |
| `pagesRead` | `Number` | `null` | Pages actually read into `rawText` | `6` |
| `processedAt` | `Date` | `null` | Timestamp when OCR extraction completed | `"2026-09-29T17:17:08.000Z"` |

---

### 2.4 `amendments` (Array of Amendment Records)
Tracks watchdog audit trail when government revisions occur (FR09, FR10, FR11).

| Field | Type | Default | Description | Example |
|---|---|---|---|---|
| `round` | `String` | `""` | Amendment sequence / revision title | `"ครั้งที่ 2"` |
| `date` | `Date` | `Date.now` | Date when the amendment was detected or announced | `"2026-09-20T00:00:00.000Z"` |
| `headline` | `String` | `""` | Brief summary of what was amended | `"แก้ไขกำหนดเวลายื่นข้อเสนอ และปรับลดสเปกขั้นต่ำ"` |
| `contentHash` | `String` | `null` | SHA-256 hash of the newly uploaded amended PDF | `"a3f5b8..."` |
| `changes` | `Array` | `[]` | List of granular diffs (see below) | `[...]` |

#### Granular `changes` Schema:
- `kind` (`String`, enum: `['added', 'removed', 'changed']`, default: `'changed'`): Nature of the change.
- `field` (`String`): Field or section path changed (e.g., `"facts.submissionDeadline"`).
- `before` (`String`): Previous value before amendment.
- `after` (`String`): New value after amendment.

---

## 3. Main `torSchema` Fields

| Field | Type | Required / Indexed | Default | Description | Real Example |
|---|---|---|---|---|---|
| `projectId` | `String` | Required, Unique, Indexed | — | 11-digit official e-GP project ID (Primary dedup key) | `"68049205582"` |
| `source` | `String` | Required | — | Upstream source identifier (`'process3'`, `'datago'`, `'manual'`) | `"datago"` |
| `title` | `String` | Required | — | Raw announcement / procurement project title | `"ประกวดราคาจ้างพัฒนาคลังข้อมูลสุขภาพดิจิทัล..."` |
| `agency` | `String` | No | `""` | Main procuring ministry / organization name | `"สำนักงานปลัดกระทรวงสาธารณสุข"` |
| `subAgency` | `String` | No | `""` | Sub-department, bureau, or division | `"สำนักสุขภาพดิจิทัล"` |
| `province` | `String` | No | `""` | Province location of the procuring entity | `"นนทบุรี"` |
| `district` | `String` | No | `""` | District / Subdistrict location | `"ตลาดขวัญ"` |
| `budgetTHB` | `Number` | No | `null` | Budget (งบประมาณ): what the agency has set aside, in Thai Baht (THB). `null` when the feed doesn't give one. | `12500000` |
| `referencePriceTHB` | `Number` | No | `null` | Reference price (ราคากลาง): the official price bids are judged against, in Thai Baht (THB). Not a statistical median. Was `medianPriceTHB` before [0014](../decisions/0014-price-names-and-insight-data-rules.md). | `12492771` |
| `announceDate` | `String` | No | `null` | Date of announcement as string from source | `"13 พ.ค. 68"` |
| `procurementMethod` | `String` | No | `""` | Procurement method name from upstream source | `"ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)"` |
| `procurementKind` | `String` | No | `null` | The contract's kind, read from the title: `hire` (จ้าง, a job), `buy` (ซื้อ, supplying goods), `rent` (เช่า) [0018](../decisions/0018-preview-ocr-before-classify.md) | `"hire"` |
| `egpUrl` | `String` | No | `""` | Direct link to e-GP search page for this project | `"https://process3.gprocurement.go.th/egp2procmainWeb/jsp/procsearch.sch?project_id=68049205582"` |
| `announceType` | `String` | No | `""` | The latest e-GP announcement code seen: `15` reference price, `B0` draft TOR, `D0` invitation, `D2` invitation changed, `D1` invitation cancelled, `W0`/`W2` winner announced/changed, `W1` winner cancelled ([0017](../decisions/0017-read-the-egp-feed-as-egp-defines-it.md)) | `"D0"` |
| `status` | `String` | Indexed | `'Open'` | Current procurement status (`'Draft'`, `'Open'`, `'Awarded'`, `'Closed'`, `'Cancelled'`) | `"Awarded"` |
| `isAmended` | `Boolean` | Indexed | `false` | Whether this TOR has been amended/revised | `false` |
| `pipelineStatus` | `String` | Indexed | `'fetched'` | Current processing state in backend ingestion pipeline (`'fetched'`, `'downloaded'`, `'ocr_preview'`, `'ocr_done'`; see [0018](../decisions/0018-preview-ocr-before-classify.md)) | `"downloaded"` |
| `createdAt` | `Date` | Auto | — | Timestamp of initial ingestion into database | `"2026-09-29T17:17:08.378Z"` |
| `updatedAt` | `Date` | Auto | — | Timestamp of last database modification | `"2026-09-29T17:17:08.861Z"` |

---

## 4. Pipeline Progression States

```text
[ fetched ]      --> Upstream metadata captured from RSS / data.go.th API
     │
     ▼
[ downloaded ]   --> PDF document successfully saved to local / volume storage
     │
     ▼
[ ocr_preview ]  --> First 6 pages of a scan read; classify decides IT or not (a digital
                     PDF or a short scan skips this). Not IT stays here.
     │
     ▼
[ ocr_done ]     --> Text extracted; ready for LLM summarization and TorInsight creation
```

---

## 5. Real-World Document Sample (MongoDB JSON)

```json
{
  "_id": {
    "$oid": "6abbf29400aca0d5550d4bfa"
  },
  "projectId": "68049205582",
  "source": "datago",
  "title": "ประกวดราคาจ้างพัฒนาคลังข้อมูลสุขภาพดิจิทัล สำนักสุขภาพดิจิทัล สำนักงานปลัดกระทรวงสาธารณสุข ตำบลตลาดขวัญ อำเภอเมืองนนทบุรี จังหวัดนนทบุรี 1 ระบบ ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)",
  "agency": "สำนักงานปลัดกระทรวงสาธารณสุข",
  "subAgency": "สำนักสุขภาพดิจิทัล",
  "province": "นนทบุรี",
  "district": "ตลาดขวัญ",
  "budgetTHB": 12500000,
  "referencePriceTHB": 12492771,
  "announceDate": "13 พ.ค. 68",
  "procurementMethod": "ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)",
  "egpUrl": "https://process3.gprocurement.go.th/egp2procmainWeb/jsp/procsearch.sch?project_id=68049205582",
  "announceType": "B0",
  "contract": {
    "winnerName": "บริษัท บางกอก เมดิคอล ซอฟต์แวร์  จำกัด",
    "winnerTaxId": "0105548152334",
    "contractNo": "9/2568",
    "contractSignDate": "14 ม.ค. 69",
    "contractEndDate": null,
    "agreedPriceTHB": 12300000,
    "projectStatus": "ประกวดราคาจ้างพัฒนาคลังข้อมูลสุขภาพดิจิทัล สำนักสุขภาพดิจิทัล สำนักงานปลัดกระทรวงสาธารณสุข ตำบลตลาดขวัญ อำเภอเมืองนนทบุรี จังหวัดนนทบุรี 1 ระบบ ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)"
  },
  "document": {
    "fileName": "68049205582_TOR.pdf",
    "storagePath": "/app/data/documents/68049205582_TOR.pdf",
    "sizeBytes": 9735994,
    "pages": 30,
    "documentType": "SCANNED_PAPER_PDF",
    "contentHash": "47f6959e4b0bb5ba788836b2950093f5a6578958c8a6350cd22b63fddc1e6e2f",
    "version": 1
  },
  "ocr": {
    "rawText": "",
    "confidence": 0,
    "usedOcr": false,
    "truncated": false,
    "processedAt": null
  },
  "status": "Awarded",
  "isAmended": false,
  "amendments": [],
  "pipelineStatus": "downloaded",
  "createdAt": {
    "$date": "2026-09-29T17:17:08.378Z"
  },
  "updatedAt": {
    "$date": "2026-09-29T17:17:08.861Z"
  },
  "__v": 0
}
```
