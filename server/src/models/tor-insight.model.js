import mongoose from 'mongoose';

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
      titleTh: { type: String, required: true, trim: true },
      titleEn: { type: String, default: '', trim: true },
      agency: { type: String, required: true, trim: true, index: true },
      department: { type: String, default: '', trim: true },
      egpReference: { type: String, default: '', trim: true },
      category: { type: String, default: 'Software / IT', index: true },
      status: {
        type: String,
        enum: ['Draft', 'Open', 'Awarded', 'Closed', 'Cancelled'],
        default: 'Open',
        index: true,
      },
    },

    // 4.2 Key Procurement Facts
    facts: {
      referencePriceTHB: { type: Number, default: 0, index: true },
      medianPriceTHB: { type: Number, default: 0 },
      submissionDeadline: { type: Date, default: null },
      deliveryPeriodDays: { type: Number, default: null },
      procurementMethod: { type: String, default: '', trim: true },
      warrantyYears: { type: Number, default: null },
      contractDurationDays: { type: Number, default: null },
      penaltyClause: { type: String, default: '', trim: true }, // e.g. "0.20% of contract value per day"
      postedDate: { type: Date, default: null },
      sourceUrl: { type: String, default: '', trim: true },
    },

    // 4.3 Project Overview
    overview: {
      objective: { type: String, default: '', trim: true },
      majorComponents: [{ type: String, trim: true }],
      highLevelScope: { type: String, default: '', trim: true },
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
      requiredTechnologies: [{ type: String, trim: true, index: true }], // e.g. ["Kubernetes", "PostgreSQL"]
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
      dataMigrationNotes: { type: String, default: '', trim: true },
      deploymentLocation: { type: String, default: '', trim: true },
    },

    // 4.7 Implementation & Operational Requirements
    operationalRequirements: {
      installationAndConfig: [{ type: String, trim: true }],
      training: [{ type: String, trim: true }],
      technicalSupportAndSla: { type: String, default: '', trim: true },
      maintenance: [{ type: String, trim: true }],
    },

    // 4.8 Bid Eligibility & Qualifications
    eligibility: {
      companyRequirements: [{ type: String, trim: true }],
      requiredCertifications: [{ type: String, trim: true }],
      manufacturerAuthorizations: [{ type: String, trim: true }],
      previousExperience: { type: String, default: '', trim: true },
      previousExperienceMinTHB: { type: Number, default: 0 },
      personnelQualifications: [{ type: String, trim: true }],
    },

    // 4.9 Contract & Commercial Conditions
    contractConditions: {
      paymentTerms: { type: String, default: '', trim: true },
      deliveryConditions: { type: String, default: '', trim: true },
      evaluationMethod: { type: String, default: 'Price', trim: true },
    },

    // 4.10 - 4.12 Decision Support & Intelligence Analytics
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

    // Pipeline Extraction Metadata & Traceability
    metadata: {
      modelName: { type: String, default: '', trim: true },
      confidenceScore: { type: Number, default: 0 },
      processedAt: { type: Date, default: Date.now },
    },
  },
  { timestamps: true },
);

export const TorInsight = mongoose.model('TorInsight', torInsightSchema);
