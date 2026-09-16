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
      enum: ['process3', 'datago'],
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
    },

    // OCR & text extraction results
    ocr: {
      rawText: { type: String, default: '' },
      confidence: { type: Number, default: 0 }, // 0.0 - 1.0
      usedOcr: { type: Boolean, default: false },
      processedAt: { type: Date, default: null },
    },

    // IT-relevance classification result (FR04)
    classification: {
      isIT: { type: Boolean, default: null },
      matchedKeywords: [{ type: String }],
      method: { type: String, default: 'keyword' },
      classifiedAt: { type: Date, default: null },
    },

    // Pipeline status: 'fetched' -> 'downloaded' -> 'ocr_done' -> 'classified'
    pipelineStatus: {
      type: String,
      enum: ['fetched', 'downloaded', 'ocr_done', 'classified'],
      default: 'fetched',
      index: true,
    },
  },
  { timestamps: true },
);

export const Tor = mongoose.model('Tor', torSchema);
