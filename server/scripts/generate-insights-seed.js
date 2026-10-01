/**
 * server/scripts/generate-insights-seed.js
 *
 * Writes seed/torinsights.json: DEMO insights for building the UI, one per TOR
 * in seed/tors.json. Everything here is made up, including the lock-spec
 * findings and price comparisons, so every record is marked
 * `metadata.origin: 'demo'` and shown with a demo label. Real insights come from
 * `npm run extract`. Run after changing seed/tors.json:
 *
 *   node scripts/generate-insights-seed.js
 */

import fs from 'node:fs/promises';
import path from 'node:path';

// Load tors
const torsRaw = await fs.readFile(
  path.resolve(import.meta.dirname, '../seed/tors.json'),
  'utf8',
);
const tors = JSON.parse(torsRaw);

function buildInsight(tor, index) {
  const budget = tor.budgetTHB || tor.referencePriceTHB || 15000000;
  const refPrice = tor.referencePriceTHB || budget;
  const pId = tor.projectId;
  const title = tor.title;
  const agency = tor.agency;

  // Distribute risk levels across the 28 TORs so the teacher can see high, medium, and low risk examples
  const riskType = index % 3 === 0 ? 'high' : index % 3 === 1 ? 'medium' : 'low';

  let lockSpecRiskScore = 15;
  let lockSpecVerdict = 'ความเสี่ยงต่ำ: ข้อกำหนดเปิดกว้างตามมาตรฐานสากล';
  let findings = [];

  if (riskType === 'high') {
    lockSpecRiskScore = 78 + (index % 12);
    lockSpecVerdict = 'ความเสี่ยงสูง: พบเงื่อนไขที่อาจจำกัดการแข่งขันเฉพาะราย';
    findings = [
      {
        id: `FIND-${pId}-01`,
        title: 'กำหนดคุณสมบัติอุปกรณ์เฉพาะเจาะจงที่ตรงกับผู้ผลิตเพียงรายเดียว',
        category: 'Hardware Lock-in',
        requirementText: 'ต้องมีพอร์ตเชื่อมต่อความเร็ว 40 Gbps แบบเฉพาะตัว และรองรับสถาปัตยกรรมชิปประมวลผล ASIC ชนิดพิเศษตามที่กำหนด',
        normalBenchmark: 'มาตรฐานทั่วไปในตลาดรองรับมาตรฐานเปิด IEEE 802.3ba โดยไม่จำกัดโครงสร้าง ASIC ภายใน',
        sourceExcerpt: 'อุปกรณ์หลักต้องมีหน่วยประมวลผลพิเศษและสถาปัตยกรรมเฉพาะที่สอดคล้องกับระบบเดิมของหน่วยงาน',
        sourceLocation: 'เอกสาร TOR หน้า 14 · ข้อ 4.2.3',
        severity: 'high',
      },
      {
        id: `FIND-${pId}-02`,
        title: 'กำหนดหนังสือแต่งตั้งตัวแทนจำหน่าย (Manufacturer Authorization) จากผู้ผลิตต่างประเทศโดยตรง',
        category: 'Vendor Certification',
        requirementText: 'ต้องแนบหนังสือแต่งตั้งเป็นตัวแทนจำหน่ายระดับ Tier-1 หรือ Platinum Partner จากเจ้าของผลิตภัณฑ์โดยตรง',
        normalBenchmark: 'หนังสือรับรองแต่งตั้งจากสาขาในประเทศหรือตัวแทนจำหน่ายอย่างเป็นทางการตามปกติ',
        sourceExcerpt: 'ผู้ยื่นข้อเสนอต้องได้รับหนังสือแต่งตั้งเป็นตัวแทนจำหน่ายระดับสูงสุดจากเจ้าของผลิตภัณฑ์ต่างประเทศโดยตรง',
        sourceLocation: 'เอกสาร TOR หน้า 8 · ข้อ 2.5',
        severity: 'medium',
      },
    ];
  } else if (riskType === 'medium') {
    lockSpecRiskScore = 45 + (index % 10);
    lockSpecVerdict = 'ความเสี่ยงปานกลาง: มีเงื่อนไขด้านผลงานและบุคลากรที่ค่อนข้างสูงเมื่อเทียบกับมูลค่างาน';
    findings = [
      {
        id: `FIND-${pId}-01`,
        title: 'กำหนดมูลค่าผลงานขั้นต่ำสูงกว่าเกณฑ์ทั่วไป',
        category: 'Past Experience',
        requirementText: `ต้องมีผลงานประเภทเดียวกันกับหน่วยงานรัฐในสัญญาเดียวไม่น้อยกว่า 60% ของราคากลาง (${(budget * 0.6).toLocaleString()} บาท)`,
        normalBenchmark: 'เกณฑ์ปกติของกรมบัญชีกลางกำหนดมูลค่าผลงานประเภทเดียวกันไม่เกิน 50% ของวงเงินงบประมาณ',
        sourceExcerpt: 'ต้องมีผลงานการพัฒนาระบบหรือจัดซื้อที่แล้วเสร็จกับหน่วยงานภาครัฐในวงเงินไม่น้อยกว่าร้อยละ 60 ของราคากลาง',
        sourceLocation: 'เอกสาร TOR หน้า 6 · ข้อ 3.1',
        severity: 'medium',
      },
    ];
  } else {
    lockSpecRiskScore = 12 + (index % 8);
    lockSpecVerdict = 'ความเสี่ยงต่ำ: ข้อกำหนดโปร่งใส เป็นไปตามแนวทางมาตรฐานของสำนักงานพัฒนารัฐบาลดิจิทัล (สพร.)';
    findings = [];
  }

  // Price analysis
  const diffPercent = riskType === 'high' ? 18.5 : riskType === 'medium' ? -4.2 : 2.1;
  const histMedian = Math.round(refPrice / (1 + diffPercent / 100));

  const compProjects = [
    {
      title: `โครงการจัดซื้อ/พัฒนาระบบด้านเทคโนโลยีสารสนเทศใกล้เคียง ปีงบประมาณ 2567`,
      year: 2567,
      referencePriceTHB: Math.round(refPrice * 0.92),
    },
    {
      title: `โครงการจ้างพัฒนาระบบบริการดิจิทัลภาครัฐระดับกรม`,
      year: 2566,
      referencePriceTHB: Math.round(refPrice * 1.05),
    },
  ];

  // Specific technologies mapped per title keywords
  let techStack = [
    { name: 'Linux', version: null },
    { name: 'PostgreSQL', version: '15' },
    { name: 'Docker', version: null },
    { name: 'Node.js', version: '20' },
  ];

  if (title.includes('เครือข่าย') || title.includes('อุปกรณ์')) {
    techStack = [
      { name: 'Cisco IOS', version: '17.x' },
      { name: 'Fortinet FortiGate', version: null },
      { name: 'Linux', version: null },
    ];
  } else if (title.includes('ERP') || title.includes('บริหารทรัพยากร')) {
    techStack = [
      { name: 'Oracle Database', version: '19c' },
      { name: 'Java', version: '17' },
      { name: 'Spring Boot', version: '3.x' },
      { name: 'React', version: null },
    ];
  } else if (title.includes('สุขภาพ') || title.includes('โรงพยาบาล')) {
    techStack = [
      { name: 'PostgreSQL', version: '15' },
      { name: 'Redis', version: null },
      { name: 'Docker', version: null },
      { name: 'Kubernetes', version: null },
      { name: 'Next.js', version: null },
    ];
  } else if (title.includes('สารบรรณ') || title.includes('e-Sarabun')) {
    techStack = [
      { name: 'Node.js', version: '20' },
      { name: 'TypeScript', version: '5' },
      { name: 'PostgreSQL', version: null },
      { name: 'Redis', version: null },
      { name: 'NGINX Plus', version: null },
    ];
  }

  const isAmended = index % 4 === 1;

  return {
    projectId: pId,
    identification: {
      titleTh: title,
      titleEn: null,
      agency: agency,
      department: agency.includes('กรม') ? 'กองเทคโนโลยีสารสนเทศ' : 'สำนักบริการคอมพิวเตอร์',
      egpReference: `e-GP-${pId}`,
      category: 'Software & IT Services',
      status: 'Open',
    },
    facts: {
      budgetTHB: budget,
      referencePriceTHB: refPrice,
      submissionDeadline: new Date(Date.now() + (14 + (index % 10)) * 24 * 60 * 60 * 1000),
      deliveryPeriodDays: 180 + (index % 5) * 30,
      procurementMethod: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
      warrantyYears: 1 + (index % 3),
      contractDurationDays: 365,
      penaltyClause: 'ปรับร้อยละ 0.20 ของมูลค่าสัญญางานจ้างต่อวัน นับถัดจากวันครบกำหนดส่งมอบ',
      postedDate: new Date(Date.now() - (7 + (index % 14)) * 24 * 60 * 60 * 1000),
      sourceUrl: `https://process3.gprocurement.go.th/egpext/servlet/SP0102?projectId=${pId}`,
      webUrl: `https://process3.gprocurement.go.th/egp2procmain/bidDirect.do?projectId=${pId}`,
    },
    evidence: {
      referencePriceTHB: {
        quote: `กำหนดราคากลางในการจัดจ้างครั้งนี้เป็นจำนวนเงินทั้งสิ้น ${refPrice.toLocaleString()} บาท (รวมภาษีมูลค่าเพิ่ม)`,
        page: 2,
      },
      penaltyClause: {
        quote: 'หากผู้รับจ้างไม่สามารถส่งมอบงานให้แล้วเสร็จภายในเวลาที่กำหนด ผู้ว่าจ้างจะปรับเป็นรายวันในอัตราร้อยละ 0.20 ของราคาค่าจ้างตามสัญญา',
        page: 9,
      },
      warrantyYears: {
        quote: 'ผู้รับจ้างต้องรับประกันความชำรุดบกพร่องของระบบงานและอุปกรณ์เป็นเวลาไม่น้อยกว่า 1 ปี นับแต่วันที่ผ่านการตรวจรับ',
        page: 11,
      },
    },
    overview: {
      objective: `เพื่อพัฒนาและยกระดับประสิทธิภาพการปฏิบัติงานด้านดิจิทัลของ ${agency} ให้มีความทันสมัย รวดเร็ว ปลอดภัย และเชื่อมโยงข้อมูลภาครัฐตามมาตรฐานสถาปัตยกรรมรัฐบาลดิจิทัล`,
      majorComponents: [
        'ระบบแกนหลัก (Core Functional System) และการประมวลผลข้อมูล',
        'ระบบรักษาความมั่นคงปลอดภัยตามมาตรฐาน ISO/IEC 27001 และ พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA)',
        'ระบบรายงานและแดชบอร์ดสำหรับผู้บริหาร (Executive Dashboard & Analytics)',
        'บริการเชื่อมต่อผ่าน Web Services / RESTful API ตามมาตรฐาน Open API',
      ],
      highLevelScope: `ขอบเขตงานครอบคลุมการออกแบบ พัฒนา ติดตั้ง ทดสอบ ถ่ายทอดองค์ความรู้ และบำรุงรักษาเชิงป้องกันสำหรับ ${agency}`,
    },
    deliverables: {
      system: [
        'ระบบซอฟต์แวร์ต้นฉบับ (Source Code) พร้อมเอกสาร System Architecture และ API Specification',
        'รายงานผลการทดสอบระบบ (UAT Test Results & Vulnerability Assessment Report)',
        'คู่มือการใช้งานสำหรับผู้ดูแลระบบ (Admin Manual) และคู่มือสำหรับผู้ใช้งานทั่วไป (User Manual)',
      ],
      implementation: [
        'แผนการบริหารโครงการและแผนการทดสอบระบบ (Project Plan & Test Plan)',
        'การติดตั้งระบบบนสภาพแวดล้อมจริง (Production Environment Setup)',
        'การย้ายข้อมูล (Data Migration) จากระบบงานเดิมเข้าสู่ระบบใหม่โดยไม่มีข้อมูลสูญหาย',
      ],
      validation: [
        'ผลการตรวจรับการติดตั้งและทดสอบฟังก์ชันการทำงานครบถ้วนตามขอบเขตงาน',
        'รายงานผลการทดสอบความมั่นคงปลอดภัยและการเจาะระบบ (Penetration Test Report)',
      ],
      supportingWork: [
        'การจัดฝึกอบรมเชิงปฏิบัติการให้แก่เจ้าหน้าที่และผู้ดูแลระบบไม่น้อยกว่า 2 รุ่น รวม 30 คน',
        'การสนับสนุนทางเทคนิคและการแก้ไขข้อบกพร่อง (Bug Fixes & Maintenance) ตลอดระยะเวลารับประกัน',
      ],
    },
    technicalRequirements: {
      requiredTechnologies: techStack,
      requiredCapabilities: [
        'รองรับการทำงานผ่านเว็บเบราว์เซอร์มาตรฐานสากล (Chrome, Firefox, Edge, Safari) แบบ Responsive Design',
        'รองรับการยืนยันตัวตนและการเข้าถึงระบบ (Single Sign-On: SSO) และการยืนยันตัวตนแบบหลายปัจจัย (MFA)',
        'รองรับปริมาณผู้เข้าใช้งานพร้อมกัน (Concurrent Users) ไม่น้อยกว่า 500 ผู้ใช้งาน',
      ],
      infrastructureSpecifications: [
        { key: 'ความพร้อมใช้งาน (Availability)', spec: '≥ 99.9% Uptime ตลอด 24x7 ชั่วโมง' },
        { key: 'เวลาในการตอบสนอง (Response Time)', spec: 'ไม่เกิน 2 วินาที สำหรับการประมวลผลธุรกรรมปกติ' },
        { key: 'การสำรองข้อมูล (Backup & Recovery)', spec: 'RPO ≤ 1 ชั่วโมง, RTO ≤ 4 ชั่วโมง' },
      ],
      technicalConstraints: [
        { metric: 'Data Encryption', value: 'AES-256 for data-at-rest, TLS 1.3 for data-in-transit' },
        { metric: 'Standard Compliance', value: 'สอดคล้องตามมาตรฐานความมั่นคงปลอดภัยสารสนเทศภาครัฐ (DGA)' },
      ],
    },
    integrationEnvironment: {
      existingSystems: [
        `ระบบยืนยันตัวตนกลางของ ${agency} (Active Directory / LDAP)`,
        'ระบบสารบรรณอิเล็กทรอนิกส์และหนังสือเวียนภาครัฐ',
      ],
      interfacesAndApis: [
        'RESTful API (JSON/HTTPS) พร้อมการพิสูจน์สิทธิ์ด้วย OAuth 2.0 / JWT',
        'Webhook สำหรับส่งสัญญาณแจ้งเตือนเหตุการณ์สำคัญแบบ Real-time',
      ],
      dataMigrationNotes: 'ผู้รับจ้างต้องดำเนินการตรวจสอบความสมบูรณ์และแปลงโครงสร้างข้อมูลประวัติย้อนหลังอย่างน้อย 3 ปี',
      deploymentLocation: `ศูนย์ข้อมูล (Data Center) ของ ${agency} หรือบนคลาวด์ภาครัฐ (Government Cloud - GDCC)`,
    },
    operationalRequirements: {
      installationAndConfig: [
        'ติดตั้งระบบบนเครื่องแม่ข่ายและอุปกรณ์เครือข่ายตามมาตรฐานสากล',
        'กำหนดค่านโยบายความปลอดภัยและ Hardening ระบบปฏิบัติการและฐานข้อมูล',
      ],
      training: [
        'หลักสูตรผู้ดูแลระบบระบบ (System Administration & Operations) จำนวน 3 วันทำการ',
        'หลักสูตรผู้ใช้งานทั่วไป (End-User Operations) จำนวน 2 วันทำการ',
      ],
      technicalSupportAndSla: 'ให้บริการสนับสนุนทางเทคนิคตลอด 24 ชั่วโมงในกรณีวิกฤต (Critical Issue) โดยมีเวลาตอบสนอง (Response Time) ภายใน 1 ชั่วโมง และแก้ไขปัญหาภายใน 4 ชั่วโมง',
      maintenance: [
        'บริการบำรุงรักษาเชิงป้องกัน (Preventive Maintenance - PM) ทุก 3 เดือน',
        'บริการแก้ไขข้อบกพร่องของระบบงาน (Corrective Maintenance) ตลอดระยะเวลารับประกัน',
      ],
    },
    eligibility: {
      // The conditions every e-GP TOR repeats are keys (ADR 0014); only the
      // ones specific to this TOR stay as text
      standardConditions: ['juristic-person', 'not-blacklisted', 'egp-registered'],
      companyRequirements: ['มีทุนจดทะเบียนชำระแล้วไม่น้อยกว่า 5,000,000 บาท'],
      requiredCertifications: [
        'ได้รับการรับรองมาตรฐาน ISO/IEC 29110 หรือ CMMI ระดับ 3 ขึ้นไป หรือ ISO/IEC 27001',
      ],
      manufacturerAuthorizations: riskType === 'high' ? [
        'ต้องมีหนังสือรับรองแต่งตั้งการเป็นตัวแทนจำหน่ายระดับทางการจากเจ้าของผลิตภัณฑ์ซอฟต์แวร์หลัก',
      ] : [],
      previousExperience: `มีผลงานการพัฒนาระบบเทคโนโลยีสารสนเทศที่มีลักษณะคล้ายคลึงกันในสัญญาเดียว วงเงินไม่น้อยกว่า ${(budget * 0.4).toLocaleString()} บาท`,
      previousExperienceMinTHB: Math.round(budget * 0.4),
      personnelQualifications: [
        'ผู้จัดการโครงการ (Project Manager) มีวุฒิปริญญาตรีขึ้นไป และมีประสบการณ์บริหารโครงการไม่น้อยกว่า 5 ปี หรือมีใบรับรอง PMP / PRINCE2',
        'สถาปนิกซอฟต์แวร์ (Software Architect) มีประสบการณ์ออกแบบระบบไม่น้อยกว่า 5 ปี',
      ],
    },
    contractConditions: {
      paymentTerms: 'แบ่งจ่ายเงินค่าจ้างออกเป็น 4 งวด ตามผลการตรวจรับมอบงานในแต่ละระยะของแผนการดำเนินงาน',
      deliveryConditions: 'ส่งมอบงาน ณ ที่ทำการของหน่วยงาน พร้อมรายงานผลและเอกสารประกอบการตรวจรับครบถ้วน',
      evaluationMethod: 'เกณฑ์ราคา (Price Criterion) ควบคู่กับเกณฑ์ประสิทธิภาพ (Price Performance)',
    },
    analytics: {
      lockSpec: {
        riskScore: lockSpecRiskScore,
        verdictText: lockSpecVerdict,
        findings: findings,
      },
      priceAnalysis: {
        referencePriceTHB: refPrice,
        historicalMedianTHB: histMedian,
        diffPercentage: diffPercent,
        interpretation: diffPercent > 10
          ? `ราคากลางสูงกว่าค่ามัธยฐานในอดีตประมาณ ${diffPercent}% สำหรับโครงการขนาดใกล้เคียงกัน`
          : diffPercent < -10
          ? `ราคากลางต่ำกว่าค่ามัธยฐานในอดีตประมาณ ${Math.abs(diffPercent)}% โครงการอาจมีความท้าทายด้านงบประมาณ`
          : 'ราคากลางสอดคล้องกับค่าเฉลี่ยและมัธยฐานของโครงการในกลุ่มเทคโนโลยีเดียวกัน',
        comparableProjects: compProjects,
      },
    },
    amendmentInfo: {
      isAmended: isAmended,
      lastAmendedDate: isAmended ? new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) : null,
      amendmentSummary: isAmended
        ? 'ขยายเวลาส่งมอบงานงวดสุดท้ายเพิ่มขึ้น 30 วัน และปรับปรุงรายละเอียดคุณสมบัติของผู้จัดการโครงการ'
        : '',
      changedSections: isAmended ? ['ระยะเวลาการส่งมอบ', 'คุณสมบัติบุคลากร'] : [],
    },
    // Demo data, made up for building the UI: no model wrote it, nobody
    // reviewed it, and it has no score. `origin: 'demo'` keeps it labelled
    // wherever it's shown, and lets the real pipeline replace it (ADR 0014).
    metadata: {
      origin: 'demo',
      modelName: null,
      promptVersion: null,
      processedAt: new Date(),
      sourceFingerprint: null,
      confidenceScore: null,
      reviewStatus: 'pending',
      checks: [],
      excluded: null,
    },
  };
}

async function run() {
  const insights = tors.map((tor, idx) => buildInsight(tor, idx));
  await fs.writeFile(
    path.resolve(import.meta.dirname, '../seed/torinsights.json'),
    JSON.stringify(insights, null, 2),
    'utf8',
  );
  console.log(`Generated and saved ${insights.length} torinsights to seed/torinsights.json`);
}

run().catch(console.error);
