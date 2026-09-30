import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { TorInsight } from '#models/index.js';

const TEST_PROJECT_ID = 'test-insight-99999999999';

let isDbConnected = false;

before(async () => {
  try {
    const connPromise = connectDatabase();
    // 2-second timeout so offline unit test passes instantly if Mongo daemon is not running
    const timer = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000));
    await Promise.race([connPromise, timer]);
    isDbConnected = true;
    await TorInsight.deleteOne({ projectId: TEST_PROJECT_ID });
  } catch {
    // Mongo not running locally; unit tests will run and DB test will skip gracefully
  }
});

after(async () => {
  if (isDbConnected) {
    try {
      await TorInsight.deleteOne({ projectId: TEST_PROJECT_ID });
      await disconnectDatabase();
    } catch {
      // Ignore
    }
  }
});

test('TorInsight schema: validates document structure, types, and defaults offline', async () => {
  const doc = new TorInsight({
    projectId: '68039469567',
    identification: {
      titleTh: 'โครงการพัฒนาระบบบริหารจัดการข้อมูลภาครัฐ',
      agency: 'สำนักยุทธศาสตร์และประเมินผล',
      status: 'Open',
    },
    facts: {
      referencePriceTHB: 1850000,
    },
    evidence: {
      referencePriceTHB: { quote: 'ราคากลาง ๑,๘๕๐,๐๐๐ บาท', page: 3 },
    },
    technicalRequirements: {
      requiredTechnologies: [{ name: 'Kubernetes' }, { name: 'Windows Server', version: '2019' }],
    },
    analytics: {
      lockSpec: {
        riskScore: 45,
        findings: [
          {
            id: 'F1',
            title: 'Vendor Lock',
            requirementText: 'Must use specific hardware',
            severity: 'medium',
          },
        ],
      },
    },
  });

  const validationError = await doc.validate().catch((err) => err);
  assert.equal(validationError, undefined, 'Valid document should pass schema validation');

  assert.equal(doc.facts.referencePriceTHB, 1850000);
  assert.equal(doc.evidence.get('referencePriceTHB').page, 3);
  assert.equal(doc.technicalRequirements.requiredTechnologies[1].version, '2019');
  assert.equal(doc.technicalRequirements.requiredTechnologies[0].version, null);
  assert.equal(doc.amendmentInfo.isAmended, false);
  assert.equal(doc.analytics.lockSpec.findings[0].severity, 'medium');
  assert.equal(doc.metadata.reviewStatus, 'pending');
});

test('TorInsight schema: leaves unstated facts null instead of inventing a value', () => {
  const doc = new TorInsight({
    projectId: '68039469567',
    identification: { titleTh: 'โครงการ', agency: 'หน่วยงาน', status: 'Open' },
  });

  // A 0 or a guessed label would reach the page looking like a real fact (ADR 0014)
  assert.equal(doc.facts.budgetTHB, null);
  assert.equal(doc.facts.referencePriceTHB, null);
  assert.equal(doc.eligibility.previousExperienceMinTHB, null);
  assert.equal(doc.contractConditions.evaluationMethod, null);
  assert.equal(doc.identification.category, null);
  assert.equal(doc.metadata.confidenceScore, null);
  assert.equal(doc.metadata.excluded, null);
  assert.equal(doc.facts.medianPriceTHB, undefined, 'our own median lives in analytics, not facts');
});

test('TorInsight schema: rejects missing required fields (projectId, titleTh, agency, status)', async () => {
  const invalidDoc = new TorInsight({});
  const validationError = await invalidDoc.validate().catch((err) => err);

  assert.ok(validationError, 'Document without required fields must fail validation');
  assert.ok(validationError.errors.projectId, 'projectId is required');
  assert.ok(validationError.errors['identification.titleTh'], 'titleTh is required');
  assert.ok(validationError.errors['identification.agency'], 'agency is required');
  assert.ok(
    validationError.errors['identification.status'],
    'status is copied from the Tor, never defaulted to Open',
  );
});

test('TorInsight schema: accepts the minimal record saved for a non-IT document', async () => {
  const excluded = new TorInsight({
    projectId: '68039469567',
    identification: { titleTh: 'จ้างก่อสร้างถนนคอนกรีต', agency: 'หน่วยงาน', status: 'Open' },
    metadata: { excluded: { reason: 'Road construction, no software or IT scope', quote: 'ก่อสร้างถนน' } },
  });

  assert.equal(await excluded.validate().catch((err) => err), undefined);
  assert.equal(excluded.metadata.excluded.reason, 'Road construction, no software or IT scope');
});

test('TorInsight schema: keeps the confidence score on its 0–100 scale', async () => {
  const doc = new TorInsight({
    projectId: '68039469567',
    identification: { titleTh: 'โครงการ', agency: 'หน่วยงาน', status: 'Open' },
    metadata: { confidenceScore: 140 },
  });

  const validationError = await doc.validate().catch((err) => err);
  assert.ok(validationError?.errors['metadata.confidenceScore']);
});

test('TorInsight model: creates, validates, queries, and updates a complete normalized TOR document', async (t) => {
  if (!isDbConnected) {
    t.skip('Skipping live DB test because MongoDB is not currently reachable');
    return;
  }
  // 1. Create a full mock document matching docs/features/tor-detail-page.md
  const mockDoc = {
    projectId: TEST_PROJECT_ID,
    identification: {
      titleTh: 'โครงการพัฒนาระบบบริหารจัดการข้อมูลภาครัฐ',
      titleEn: 'Government Data Management Platform Development',
      agency: 'กรุงเทพมหานคร (Bangkok Metropolitan Administration)',
      department: 'สำนักยุทธศาสตร์และประเมินผล',
      egpReference: '68039469567',
      category: 'Software / IT',
      status: 'Open',
    },
    facts: {
      budgetTHB: 1900000,
      referencePriceTHB: 1850000,
      submissionDeadline: new Date('2026-08-18T16:30:00Z'),
      deliveryPeriodDays: 120,
      procurementMethod: 'e-Bidding',
      warrantyYears: 3,
      penaltyClause: '0.20% of contract value per day',
    },
    overview: {
      objective: 'เพื่อพัฒนาระบบศูนย์กลางข้อมูลเชื่อมโยงหน่วยงาน',
      majorComponents: ['Data Platform', 'Reporting System', 'API Gateway'],
      highLevelScope: 'พัฒนาระบบและติดตั้งระบบจัดการฐานข้อมูล',
    },
    deliverables: {
      system: ['Central Data Platform', 'Admin Portal'],
      implementation: ['System Installation', 'Data Migration'],
      validation: ['Acceptance Testing', 'Load Testing'],
      supportingWork: ['Training 50 users', '1-year Maintenance'],
    },
    technicalRequirements: {
      requiredTechnologies: [
        { name: 'Kubernetes' },
        { name: 'PostgreSQL', version: '16' },
        { name: 'Node.js' },
        { name: 'REST API' },
      ],
      requiredCapabilities: ['High Availability', 'Role-Based Access Control'],
      infrastructureSpecifications: [
        { key: 'CPU', spec: '≥ 24 cores' },
        { key: 'Memory', spec: '≥ 768 GB' },
      ],
      technicalConstraints: [
        { metric: 'Availability', value: '≥ 99.9%' },
        { metric: 'Response time', value: '≤ 2 seconds' },
      ],
    },
    integrationEnvironment: {
      existingSystems: ['Hospital Information System', 'Citizen Database'],
      interfacesAndApis: ['RESTful API', 'HL7 FHIR Gateway'],
      dataMigrationNotes: 'Migration of 500,000 legacy records',
      deploymentLocation: 'BMA Central Data Center',
    },
    operationalRequirements: {
      installationAndConfig: ['On-site installation at BMA City Hall'],
      training: ['Admin training (16 hours)', 'User training (8 hours)'],
      technicalSupportAndSla: 'Response within 4 hours, 24/7 hotline',
      maintenance: ['Quarterly preventive maintenance', 'Security patches'],
    },
    eligibility: {
      companyRequirements: ['จดทะเบียนพาณิชย์ในประเทศไทย', 'ขึ้นทะเบียนผู้ค้าภาครัฐ e-GP'],
      requiredCertifications: ['ISO/IEC 29110 หรือ CMMI Level 3'],
      manufacturerAuthorizations: ['Authorized PostgreSQL/Kubernetes Partner'],
      previousExperience: 'มีผลงานระบบสารสนเทศไม่น้อยกว่า 900,000 บาท',
      previousExperienceMinTHB: 900000,
      personnelQualifications: ['Project Manager (PMP certified)', 'System Architect'],
    },
    contractConditions: {
      paymentTerms: 'แบ่งจ่าย 4 งวดตามการส่งมอบงาน',
      deliveryConditions: 'ส่งมอบ ณ สำนักยุทธศาสตร์และประเมินผล',
      evaluationMethod: 'Price and Performance',
    },
    analytics: {
      lockSpec: {
        riskScore: 18,
        verdictText: 'Nothing here looks unusual — a first-time bidder has a real chance.',
        findings: [
          {
            id: 'F1',
            title: 'Past-work threshold',
            category: 'Past-work threshold',
            requirementText: 'ต้องมีผลงานพัฒนาเว็บไซต์ให้หน่วยงานภาครัฐ วงเงินไม่น้อยกว่า 900,000 บาท',
            normalBenchmark: 'Comparable projects usually ask for about ฿700,000.',
            sourceLocation: 'หน้า 7 · ข้อ 2.2.1',
            severity: 'low',
          },
        ],
      },
      priceAnalysis: {
        referencePriceTHB: 1850000,
        historicalMedianTHB: 1700000,
        diffPercentage: 8.8,
        interpretation: 'Within normal band for this kind of work.',
        comparableProjects: [
          { title: 'Health Department data portal', year: 2025, referencePriceTHB: 1620000 },
          { title: 'Main BMA website refresh', year: 2025, referencePriceTHB: 1780000 },
        ],
      },
    },
    amendmentInfo: {
      isAmended: false,
      amendmentSummary: '',
      changedSections: [],
    },
    evidence: {
      referencePriceTHB: { quote: 'ราคากลาง ๑,๘๕๐,๐๐๐ บาท', page: 3 },
      submissionDeadline: { quote: 'ยื่นข้อเสนอภายในวันที่ ๑๘ สิงหาคม ๒๕๖๙', page: 1 },
    },
    metadata: {
      modelName: 'gemini-3.7-flash',
      promptVersion: 'extract-v1',
      sourceFingerprint: 'a3f1c2',
      confidenceScore: 72,
      checks: [
        {
          check: 'cross-source',
          field: 'facts.budgetTHB',
          severity: 'critical',
          detail: { feed: 1850000, ai: 1900000 },
        },
      ],
    },
  };

  // 2. Insert / Save document
  const saved = await TorInsight.create(mockDoc);
  assert.ok(saved._id, 'Document should have a generated MongoDB _id');
  assert.equal(saved.projectId, TEST_PROJECT_ID);

  // 3. Query back from database
  const fetched = await TorInsight.findOne({ projectId: TEST_PROJECT_ID }).lean();
  assert.ok(fetched, 'Document should be retrievable by projectId');
  assert.equal(fetched.identification.titleTh, 'โครงการพัฒนาระบบบริหารจัดการข้อมูลภาครัฐ');
  assert.equal(fetched.facts.referencePriceTHB, 1850000);
  assert.equal(fetched.technicalRequirements.requiredTechnologies.length, 4);
  assert.equal(fetched.technicalRequirements.requiredTechnologies[1].version, '16');
  assert.equal(fetched.evidence.submissionDeadline.page, 1);
  assert.equal(fetched.metadata.checks[0].detail.feed, 1850000);
  assert.equal(fetched.metadata.reviewStatus, 'pending');
  assert.equal(fetched.analytics.lockSpec.riskScore, 18);
  assert.equal(fetched.analytics.priceAnalysis.comparableProjects.length, 2);

  // 4. Test Upsert update
  const updated = await TorInsight.findOneAndUpdate(
    { projectId: TEST_PROJECT_ID },
    {
      $set: {
        'analytics.lockSpec.riskScore': 25,
        'amendmentInfo.isAmended': true,
        'amendmentInfo.amendmentSummary': 'ขยายเวลากำหนดยื่นซอง 5 วัน',
      },
    },
    { new: true }
  ).lean();

  assert.equal(updated.analytics.lockSpec.riskScore, 25);
  assert.equal(updated.amendmentInfo.isAmended, true);
});
