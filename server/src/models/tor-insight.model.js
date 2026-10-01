import mongoose from 'mongoose';
import { STANDARD_CONDITION_KEYS } from './standard-conditions.js';

// Missing is null, never a plausible default: a field the TOR does not state
// must read as "not specified", not as ฿0 or "Open" (ADR 0014). Lists default
// to [] because an empty list already says "none found".

// Finding sub-schema for lock-spec risk evaluation
const findingSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    category: { type: String, default: '' },
    requirementText: { type: String, required: true },
    normalBenchmark: { type: String, default: '' },
    sourceExcerpt: { type: String, default: '' },
    sourceLocation: { type: String, default: '' }, // e.g. "หน้า 7 · ข้อ 2.2.1"
    severity: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium',
    },
  },
  { _id: false },
);

// Comparable project sub-schema for price reality check
const comparableProjectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    year: { type: Number, required: true },
    referencePriceTHB: { type: Number, required: true },
  },
  { _id: false },
);

// Where an extracted value came from, so a person can check it against the
// original TOR and the grounding check can find the quote in rawText.
const evidenceSchema = new mongoose.Schema(
  {
    quote: { type: String, required: true },
    page: { type: Number, default: null },
  },
  { _id: false },
);

// One technology as the TOR requires it. `name` is the canonical name from the
// technologies vocabulary; the version is kept apart because a required exact
// version is itself a lock-spec signal (ADR 0014).
const technologySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    version: { type: String, default: null, trim: true },
  },
  { _id: false },
);

// A check that failed, with enough detail for a reviewer to see why.
const checkSchema = new mongoose.Schema(
  {
    check: { type: String, required: true }, // grounding | cross-source | sanity | ocr-quality | truncation
    field: { type: String, default: null }, // e.g. "facts.referencePriceTHB"
    severity: { type: String, enum: ['critical', 'minor'], required: true },
    detail: { type: mongoose.Schema.Types.Mixed, default: null }, // e.g. { feed: 1850000, ai: 1580000 }
  },
  { _id: false },
);

// Why a document was classified as not IT, and the text that says so.
const exclusionSchema = new mongoose.Schema(
  {
    reason: { type: String, required: true },
    quote: { type: String, default: null },
  },
  { _id: false },
);

// Normalized TOR Detail and Intelligence Hub schema
// Conforms to docs/features/tor-detail-page.md, docs/database/tor-insight-schema.md & ADR 0010
const torInsightSchema = new mongoose.Schema(
  {
    // Primary Key — 11-digit e-GP project ID linking to raw Tor document
    projectId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    // 4.1 Project Identification
    identification: {
      titleTh: { type: String, required: true, trim: true }, // from the feed first
      titleEn: { type: String, default: null, trim: true }, // not extracted while output is Thai only
      agency: { type: String, required: true, trim: true, index: true }, // from the feed first
      department: { type: String, default: null, trim: true },
      egpReference: { type: String, default: null, trim: true },
      category: { type: String, default: null, index: true }, // set by the classify step
      // Copied from Tor.status, never extracted. Closed is worked out when the
      // data is read (Open and past the deadline), not stored (ADR 0013).
      status: {
        type: String,
        enum: ['Draft', 'Open', 'Awarded', 'Closed', 'Cancelled'],
        required: true,
        index: true,
      },
    },

    // 4.2 Key Procurement Facts: only what the TOR or the feed states. Our own
    // numbers (historical median, averages) live in analytics, never here.
    facts: {
      budgetTHB: { type: Number, default: null }, // งบประมาณ: feed first, AI fills gaps
      referencePriceTHB: { type: Number, default: null, index: true }, // ราคากลาง: feed first, AI fills gaps
      submissionDeadline: { type: Date, default: null },
      deliveryPeriodDays: { type: Number, default: null },
      procurementMethod: { type: String, default: null, trim: true },
      warrantyYears: { type: Number, default: null },
      contractDurationDays: { type: Number, default: null },
      penaltyClause: { type: String, default: null, trim: true }, // e.g. "0.20% of contract value per day"
      postedDate: { type: Date, default: null },
      sourceUrl: { type: String, default: null, trim: true }, // the feed's own link (Tor.egpUrl), for tracing
      webUrl: { type: String, default: null, trim: true }, // the e-GP page users open, built from projectId
    },

    // Quote and page for each extracted fact, keyed by field name inside
    // facts (e.g. "referencePriceTHB"). Values copied from the feed have none.
    evidence: {
      type: Map,
      of: evidenceSchema,
      default: () => new Map(),
    },

    // 4.3 Project Overview
    overview: {
      objective: { type: String, default: null, trim: true },
      majorComponents: [{ type: String, trim: true }],
      highLevelScope: { type: String, default: null, trim: true },
    },

    // 4.4 Contractor Deliverables
    deliverables: {
      system: [{ type: String, trim: true }],
      implementation: [{ type: String, trim: true }],
      validation: [{ type: String, trim: true }],
      supportingWork: [{ type: String, trim: true }],
    },

    // 4.5 Technical Requirements
    technicalRequirements: {
      requiredTechnologies: [technologySchema], // e.g. [{ name: "Windows Server", version: "2019" }]
      requiredCapabilities: [{ type: String, trim: true }],
      infrastructureSpecifications: [
        {
          key: { type: String, trim: true }, // e.g. "CPU", "Memory"
          spec: { type: String, trim: true }, // e.g. "≥ 24 cores"
        },
      ],
      technicalConstraints: [
        {
          metric: { type: String, trim: true }, // e.g. "Availability", "Response time"
          value: { type: String, trim: true }, // e.g. "≥ 99.9%"
        },
      ],
    },

    // 4.6 Integration & Existing Environment
    integrationEnvironment: {
      existingSystems: [{ type: String, trim: true }],
      interfacesAndApis: [{ type: String, trim: true }],
      dataMigrationNotes: { type: String, default: null, trim: true },
      deploymentLocation: { type: String, default: null, trim: true },
    },

    // 4.7 Implementation & Operational Requirements
    operationalRequirements: {
      installationAndConfig: [{ type: String, trim: true }],
      training: [{ type: String, trim: true }],
      technicalSupportAndSla: { type: String, default: null, trim: true },
      maintenance: [{ type: String, trim: true }],
    },

    // 4.8 Bid Eligibility & Qualifications
    eligibility: {
      // Which of the conditions every e-GP TOR repeats this one lists, as fixed
      // keys. Matched against the user's checklist; not shown on the TOR page.
      standardConditions: [{ type: String, enum: STANDARD_CONDITION_KEYS }],
      // Only the conditions specific to this project, shown on the page
      companyRequirements: [{ type: String, trim: true }],
      requiredCertifications: [{ type: String, trim: true }],
      manufacturerAuthorizations: [{ type: String, trim: true }],
      previousExperience: { type: String, default: null, trim: true },
      previousExperienceMinTHB: { type: Number, default: null },
      personnelQualifications: [{ type: String, trim: true }],
    },

    // 4.9 Contract & Commercial Conditions
    contractConditions: {
      paymentTerms: { type: String, default: null, trim: true },
      deliveryConditions: { type: String, default: null, trim: true },
      evaluationMethod: { type: String, default: null, trim: true },
    },

    // 4.10 - 4.12 Decision Support & Intelligence Analytics
    // Reshaped when price analysis (FR-19) and lock-spec (FR-20, FR-21) are built.
    analytics: {
      lockSpec: {
        riskScore: { type: Number, default: 0, min: 0, max: 100 },
        verdictText: { type: String, default: '', trim: true },
        findings: [findingSchema],
      },
      priceAnalysis: {
        referencePriceTHB: { type: Number, default: 0 },
        historicalMedianTHB: { type: Number, default: 0 },
        diffPercentage: { type: Number, default: 0 },
        interpretation: { type: String, default: '', trim: true },
        comparableProjects: [comparableProjectSchema],
      },
    },

    // 4.13 Status & Amendment Information
    amendmentInfo: {
      isAmended: { type: Boolean, default: false, index: true },
      lastAmendedDate: { type: Date, default: null },
      amendmentSummary: { type: String, default: '', trim: true },
      changedSections: [{ type: String, trim: true }],
    },

    // Pipeline Extraction Metadata & Traceability (ADR 0013)
    metadata: {
      modelName: { type: String, default: null, trim: true },
      promptVersion: { type: String, default: null, trim: true }, // e.g. "extract-v1"
      processedAt: { type: Date, default: Date.now },
      // Hash over [main PDF hash, ...amendment document hashes]: when it no longer
      // matches the Tor, the source changed and the insight is re-processed.
      sourceFingerprint: { type: String, default: null },
      // 0–100, worked out from the checks, never reported by the model. Under 80
      // the TOR is hidden from the public and waits for review (NFR-17).
      confidenceScore: { type: Number, default: null, min: 0, max: 100 },
      checks: [checkSchema], // failed checks only
      reviewStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
        index: true,
      },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      reviewedAt: { type: Date, default: null },
      // Set when the classify step finds the document is not IT. Extraction
      // stops there, so every section above stays empty (NFR-16).
      excluded: { type: exclusionSchema, default: null },
    },
  },
  { timestamps: true },
);

export const TorInsight = mongoose.model('TorInsight', torInsightSchema);
