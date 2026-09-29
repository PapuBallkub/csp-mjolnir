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
    },
    facts: {
      referencePriceTHB: 1850000,
    },
    technicalRequirements: {
      requiredTechnologies: ['Kubernetes', 'PostgreSQL'],
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

  // Verify defaults
  assert.equal(doc.identification.category, 'Software / IT');
  assert.equal(doc.identification.status, 'Open');
  assert.equal(doc.amendmentInfo.isAmended, false);
  assert.equal(doc.facts.referencePriceTHB, 1850000);
  assert.deepEqual(doc.technicalRequirements.requiredTechnologies, ['Kubernetes', 'PostgreSQL']);
  assert.equal(doc.analytics.lockSpec.findings[0].severity, 'medium');
});

test('TorInsight schema: rejects missing required fields (projectId, titleTh, agency)', async () => {
  const invalidDoc = new TorInsight({});
  const validationError = await invalidDoc.validate().catch((err) => err);

  assert.ok(validationError, 'Document without required fields must fail validation');
  assert.ok(validationError.errors.projectId, 'projectId is required');
  assert.ok(validationError.errors['identification.titleTh'], 'titleTh is required');
  assert.ok(validationError.errors['identification.agency'], 'agency is required');
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
      referencePriceTHB: 1850000,
      medianPriceTHB: 1700000,
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
      requiredTechnologies: ['Kubernetes', 'PostgreSQL', 'Node.js', 'REST API'],
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
    metadata: {
      modelName: 'gemini-1.5-pro',
      confidenceScore: 0.94,
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
