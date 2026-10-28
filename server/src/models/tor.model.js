import mongoose from 'mongoose';

// Shape only. Pipeline writes live in pipeline/ (ADR 0003).
// Schema specification: docs/database/tor-schema.md

// A value read from a package's documents in code (ADR 0020, 0023), with
// the sentence it came from and the document that said it
const quoted = (valueType) =>
  new mongoose.Schema(
    {
      value: { type: valueType, required: true },
      quote: { type: String, required: true },
      document: { type: String, enum: ['announcement', 'bidding', 'price-form'], required: true },
    },
    { _id: false },
  );

// e-bidding takes bids on one day, between two times
const submissionWindowSchema = new mongoose.Schema(
  {
    opensAt: { type: Date, required: true },
    closesAt: { type: Date, required: true },
    quote: { type: String, required: true },
    document: { type: String, enum: ['announcement', 'bidding'], required: true },
  },
  { _id: false },
);

// One file kept from a package; e-GP's blank forms aren't kept
const packageFileSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['announcement', 'bidding', 'tor', 'price-form', 'other'], required: true },
    fileName: { type: String, required: true },
    storagePath: { type: String, required: true },
    sizeBytes: { type: Number, default: null },
    pages: { type: Number, default: null }, // null for a file that isn't a PDF
    contentHash: { type: String, default: null },
    // 'text' reads as it is; 'scan' and 'garbled' need OCR; null if not a PDF
    textLayer: { type: String, enum: ['text', 'scan', 'garbled'], default: null }, // validators skip null
  },
  { _id: false },
);

// One file of a TOR that comes in several
const torPartSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true },
    storagePath: { type: String, required: true },
    pages: { type: Number, default: null },
    contentHash: { type: String, default: null },
  },
  { _id: false },
);

// One e-GP document package. Each stage (draft, invitation, change) builds
// an announcement package; the price package (pricebuild_*.zip) holds the
// price form (ADR 0023).
const packageSchema = new mongoose.Schema(
  {
    // Records from before ADR 0023 have none: they are announcement packages
    kind: { type: String, enum: ['announcement', 'price'], default: 'announcement' },
    zipId: { type: String, required: true },
    name: { type: String, default: null }, // e.g. "69109028093_07102569.zip": the date it was built
    downloadedAt: { type: Date, default: null },
    files: { type: [packageFileSchema], default: [] },
    // The real text layers, read in code now and by extraction later
    announcementText: { type: String, default: '' },
    biddingText: { type: String, default: '' },
    // The price form's text, from OCR: the form is scanned
    priceFormText: { type: String, default: '' },
    facts: {
      agency: { type: quoted(String), default: null },
      budgetTHB: { type: quoted(Number), default: null }, // from the price form
      referencePriceTHB: { type: quoted(Number), default: null },
      submissionWindow: { type: submissionWindowSchema, default: null },
    },
    // Why a value the documents seem to state wasn't kept, e.g. digits and words disagree
    problems: { type: [String], default: [] },
  },
  { _id: false },
);

const torSchema = new mongoose.Schema(
  {
    // The 11-digit e-GP project ID (e.g. "68039469567"). Primary dedup key.
    projectId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    // Source identifier
    source: {
      type: String,
      required: true,
      enum: ['process3', 'datago', 'manual'],
    },

    // Raw procurement metadata from source API
    title: {
      type: String,
      required: true,
      trim: true,
    },
    agency: {
      type: String,
      default: '',
      trim: true,
    },
    subAgency: {
      type: String,
      default: '',
      trim: true,
    },
    province: {
      type: String,
      default: '',
      trim: true,
    },
    district: {
      type: String,
      default: '',
      trim: true,
    },
    // Two different figures in every TOR, and never interchangeable (ADR 0014).
    // null means the feed did not give one: a 0 would read as a real price.
    // งบประมาณ: what the agency has set aside for the project.
    budgetTHB: {
      type: Number,
      default: null,
    },
    // ราคากลาง: the official price the agency's committee worked out, which bids
    // are judged against. Not a statistical median, whatever "กลาง" suggests.
    referencePriceTHB: {
      type: Number,
      default: null,
    },
    // When bids close, from the latest package's documents (ADR 0020). The
    // window it closes is in packages[].facts.submissionWindow.
    submissionDeadline: {
      type: Date,
      default: null,
    },
    announceDate: {
      type: String,
      default: null,
    },
    procurementMethod: {
      type: String,
      default: '',
      trim: true,
    },
    // What the title says the contract is (ADR 0018): จ้าง (hire: a job),
    // ซื้อ (buy: supplying goods) or เช่า (rent). Null when the title says none.
    procurementKind: {
      type: String,
      enum: ['hire', 'buy', 'rent'], // validators skip null
      default: null,
    },
    egpUrl: {
      type: String,
      default: '',
      trim: true,
    },

    // The latest e-GP announcement code seen; the codes are in
    // pipeline/shared/announcement-codes.js (ADR 0017)
    announceType: {
      type: String,
      default: '',
      trim: true,
    },

    // Contract & award metadata (present in data.go.th)
    contract: {
      winnerName: { type: String, default: null },
      winnerTaxId: { type: String, default: null },
      contractNo: { type: String, default: null },
      contractSignDate: { type: String, default: null },
      contractEndDate: { type: String, default: null },
      agreedPriceTHB: { type: Number, default: null }, // ราคาตกลงซื้อ/จ้าง: the signed contract price
      projectStatus: { type: String, default: '' },
      // From data.go.th's FY2568 contracts (ADR 0028)
      amountTHB: { type: Number, default: null }, // งบสัญญา: the contract's own amount
      fiscalYear: { type: Number, default: null }, // ปีงบประมาณ, Buddhist era, e.g. 2568
      contractStatus: { type: String, default: '' }, // ระหว่างดำเนินการ or สิ้นสุดสัญญา
      // Every contract the project was awarded as: one, or several when it was
      // split between winners. The fields above are the first's, and
      // amountTHB is their total (ADR 0028).
      winners: {
        type: [
          {
            _id: false,
            name: { type: String, default: null },
            taxId: { type: String, default: null },
            contractNo: { type: String, default: null },
            signDate: { type: String, default: null },
            endDate: { type: String, default: null },
            amountTHB: { type: Number, default: null },
            contractStatus: { type: String, default: '' },
          },
        ],
        default: undefined,
      },
    },

    // The e-GP document packages downloaded, oldest first (ADR 0020). Older
    // ones stay, for amendment diffs (FR-16).
    packages: {
      type: [packageSchema],
      default: [],
    },
    // A past project (from data.go.th) chosen to be read in full, and when:
    // download and OCR take it although it isn't workable (ADR 0028)
    historyRequestedAt: {
      type: Date,
      default: null,
      index: true,
    },
    // The open TOR it was chosen as like, until read; null when chosen as
    // the newest. It counts toward that TOR's related projects (ADR 0028).
    historyRequestedFor: {
      type: String,
      default: null,
    },

    // Set by fetch when the feed announces a new stage of a project already
    // downloaded; download then checks e-GP for a new package (ADR 0020)
    packageCheckNeeded: {
      type: Boolean,
      default: false,
      index: true,
    },
    // When e-GP was last asked for the price package, found or not (ADR
    // 0023). Null: never asked, so download asks once; a new stage asks again.
    priceCheckedAt: {
      type: Date,
      default: null,
    },

    // The TOR: the latest package's, which OCR reads
    document: {
      fileName: { type: String, default: null },
      storagePath: { type: String, default: null },
      sizeBytes: { type: Number, default: null },
      pages: { type: Number, default: null },
      // 'DIGITAL_TEXT_PDF' | 'SCANNED_PAPER_PDF' | 'UNKNOWN'
      documentType: { type: String, default: 'UNKNOWN' },
      // Cryptographic SHA-256 fingerprint for amendment detection (FR10).
      // For a TOR in several files, a hash of their hashes.
      contentHash: { type: String, default: null, index: true },
      version: { type: Number, default: 1 },
      // A TOR an agency split over several files, in reading order; empty for
      // one file. OCR reads them as one document (ADR 0020).
      parts: { type: [torPartSchema], default: [] },
    },

    // OCR & text extraction results
    ocr: {
      rawText: { type: String, default: '' },
      confidence: { type: Number, default: 0 }, // 0.0 - 1.0
      usedOcr: { type: Boolean, default: false },
      // Part of the document never reached rawText (page limit, timeout, or
      // failed pages). Extraction treats it as a failed check (ADR 0013).
      truncated: { type: Boolean, default: false },
      // rawText holds only the first pages of a scan, read so classify can
      // decide whether the TOR is IT before paying for the rest (ADR 0018).
      // Extraction never extracts from a preview.
      preview: { type: Boolean, default: false },
      pagesRead: { type: Number, default: null },
      processedAt: { type: Date, default: null },
    },

    // Public lifecycle status (FR09: Draft, Open, Awarded, Closed, Cancelled)
    status: {
      type: String,
      enum: ['Draft', 'Open', 'Awarded', 'Closed', 'Cancelled'],
      default: 'Open',
      index: true,
    },

    // Amendment tracking & watchdog history (FR09, FR10, FR11)
    isAmended: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Each change to the TOR we know of, oldest first (ADR 0032): one the
    // agency announced (a D2), or a new package in the same stage the
    // platform found. A draft becoming an invitation is the next stage, not
    // a change.
    amendments: [
      {
        // 'feed': e-GP announced it; 'package': we found it, and say so
        source: { type: String, enum: ['feed', 'package'], default: 'package' },
        // The stage that changed, 'draft' or 'invitation', read from the
        // package; null when it couldn't be. The page words the change by it
        stage: { type: String, default: null },
        round: { type: String, default: '' }, // e.g. "ครั้งที่ 2"
        // The date the agency's notice or documents state. Null when neither
        // says: a found change is dated by previousCheckAt and detectedAt
        date: { type: Date, default: null },
        headline: { type: String, default: '' },
        // When we found it, and the last check before that found nothing new:
        // the change happened between the two
        detectedAt: { type: Date, default: null },
        previousCheckAt: { type: Date, default: null },
        // The package it came with and the one it replaced: both originals
        zipId: { type: String, default: null },
        previousZipId: { type: String, default: null },
        contentHash: { type: String, default: null }, // the new TOR file's
        // The summary version it replaced (TorInsightVersion, ADR 0031)
        insightVersion: { type: Number, default: null },
        // 'facts': the package's facts compared; 'complete': the summary too,
        // once extracted again; 'none': nothing to compare yet
        diff: { type: String, enum: ['none', 'facts', 'complete'], default: 'none' },
        // A rollback undid it (NFR-07): kept, not shown
        rolledBack: { type: Boolean, default: false },
        changes: [
          {
            kind: {
              type: String,
              enum: ['added', 'removed', 'changed'],
              default: 'changed',
            },
            field: { type: String, default: '' },
            before: { type: String, default: null },
            after: { type: String, default: null },
          },
        ],
      },
    ],
    // When the latest change was found: for sorting, and the watchlist's
    // "changed since you saved" (ADR 0032)
    lastChangeAt: {
      type: Date,
      default: null,
      index: true,
    },
    // The recheck's last look that found nothing new: a change found later
    // happened after it (ADR 0032)
    packagesCheckedAt: {
      type: Date,
      default: null,
    },

    // Chronological record of every e-GP announcement received for this project (FR-02).
    // Each entry is one RSS item, recorded once however many polls see it
    // (ADR 0016). The ingestion pipeline appends; nothing deletes.
    announcementHistory: [
      {
        code: { type: String, required: true }, // e.g. 'B0', 'D0', 'D1'
        type: { type: String, required: true }, // e.g. 'draft_tor', 'invitation', 'amendment'
        receivedAt: { type: Date, default: Date.now }, // when the pipeline ingested it
        publishedAt: { type: Date, default: null }, // pubDate from the RSS item
        sourceUrl: { type: String, default: '' }, // the RSS item's link
      },
    ],

    // Pipeline status: 'fetched' -> 'downloaded' -> 'ocr_preview' -> 'ocr_done'.
    // A digital PDF, or a scan short enough to read whole, skips ocr_preview;
    // a preview classified as not IT stays there (ADR 0018).
    pipelineStatus: {
      type: String,
      enum: ['fetched', 'downloaded', 'ocr_preview', 'ocr_done'],
      default: 'fetched',
      index: true,
    },
  },
  { timestamps: true },
);

export const Tor = mongoose.model('Tor', torSchema);
