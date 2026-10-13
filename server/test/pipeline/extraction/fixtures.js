// A complete, correct answer set for one short TOR: the feed record, the
// classify answer and the extract answer, shaped exactly as the schemas ask.
// Tests copy it and change one thing.

export const RAW_TEXT = [
  '=== Page 1 ===',
  'โครงการจ้างพัฒนาคลังข้อมูลสุขภาพดิจิทัล',
  'สำนักงานปลัดกระทรวงสาธารณสุข',
  '=== Page 3 ===',
  'จำนวนเงิน ๑๒,๕๐๐,๐๐๐ บาท (สิบสองล้านห้าแสนบาทถ้วน)',
  'ยื่นข้อเสนอภายในวันที่ ๑๘ สิงหาคม ๒๕๖๙ เวลา ๑๖.๓๐ น.',
  'ใช้ระบบฐานข้อมูล Postgres 16 และ Kubernetes',
  'ต้องได้รับการรับรอง ISO/IEC 27001',
  '=== Page 9 ===',
  'ให้แล้วเสร็จภายใน ๑๕๐ วัน',
].join('\n');

const evidence = (quote, page, value) => ({ quote, page, value });

export function fixture() {
  return {
    tor: {
      projectId: 'test-extract-99999999999',
      title: 'ประกวดราคาจ้างพัฒนาคลังข้อมูลสุขภาพดิจิทัล ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
      agency: 'สำนักงานปลัดกระทรวงสาธารณสุข',
      budgetTHB: 12_500_000,
      referencePriceTHB: 12_492_771,
      announceDate: null,
      procurementMethod: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
      status: 'Open',
      egpUrl: 'https://process3.gprocurement.go.th/egp2procmainWeb/jsp/procsearch.sch?project_id=99999999999',
      document: { contentHash: 'pdf-hash-1' },
      ocr: { rawText: RAW_TEXT, usedOcr: true, confidence: 0.92, truncated: false },
    },
    classification: {
      quote: 'โครงการจ้างพัฒนาคลังข้อมูลสุขภาพดิจิทัล',
      reason: 'เป็นการจ้างพัฒนาระบบซอฟต์แวร์',
      agency: 'สำนักงานปลัดกระทรวงสาธารณสุข',
      isIT: true,
      category: 'software-development',
    },
    extracted: {
      identification: {
        titleTh: evidence('โครงการจ้างพัฒนาคลังข้อมูลสุขภาพดิจิทัล', 1, 'โครงการจ้างพัฒนาคลังข้อมูลสุขภาพดิจิทัล'),
        agency: evidence('สำนักงานปลัดกระทรวงสาธารณสุข', 1, 'สำนักงานปลัดกระทรวงสาธารณสุข'),
        department: 'สำนักสุขภาพดิจิทัล',
      },
      facts: {
        budget: evidence('จำนวนเงิน ๑๒,๕๐๐,๐๐๐ บาท (สิบสองล้านห้าแสนบาทถ้วน)', 3, '๑๒,๕๐๐,๐๐๐'),
        referencePrice: null, // the draft TOR doesn't state it; the feed does
        submissionDeadline: evidence('ยื่นข้อเสนอภายในวันที่ ๑๘ สิงหาคม ๒๕๖๙ เวลา ๑๖.๓๐ น.', 3, {
          day: 18, month: 8, year: 2569, era: 'BE', hour: 16, minute: 30,
        }),
        commentDeadline: null, // an invitation: no comment period
        postedDate: null,
        deliveryPeriodDays: evidence('ให้แล้วเสร็จภายใน ๑๕๐ วัน', 9, 150),
        contractDurationDays: null,
        warrantyYears: null,
        procurementMethod: null,
        penaltyClause: null,
      },
      overview: {
        objective: 'พัฒนาคลังข้อมูลสุขภาพดิจิทัลระดับประเทศ',
        majorComponents: ['คลังข้อมูลการรับวัคซีน'],
        highLevelScope: 'พัฒนาระบบ ติดตั้ง และอบรม',
      },
      deliverables: { system: ['ระบบคลังข้อมูล'], implementation: [], validation: [], supportingWork: [] },
      technicalRequirements: {
        requiredTechnologies: [
          { quote: 'ใช้ระบบฐานข้อมูล Postgres 16 และ Kubernetes', name: 'Postgres', version: '16' },
          { quote: 'ใช้ระบบฐานข้อมูล Postgres 16 และ Kubernetes', name: 'Kubernetes', version: null },
          { quote: 'รองรับ Oracle Exadata', name: 'Oracle Exadata', version: null }, // not in the document
        ],
        requiredCapabilities: [],
        infrastructureSpecifications: [],
        technicalConstraints: [],
      },
      integrationEnvironment: { existingSystems: [], interfacesAndApis: [], dataMigrationNotes: null, deploymentLocation: null },
      operationalRequirements: { installationAndConfig: [], training: [], technicalSupportAndSla: null, maintenance: [] },
      eligibility: {
        standardConditions: ['juristic-person', 'egp-registered', 'juristic-person'],
        companyRequirements: ['ทุนจดทะเบียนไม่ต่ำกว่า ๑ ล้านบาท'],
        requiredCertifications: [{ quote: 'ต้องได้รับการรับรอง ISO/IEC 27001', name: 'ISO/IEC 27001' }],
        manufacturerAuthorizations: [],
        previousExperience: null,
        previousExperienceMin: null,
        personnelQualifications: [],
      },
      contractConditions: { paymentTerms: null, deliveryConditions: null, evaluationMethod: null },
    },
  };
}

export const RUN = {
  model: 'gemini-3.7-flash',
  promptVersion: 'extract-v3',
  fingerprint: 'fingerprint-1',
  now: new Date('2026-10-01T03:00:00Z'),
};
