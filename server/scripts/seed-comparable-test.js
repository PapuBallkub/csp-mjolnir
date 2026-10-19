/**
 * server/scripts/seed-comparable-test.js
 *
 * Seeds 5 realistic historical IT procurement projects into TorInsight
 * so findComparableProjects has matching candidates across:
 *   1. maintenance-and-support (~฿1.3M) -> matches 69109062251
 *   2. software-development (~฿4.9M)   -> matches 69099683466
 *   3. network-and-security (~฿89M)    -> matches 68039469567
 *
 * Usage:
 *   node scripts/seed-comparable-test.js
 *   docker compose run --rm server node scripts/seed-comparable-test.js
 */

import { pathToFileURL } from 'node:url';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { TorInsight } from '#models/index.js';

export const TEST_HISTORICAL_PROJECTS = [
  // ---------------------------------------------------------------------------
  // Category 1: maintenance-and-support (matches 69109062251 ~฿1,290,420)
  // ---------------------------------------------------------------------------
  {
    projectId: '68051000101',
    identification: {
      titleTh: 'จ้างบำรุงรักษาและซ่อมแซมแก้ไขระบบคอมพิวเตอร์แม่ข่าย (Server) และอุปกรณ์เครือข่าย',
      agency: 'กรมการค้าต่างประเทศ',
      category: 'maintenance-and-support',
      status: 'Awarded',
    },
    facts: {
      budgetTHB: 1450000,
      referencePriceTHB: 1450000,
      postedDate: new Date('2025-05-15'),
      procurementMethod: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
    },
    overview: {
      objective: 'เพื่อบำรุงรักษาเครื่องคอมพิวเตอร์แม่ข่ายและระบบเครือข่ายให้ทำงานได้อย่างต่อเนื่อง',
      majorComponents: [
        'บำรุงรักษาเชิงป้องกัน Server และคอมพิวเตอร์',
        'ซ่อมแซมแก้ไขอุปกรณ์คอมพิวเตอร์และสาย LAN',
        'การจัดการระบบป้องกันไวรัส',
      ],
      highLevelScope: 'บำรุงรักษาเครื่องแม่ข่ายและคอมพิวเตอร์สำนักงานตลอดระยะเวลา 12 เดือน',
      systemArchetype: 'infra-networking',
      complexityTier: 'standard',
    },
    technicalRequirements: {
      requiredTechnologies: [
        { name: 'Windows Server', version: '2022' },
        { name: 'Windows', version: '11' },
      ],
      requiredCapabilities: ['บำรุงรักษาแบบรวมศูนย์', 'ระบบป้องกันไวรัส'],
    },
    metadata: { origin: 'pipeline' },
  },
  {
    projectId: '67082000202',
    identification: {
      titleTh: 'จ้างเหมาบริการบำรุงรักษาเครื่องคอมพิวเตอร์และระบบเครือข่าย LAN ประจำปีงบประมาณ 2567',
      agency: 'สำนักงานปลัดกระทรวงพาณิชย์',
      category: 'maintenance-and-support',
      status: 'Awarded',
    },
    facts: {
      budgetTHB: 1150000,
      referencePriceTHB: 1150000,
      postedDate: new Date('2024-08-20'),
      procurementMethod: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
    },
    overview: {
      objective: 'จ้างเหมาบริการบำรุงรักษาเชิงป้องกันและแก้ไขระบบคอมพิวเตอร์',
      majorComponents: [
        'Preventive Maintenance คอมพิวเตอร์และ Server',
        'ดูแลระบบเครือข่าย LAN และอุปกรณ์ต่อพ่วง',
      ],
      systemArchetype: 'infra-networking',
      complexityTier: 'standard',
    },
    technicalRequirements: {
      requiredTechnologies: [
        { name: 'Windows Server', version: '2019' },
        { name: 'Windows', version: '10' },
      ],
    },
    metadata: { origin: 'pipeline' },
  },

  // ---------------------------------------------------------------------------
  // Category 2: software-development (matches 69099683466 ~฿4,916,650)
  // ---------------------------------------------------------------------------
  {
    projectId: '68043000303',
    identification: {
      titleTh: 'จ้างพัฒนาระบบบริการดิจิทัลและ AI Chatbot อัจฉริยะสำหรับบริการประชาชน',
      agency: 'กรมทรัพยากรน้ำ',
      category: 'software-development',
      status: 'Awarded',
    },
    facts: {
      budgetTHB: 5200000,
      referencePriceTHB: 5200000,
      postedDate: new Date('2025-04-10'),
      procurementMethod: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
    },
    overview: {
      objective: 'เพื่อพัฒนาระบบสารสนเทศบริการประชาชนและระบบแชทบอทอัจฉริยะ',
      majorComponents: [
        'ระบบบริการดิจิทัล Smart TouchPoint',
        'ระบบสนทนาอัตโนมัติ AI Chatbot',
        'ระบบเชื่อมต่อ API และฐานข้อมูล',
      ],
      highLevelScope: 'ออกแบบ พัฒนา และติดตั้งระบบสารสนเทศพร้อมระบบ AI Chatbot',
      systemArchetype: 'data-analytics',
      complexityTier: 'standard',
    },
    technicalRequirements: {
      requiredTechnologies: [
        { name: 'Oracle Database', version: null },
        { name: 'Windows Server', version: '2022' },
      ],
    },
    metadata: { origin: 'pipeline' },
  },
  {
    projectId: '67094000404',
    identification: {
      titleTh: 'โครงการพัฒนาเว็บพอร์ทัลและระบบบริการข้อมูลประชาชน (e-Service)',
      agency: 'กรมส่งเสริมคุณภาพสิ่งแวดล้อม',
      category: 'software-development',
      status: 'Awarded',
    },
    facts: {
      budgetTHB: 4350000,
      referencePriceTHB: 4350000,
      postedDate: new Date('2024-09-05'),
      procurementMethod: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
    },
    overview: {
      objective: 'พัฒนาระบบ e-Service และพอร์ทัลสารสนเทศเพื่อการบริการสาธารณะ',
      majorComponents: [
        'ระบบ e-Service และเว็บพอร์ทัล',
        'ระบบ Dashboard สารสนเทศ',
        'ระบบจัดการเนื้อหา CMS',
      ],
      systemArchetype: 'web-portal',
      complexityTier: 'standard',
    },
    technicalRequirements: {
      requiredTechnologies: [
        { name: 'Microsoft SQL Server', version: null },
      ],
    },
    metadata: { origin: 'pipeline' },
  },

  // ---------------------------------------------------------------------------
  // Category 3: network-and-security (matches 68039469567 ~฿89,845,000)
  // ---------------------------------------------------------------------------
  {
    projectId: '67035000505',
    identification: {
      titleTh: 'โครงการจัดหาและติดตั้งระบบเครือข่ายสื่อสารความเร็วสูงและ SD-WAN ประจำสำนักงานสาขา',
      agency: 'กรมศุลกากร',
      category: 'network-and-security',
      status: 'Awarded',
    },
    facts: {
      budgetTHB: 82500000,
      referencePriceTHB: 82500000,
      postedDate: new Date('2024-03-22'),
      procurementMethod: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
    },
    overview: {
      objective: 'จัดหาและติดตั้งอุปกรณ์เครือข่ายและระบบบริหารจัดการ SD-WAN',
      majorComponents: [
        'อุปกรณ์เชื่อมต่อเครือข่าย Router และ SD-WAN',
        'ระบบบริหารจัดการเครือข่าย SD-WAN Controller',
        'อุปกรณ์ Switch กระจายสัญญาณ',
      ],
      systemArchetype: 'infra-networking',
      complexityTier: 'enterprise',
    },
    technicalRequirements: {
      requiredTechnologies: [
        { name: 'IPSec', version: null },
        { name: 'BGP', version: null },
        { name: 'VMware vSphere ESXi', version: null },
      ],
    },
    metadata: { origin: 'pipeline' },
  },
];

async function main() {
  await connectDatabase();
  try {
    let upserted = 0;
    for (const project of TEST_HISTORICAL_PROJECTS) {
      await TorInsight.updateOne(
        { projectId: project.projectId },
        { $set: project },
        { upsert: true }
      );
      upserted += 1;
    }
    console.log(`✓ Successfully seeded ${upserted} historical benchmark projects into TorInsight.`);
  } finally {
    await disconnectDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`Failed to seed test projects: ${err.message}`);
    process.exit(1);
  });
}
