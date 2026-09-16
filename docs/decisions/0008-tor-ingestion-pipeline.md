# 0008 · TOR ingestion pipeline, multi-source scrapers, and local OCR

Status: accepted · 2026-09-16

## Context

[US01] and [FR01–FR04] require the system to discover and ingest Thai government IT
procurement documents (TORs) from multiple public sources, extract their full text
(including OCR on scanned paper documents), filter for IT relevance, and store
the raw records for downstream analysis (FR05–FR13).

Government TOR documents present two distinct technical challenges:
1. **Source variability and encoding**: Announcements are distributed via e-GP RSS
   XML (`process3.gprocurement.go.th`) and Open Government Data CKAN REST API
   (`data.go.th`). Encoding can alternate between UTF-8 and legacy Windows-874, and
   attachments reside inside nested ZIP packages in e-GP backend services.
2. **Document format split**: A significant fraction of Thai government procurement
   specifications are printed, physically ink-signed, and scanned back into PDF
   files with no embedded digital text layer. The remaining files are digitally
   exported PDFs containing standard text streams.

Running cloud OCR APIs (Google Cloud Vision, AWS Textract) across dozens of daily
multi-page PDF documents incurs ongoing operational costs during development and
testing.

## Decision

1. **Pipeline layer lives in `server/src/pipeline/`**:
   Per [0003](0003-feature-based-server-layout.md), scrapers and ingestion jobs
   contain no Express routers. The public surface is exported from
   `src/pipeline/index.js`.
2. **Dedicated Mongoose model `Tor` in `src/models/`**:
   Indexed on `projectId` (11-digit e-GP ID) as the primary deduplication key.
   Records raw metadata, document storage paths, OCR text, and IT classification.
   `findOneAndUpdate` with `upsert: true` ensures idempotency across scrapers.
3. **Hybrid OCR architecture**:
   - **Fast path**: Ingested PDFs are first parsed with `pdf-parse`. Documents
     with `>= 50` characters of non-page-marker text are marked as
     `DIGITAL_TEXT_PDF` with `confidence: 1.0` and skip OCR entirely.
   - **Slow path**: Scanned documents (`< 50` chars) are rendered to PNG image
     buffers via `pdf-to-img` (v7, pure JS `pdfjs-dist`) and processed through
     `tesseract.js` (`tha+eng`) with a 20-page memory ceiling and 60-second
     timeout guards. Workers and document handles are freed in `finally` blocks.
4. **Adaptive IT-relevance classifier**:
   Keyword frequency matching against curated Thai and English IT procurement terms.
   Short texts (e.g. titles without attachments) require `>= 1` hit; full document
   bodies require `>= 2` hits to suppress false positives from incidental mentions.
5. **Standalone CLI orchestrator (`src/pipeline/ingest.js`)**:
   Runs as `node src/pipeline/ingest.js` or `npm run ingest`. Decouples cron / job
   scheduling from the long-running Express server process.

## Consequences

- **Zero API cost for text extraction**: Local WebAssembly Tesseract.js handles
  scanned Thai and English text without cloud billing credentials.
- **Node 22 compatibility**: Using `pdf-to-img@^7.0.0` eliminates native C++
  `node-canvas` compilation dependencies that fail on Node 22.
- **CPU & memory trade-offs**: Scanned OCR is CPU-intensive. Page caps (20 pages)
  and page timeouts (60s) keep ingestion runs bounded. Swapping to cloud OCR
  in production is isolated to `src/pipeline/lib/ocr.js`.
- **Scheduled runs live in deployment configuration**: Running the pipeline via
  CLI allows orchestration through system cron, GitHub Actions, or Cloud
  Scheduler without requiring an in-process daemon.
