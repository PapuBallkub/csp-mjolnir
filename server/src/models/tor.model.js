import mongoose from 'mongoose';

// Shape only. Pipeline writes live in pipeline/ (ADR 0003).
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
    budgetTHB: {
      type: Number,
      default: 0,
    },
    medianPriceTHB: {
      type: Number,
      default: 0,
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
    egpUrl: {
      type: String,
      default: '',
      trim: true,
    },

    // Announcement type from RSS (B0=Draft TOR, D0=Invitation, 15=Reference Price)
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
      agreedPriceTHB: { type: Number, default: 0 },
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

    // Pipeline status: 'fetched' -> 'downloaded' -> 'ocr_done'
    pipelineStatus: {
      type: String,
      enum: ['fetched', 'downloaded', 'ocr_done'],
      default: 'fetched',
      index: true,
    },
  },
  { timestamps: true },
);

export const Tor = mongoose.model('Tor', torSchema);
