# 0008 · TOR Ingestion Pipeline, Multi-Source Scrapers, and Local OCR

Status: accepted · 2026-09-16 (updated 2026-09-17)

## Context

[US01] and [FR01–FR04] require the system to discover and ingest Thai government IT
procurement documents (TORs) from multiple public sources, extract their full text
(including OCR on scanned paper documents), filter for IT relevance, and store
the raw records for downstream analysis (FR05–FR13).

Government TOR documents present several distinct technical challenges:
1. **Source variability and encoding**: Announcements are distributed via e-GP RSS
   XML (`process3.gprocurement.go.th`) and Open Government Data CKAN REST API
   (`data.go.th`). Encoding alternates between UTF-8 and legacy Windows-874, and
   attachments reside inside nested ZIP packages in e-GP backend services.
2. **Document format split**: A significant fraction of Thai government procurement
   specifications are printed, physically ink-signed, and scanned back into PDF
   files with no embedded digital text layer. The remaining files are digitally
   exported PDFs containing standard text streams.
3. **Structure variability & scanner noise**: Thai TORs vary substantially in structure
   (ranging from standard 5-section templates to 13+ section customized documents,
   such as `67109111284_TOR.pdf`). Scanned documents contain scanner line artifacts,
   borders, and dust, while containing vital short specifications (e.g. `๑ ชุด`,
   `24 Core`, `๑๒ เดือน`) that must not be corrupted or stripped.
4. **Pipeline modularity & cost**: Running cloud OCR APIs across multi-page PDFs
   incurs recurring costs. The pipeline must allow each stage (fetching, downloading,
   and OCR) to run independently for debugging, ad-hoc execution, and
   offline testing without forcing full end-to-end runs.

---

## Decision

### 1. Feature Layout & Separation of Concerns
Per [0003](0003-feature-based-server-layout.md), scrapers and ingestion jobs contain no
Express routes. All pipeline logic lives under `server/src/pipeline/`:
- `sources/`: Source-specific fetchers (`process3.js`, `datago.js`).
- `lib/`: Core helpers (`ocr.js`, `tor-downloader.js`).
- `ingest.js`: Standalone CLI orchestrator.
- `index.js`: Re-exports public interfaces for other server features.

### 2. Dedicated Mongoose Model `Tor` in `src/models/`
Indexed on `projectId` (11-digit e-GP ID) as the primary deduplication key. Tracks the
pipeline lifecycle via `pipelineStatus`:
- `'fetched'`: Metadata discovered from sources.
- `'downloaded'`: Official attachment resolved and stored on disk.
- `'ocr_done'`: Digital or scanned text extracted and cleaned.

`findOneAndUpdate` with `upsert: true` ensures idempotency across scrapers and reruns.

### 3. IT-Exclusive Scope & Lean Raw Schema
Because the scraper queries exclusively target Thai IT procurement announcements
(e.g., `"คอมพิวเตอร์"`, `"ซอฟต์แวร์"`, `"ระบบ"`), every ingested document is an IT project
by definition. Storing redundant flags (like `isIT: true` or recording arbitrary scraper CLI
keywords) in the raw database is eliminated. Detailed tech stack identification (e.g.,
`['Docker', 'PostgreSQL', 'React']`) and project scoping belong to the subsequent AI
Summary and Extraction stage (FR05).

### 4. Decoupled, Independent Pipeline Services
The pipeline is divided into three independently runnable services, orchestrated by
`src/pipeline/ingest.js`:
- **Service 1 (Fetch)**: Discovers project metadata and e-GP URLs from sources without
  requiring immediate file download (`--step fetch`).
- **Service 2 (Download)**: Resolves and downloads official TOR ZIP archives from e-GP
  backend services (`egp-approval-service`, `egp-doc-price-estimate-service`, `egp-upload-service`),
  extracts the primary PDF into `server/data/documents/`, and records document metadata
  (`--step download`). Supports single-project targeting via `--id <projectId>`.
- **Service 3 (OCR)**: Extracts and cleans text from downloaded PDFs (`--step ocr`).
  Supports single-project targeting via `--id <projectId>`.

Running with `--step all` (or no `--step` flag) chains Fetch ➔ Download ➔ OCR in sequence.

### 5. Hybrid OCR Architecture & Safe Noise Cleaning
- **Digital Fast Path**: Parses PDF buffers with `pdf-parse`. Documents with `>= 50`
  characters are recognized as `DIGITAL_TEXT_PDF` (`confidence: 1.0`) and bypass OCR.
- **Scanned Path**: Renders pages to images via `pdf-to-img` (v7, pure JS `pdfjs-dist`
  with JBIG2 WASM support) and processes them via `tesseract.js` (`tha+eng`) using
  `tessdata_fast` (chosen for optimal speed/accuracy trade-off: ~1.3 min for 30 pages at ~90%
  confidence).
- **Execution Ceilings**: Enforces a 30-page maximum limit (`MAX_OCR_PAGES = 30`) and a
  4-minute document safety ceiling (`DOCUMENT_TIMEOUT_MS = 240000`).
- **Safe Noise Cleaning (`cleanOcrText`)**:
  - Applies Unicode Form C (`NFC`) normalization to combine decomposed Thai vowels and tone marks.
  - Strips isolated page markers (e.g. `-- 1 of 12 --`).
  - Strips scanner dust and border lines containing purely punctuation symbols (`---`, `___`, `***`, `|||`).
  - Preserves short lines containing letters or numbers (e.g. `๑ ชุด`, `24 Core`, `1.1`).
  - Normalizes horizontal spacing and collapses excessive newlines (`\n{3,}` to `\n\n`).
  - Prepends `=== Page X ===` demarcations to each page in both digital and scanned paths.

### 6. Semantic Hierarchy Deferred to Downstream AI Summary
Rather than attempting rigid regex-based section splitting or visual table reconstruction in
the OCR stage, clean text and page boundaries (`=== Page X ===`) are handed off intact to
the downstream AI Summary module (FR05). This accommodates documents with varying section
counts (5 to 13+ sections) without fragile OCR-stage heuristics.

---

## Consequences

- **Zero cloud API costs**: Scanned and digital text extraction runs locally with WebAssembly
  Tesseract.js.
- **Resilient & debuggable**: Independent step execution allows developers to download or OCR
  individual problematic documents (`--id <projectId>`) without re-running scrapers.
- **Node 22 compatibility**: Uses `pdf-to-img@^7.0.0` with `@napi-rs/canvas` and wasm decoders,
  avoiding native C++ build failures.
- **Predictable execution time**: The 30-page cap and 4-minute ceiling prevent runaway OCR
  processes on unusually long scanned appendices.

---

## How to Test Every Service (Pipeline)

Every service in the pipeline can be tested independently or end-to-end. All commands are run
from the `server/` directory.

### 1. Unit Tests (Isolated, No Database Required)
Run automated unit tests covering Thai digit conversion, Windows-874 / UTF-8 decoding, and
OCR text cleaning / normalization:

```bash
# Run all pipeline unit tests
node --test test/pipeline/*.test.js
```

Expected output:
```text
✔ cleanOcrText normalizes Unicode to NFC
✔ cleanOcrText strips isolated page markers
✔ cleanOcrText preserves short Thai and English specifications
✔ cleanOcrText removes lines containing only scanner noise and punctuation
✔ cleanOcrText collapses horizontal spaces and excessive newlines
✔ cleanOcrText handles empty and non-string inputs safely
✔ convertThaiDigitsToArabic converts all Thai digits ๐-๙ to 0-9
✔ decodeThaiXml properly decodes UTF-8 Thai XML buffers
✔ decodeThaiXml handles Windows-874 byte sequences cleanly
ℹ tests 9, pass 9, fail 0
```

---

### 2. Service 1: Fetch Project Metadata
Discovers IT announcements from e-GP RSS or data.go.th CKAN and stores project records with
`pipelineStatus: 'fetched'` without downloading attachments:

```bash
# Fetch from all sources (default query: คอมพิวเตอร์, limit: 3 per source)
npm run ingest:fetch -- --limit 3

# Fetch targeting specific source and keyword
npm run ingest:fetch -- --source process3 --query "ซอฟต์แวร์" --limit 2
npm run ingest:fetch -- --source datago --query "ระบบสารสนเทศ" --limit 2
```

Expected behavior:
- Queries source APIs.
- Discovers matching project announcements.
- Inserts/updates documents in MongoDB with `pipelineStatus: 'fetched'`.
- Prints discovered counts and source notices.

---

### 3. Service 2: Download TOR PDF Packages
Resolves official procurement packages from e-GP backend services and downloads PDFs to
`server/data/documents/<projectId>_TOR.pdf`:

```bash
# Download attachments for all records currently in 'fetched' state
npm run ingest:download

# Download attachment for a specific project ID
npm run ingest:download -- --id 68039469567
```

Expected behavior:
- Queries e-GP approval and price estimate archive endpoints.
- Downloads and unpacks ZIP files, selecting the primary TOR / announcement PDF.
- Updates MongoDB record with `document.storagePath`, `document.sizeBytes`, `document.pages`,
  and transitions status to `'downloaded'`.

---

### 4. Service 3: Hybrid OCR & Text Extraction
Extracts text from downloaded PDFs using digital extraction (fast path) or Tesseract OCR (scanned path):

```bash
# Run OCR on all records currently in 'downloaded' state
npm run ingest:ocr

# Run OCR on a single specific project ID (e.g. digital PDF)
npm run ingest:ocr -- --id 67109111284

# Run OCR on a single specific project ID (e.g. scanned paper PDF)
npm run ingest:ocr -- --id 67059626749
```

Expected behavior:
- For digital PDFs: extracts text instantly via `pdf-parse`, prints `Digital Text PDF | Confidence: 100%`.
- For scanned PDFs: renders pages to images and runs Tesseract OCR (`tha+eng`), prints
  `Scanned Paper (OCR) | Pages: X | Confidence: ~90%`.
- Cleans text using `cleanOcrText` (NFC normalization, noise filtering).
- Adds `=== Page X ===` delimiters to each page.
- Updates MongoDB record with `ocr.rawText`, `ocr.confidence`, and transitions status to `'ocr_done'`.

---

### 5. Full End-to-End Pipeline
Executes Fetch ➔ Download ➔ OCR in a single orchestrated run:

```bash
# Run complete pipeline with custom query and limit
npm run ingest -- --query "คอมพิวเตอร์" --limit 2

# Run complete pipeline skipping OCR (fast metadata & download only)
npm run ingest -- --query "คอมพิวเตอร์" --limit 2 --skip-ocr
```

Expected behavior:
- Executes Service 1 (Fetch) ➔ Service 2 (Download) ➔ Service 3 (OCR).
- Prints a consolidated execution summary showing total records, digital vs. scanned
  counts, and status breakdown.

---

### 6. Offline / Direct Function Testing (Without Database)
To test OCR text extraction directly on any local PDF without connecting to MongoDB:

```bash
# Test extraction on a sample PDF file
node -e "
import { extractText } from './src/pipeline/index.js';
const res = await extractText('data/documents/67109111284_TOR.pdf');
console.log('Result:', { usedOcr: res.usedOcr, pages: res.pages, confidence: res.confidence });
console.log('Text preview:\n', res.text.slice(0, 300));
"
```
