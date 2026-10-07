import mongoose from 'mongoose';

// Shape only. Pipeline writes live in pipeline/ (ADR 0003).
// Schema specification: docs/database/tor-schema.md
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
    },

    // Downloaded PDF document details
    document: {
      fileName: { type: String, default: null },
      storagePath: { type: String, default: null },
      sizeBytes: { type: Number, default: null },
      pages: { type: Number, default: null },
      // 'DIGITAL_TEXT_PDF' | 'SCANNED_PAPER_PDF' | 'UNKNOWN'
      documentType: { type: String, default: 'UNKNOWN' },
      // Cryptographic SHA-256 fingerprint for amendment detection (FR10)
      contentHash: { type: String, default: null, index: true },
      version: { type: Number, default: 1 },
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
    amendments: [
      {
        round: { type: String, default: '' }, // e.g. "ครั้งที่ 2"
        date: { type: Date, default: Date.now },
        headline: { type: String, default: '' },
        contentHash: { type: String, default: null },
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
