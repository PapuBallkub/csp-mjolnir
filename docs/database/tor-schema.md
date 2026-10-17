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
| `contractSignDate` | `String` | `null` | Date when the contract was signed. ISO from the data.go.th import ([0028](../decisions/0028-past-projects-from-data-go-th.md)); older records may hold the Thai short form | `"2025-09-12"` |
| `contractEndDate` | `String` | `null` | When the contract ends | `"2026-05-10"` |
| `agreedPriceTHB` | `Number` | `null` | Final agreed contract price (ราคาตกลงซื้อ/จ้าง) in Thai Baht (THB). `null` when the source doesn't give one. | `12300000` |
| `projectStatus` | `String` | `""` | The project's status in data.go.th: ระหว่างดำเนินการ (the contract's work is under way) or สิ้นสุดสัญญา. Records from the old reader held the title here; it was cleared. | `"ระหว่างดำเนินการ"` |
| `amountTHB` | `Number` | `null` | The contract's own amount (งบสัญญา), from data.go.th | `95842000` |
| `fiscalYear` | `Number` | `null` | Fiscal year, Buddhist era (ปีงบประมาณ) | `2568` |
| `contractStatus` | `String` | `""` | The contract's status in data.go.th: ระหว่างดำเนินการ or สิ้นสุดสัญญา | `"ระหว่างดำเนินการ"` |
| `winners` | `Array` | not set | Every contract the project was awarded as: `{ name, taxId, contractNo, signDate, endDate, amountTHB, contractStatus }`. One, or several when the project was split between winners; then the fields above are the first's, and `amountTHB` is the total. From the data.go.th import. | `[{ "name": "บริษัท ฟอร์ท คอร์ปอเรชั่น จำกัด (มหาชน)", "contractNo": "บ.28/2568", "amountTHB": 460602900, … }]` |

Any of a winner's name, a contract number or a price means a contract was signed, and the project is Awarded: data.go.th leaves the name blank on some signed contracts ([0028](../decisions/0028-past-projects-from-data-go-th.md)).

---

### 2.2 `document`
The TOR that OCR reads: the latest package's ([0020](../decisions/0020-read-the-whole-egp-package.md)). Records downloaded before 0020 point at `<projectId>_TOR.pdf`.

| Field | Type | Default | Indexed | Description | Real Example |
|---|---|---|---|---|---|
| `fileName` | `String` | `null` | No | The TOR's file name, as the package names it; its first part's when it has several | `"Attach_TOR_1.pdf"` |
| `storagePath` | `String` | `null` | No | Path to the TOR's (first) file | `"server/data/documents/69109062251/69109062251_07102569_1c4e4e1a/Attach_TOR_1.pdf"` |
| `sizeBytes` | `Number` | `null` | No | Size in bytes, all parts together | `9735994` (~9.7 MB) |
| `pages` | `Number` | `null` | No | Total page count, all parts together | `30` |
| `documentType` | `String` | `'UNKNOWN'` | No | `'DIGITAL_TEXT_PDF'` when every part has a Thai text layer, else `'SCANNED_PAPER_PDF'` (a garbled layer counts as a scan) | `"SCANNED_PAPER_PDF"` |
| `contentHash` | `String` | `null` | Yes | SHA-256 of the PDF; for a TOR in several files, of their hashes. A new value means a changed TOR. | `"47f6959e4b0bb5ba788836b2950093f5a6578958c8a6350cd22b63fddc1e6e2f"` |
| `version` | `Number` | `1` | No | Goes up each time a new package brings a changed TOR | `1` |
| `parts` | `Array` | `[]` | No | A TOR split over files (`Attach_TOR_1` … `_3`), in reading order: `{ fileName, storagePath, pages, contentHash }`. Empty for one file. OCR reads them as one document. | `[]` |

### 2.2a `packages` (Array, oldest first)
Each e-GP document package downloaded. Each stage (draft, invitation, change) builds an announcement package; the price package holds the price form. Older ones stay, for amendment diffs (FR-16). See [0020](../decisions/0020-read-the-whole-egp-package.md) and [0023](../decisions/0023-read-the-budget-from-the-price-form.md).

| Field | Type | Description | Real Example |
|---|---|---|---|
| `kind` | `String` | `announcement` (default, and every record before 0023) or `price` | `"price"` |
| `zipId` | `String` | e-GP's id for the package; the same id is never downloaded twice | `"91440371862845cc9281dc637dd73296"` |
| `name` | `String` | e-GP's name, which ends in the date it was built | `"69109028093_07102569.zip"` |
| `downloadedAt` | `Date` | When it was downloaded | |
| `files` | `Array` | The files kept: `{ role, fileName, storagePath, sizeBytes, pages, contentHash, textLayer }`. `role` is `announcement`, `bidding`, `tor`, `price-form` or `other`; `textLayer` is `text`, `scan`, `garbled`, or null for a non-PDF. e-GP's blank forms aren't kept. | |
| `announcementText` | `String` | The announcement's text layer | `"(สำเนา)\nประกาศกรมการค้าภายใน\n…"` |
| `biddingText` | `String` | The bidding document's text layer, which extraction reads ([0025](../decisions/0025-extraction-reads-the-bidding-document.md)) | |
| `priceFormText` | `String` | A price package's form, as OCR read it (or its text layer) | |
| `facts.agency` | `{ value, quote, document }` | From the announcement's heading | `{ "value": "กรมการค้าภายใน", "quote": "ประกาศกรมการค้าภายใน", "document": "announcement" }` |
| `facts.referencePriceTHB` | `{ value, quote, document }` | ราคากลาง, kept only when its digits and words agree. A price package's is a check on the announcement's. | `{ "value": 1290420, … }` |
| `facts.budgetTHB` | `{ value, quote, document }` | A price package's budget, from the amount in words, or from digits the form can vouch for | `{ "value": 1194600, "document": "price-form", … }` |
| `facts.submissionWindow` | `{ opensAt, closesAt, quote, document }` | The day and times e-bidding takes bids; null in a draft | `{ "opensAt": "2026-10-19T02:00:00Z", "closesAt": "2026-10-19T05:00:00Z", … }` |
| `problems` | `[String]` | Why a value the documents seem to state wasn't kept | `[]` |

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
| `budgetTHB` | `Number` | No | `null` | Budget (งบประมาณ): what the agency has set aside, in Thai Baht (THB). From the feed, or for e-GP from the price form ([0023](../decisions/0023-read-the-budget-from-the-price-form.md)). `null` when neither gives one. | `12500000` |
| `referencePriceTHB` | `Number` | No | `null` | Reference price (ราคากลาง): the official price bids are judged against, in Thai Baht (THB). Not a statistical median. Was `medianPriceTHB` before [0014](../decisions/0014-price-names-and-insight-data-rules.md). | `12492771` |
| `submissionDeadline` | `Date` | No | `null` | When bids close, from the latest package that states it ([0020](../decisions/0020-read-the-whole-egp-package.md)). Extraction lets it win over the AI's, and the API shows it live. | `"2026-10-19T05:00:00.000Z"` |
| `announceDate` | `String` | No | `null` | Date of announcement as string from source | `"13 พ.ค. 68"` |
| `procurementMethod` | `String` | No | `""` | Procurement method name from upstream source | `"ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)"` |
| `procurementKind` | `String` | No | `null` | The contract's kind, read from the title: `hire` (จ้าง, a job), `buy` (ซื้อ, supplying goods), `rent` (เช่า) [0018](../decisions/0018-preview-ocr-before-classify.md) | `"hire"` |
| `egpUrl` | `String` | No | `""` | Direct link to e-GP search page for this project | `"https://process3.gprocurement.go.th/egp2procmainWeb/jsp/procsearch.sch?project_id=68049205582"` |
| `announceType` | `String` | No | `""` | The latest e-GP announcement code seen: `15` reference price, `B0` draft TOR, `D0` invitation, `D2` invitation changed, `D1` invitation cancelled, `W0`/`W2` winner announced/changed, `W1` winner cancelled ([0017](../decisions/0017-read-the-egp-feed-as-egp-defines-it.md)) | `"D0"` |
| `status` | `String` | Indexed | `'Open'` | Current procurement status (`'Draft'`, `'Open'`, `'Awarded'`, `'Closed'`, `'Cancelled'`) | `"Awarded"` |
| `isAmended` | `Boolean` | Indexed | `false` | Whether this TOR has been amended/revised | `false` |
| `packageCheckNeeded` | `Boolean` | Indexed | `false` | Set by fetch when the feed announces a new draft, invitation, change or price (`B0`, `D0`, `D2`, `15`) for a project already downloaded; download then asks e-GP for its current packages ([0020](../decisions/0020-read-the-whole-egp-package.md)) | `false` |
| `priceCheckedAt` | `Date` | No | `null` | When e-GP was last asked for the price package, found or not. Null: download asks once ([0023](../decisions/0023-read-the-budget-from-the-price-form.md)) | `"2026-10-11T12:05:00.000Z"` |
| `historyRequestedFor` | `String` | No | `null` | The open TOR's project ID a past project was chosen for, as related to it; null when chosen as the newest. While it isn't read, it counts toward that TOR's related projects ([0028](../decisions/0028-past-projects-from-data-go-th.md)). | `"69099353888"` |
| `historyRequestedAt` | `Date` | Indexed | `null` | When a past project (`source: 'datago'`) was chosen to be read in full. Download and OCR then take it although it's awarded ([0028](../decisions/0028-past-projects-from-data-go-th.md)). Null for every other project. | `"2026-10-15T15:00:00.000Z"` |
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
