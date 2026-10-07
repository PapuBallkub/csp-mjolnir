import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import axios from 'axios';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Tor } from '#models/index.js';
import { fetchFromDataGo } from '#pipeline/ingestion/sources/datago.js';

const TEST_DB = 'mjolnir_test';
const TEST_PROJECT_NORMAL = '77777000001';
const TEST_PROJECT_SHIFTED = '77777000002';
const TEST_PROJECT_OPEN = '77777000003';
const TEST_PROJECT_PAST_DOWNLOAD = '77777000004';
const TEST_PROJECTS = [TEST_PROJECT_NORMAL, TEST_PROJECT_SHIFTED, TEST_PROJECT_OPEN, TEST_PROJECT_PAST_DOWNLOAD];
const TEST_DOCS_DIR = './data/test_documents';

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
  await Tor.deleteMany({ projectId: { $in: TEST_PROJECTS } });
});

after(async () => {
  await Tor.deleteMany({ projectId: { $in: TEST_PROJECTS } });
  await disconnectDatabase();
});

test('fetchFromDataGo: correctly parses and upserts standard procurement record', async () => {
  mock.method(axios, 'get', async () => ({
    data: {
      success: true,
      result: {
        records: [
          {
            รหัสโครงการ: TEST_PROJECT_NORMAL,
            ชื่อโครงการ: 'โครงการจัดซื้อเครื่องคอมพิวเตอร์แม่ข่ายพร้อมติดตั้ง',
            ชื่อหน่วยงาน: 'สำนักงานสถิติแห่งชาติ',
            ชื่อหน่วยงานย่อย: 'กองเทคโนโลยีสารสนเทศ',
            จังหวัด: 'กรุงเทพมหานคร',
            'เขต/อำเภอ': 'หลักสี่',
            'วิธีจัดซื้อฯ': 'e-bidding',
            'กลุ่มวิธีจัดซื้อฯ': 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
            วันที่ประกาศ: '2026-09-15',
            'งบประมาณ(บาท)': '5,000,000',
            'ราคากลาง(บาท)': '4,850,000',
            'ราคาตกลงซื้อ/จ้าง': '4,800,000',
            พิกัดของโครงการ: '',
            ชื่อผู้ชนะ: 'บริษัท ดาต้า พลัส โซลูชั่นส์ จำกัด',
            เลขประจำตัวผู้เสียภาษีอากร: '0105558123456',
            'เลขที่สัญญา/ใบสั่งซื้อสั่งจ้าง': 'PO-68-0042',
            วันที่ลงนามในสัญญา: '2026-10-01',
            วันที่สิ้นสุดสัญญา: '2027-09-30',
            สถานะโครงการ: 'จัดทำสัญญาแล้ว',
          },
        ],
      },
    },
  }));

  const res = await fetchFromDataGo({
    query: 'คอมพิวเตอร์',
    limit: 1,
    documentsDir: TEST_DOCS_DIR,
    downloadAttachments: false,
  });

  assert.equal(res.fetched, 1);
  assert.equal(res.errors.length, 0);

  const doc = await Tor.findOne({ projectId: TEST_PROJECT_NORMAL }).lean();
  assert.ok(doc, 'Tor record should exist in MongoDB');
  assert.equal(doc.source, 'datago');
  assert.equal(doc.title, 'โครงการจัดซื้อเครื่องคอมพิวเตอร์แม่ข่ายพร้อมติดตั้ง');
  assert.equal(doc.agency, 'สำนักงานสถิติแห่งชาติ');
  assert.equal(doc.subAgency, 'กองเทคโนโลยีสารสนเทศ');
  assert.equal(doc.budgetTHB, 5_000_000);
  assert.equal(doc.referencePriceTHB, 4_850_000);
  assert.equal(doc.status, 'Awarded');
  assert.equal(doc.contract.winnerName, 'บริษัท ดาต้า พลัส โซลูชั่นส์ จำกัด');
  assert.equal(doc.contract.winnerTaxId, '0105558123456');
  assert.equal(doc.contract.contractNo, 'PO-68-0042');
  assert.equal(doc.contract.agreedPriceTHB, 4_800_000);
  assert.equal(doc.contract.projectStatus, 'จัดทำสัญญาแล้ว');
});

test('fetchFromDataGo: handles column-shift anomaly correctly', async () => {
  mock.method(axios, 'get', async () => ({
    data: {
      success: true,
      result: {
        records: [
          {
            รหัสโครงการ: TEST_PROJECT_SHIFTED,
            ชื่อโครงการ: 'โครงการจัดซื้อระบบเครือข่ายความปลอดภัยสูง',
            ชื่อหน่วยงาน: 'กรมสรรพากร',
            ชื่อหน่วยงานย่อย: 'ศูนย์คอมพิวเตอร์',
            จังหวัด: 'กรุงเทพมหานคร',
            'เขต/อำเภอ': 'พญาไท',
            วันที่ประกาศ: '2026-08-20',
            'งบประมาณ(บาท)': 89845000,
            'ราคากลาง(บาท)': 89845000,
            'ราคาตกลงซื้อ/จ้าง': 89765000,
            // Column shift anomaly: Tax ID shifted into coordinates column
            พิกัดของโครงการ: '0105533030645', // 13 digits triggers hasColumnShift
            ละติจูดโครงการ: 'บริษัท โปรเฟสชั่นนัล คอมพิวเตอร์ จำกัด', // Actual winnerName
            ลองจิจูดโครงการ: 'CN-115/2568', // Actual contractNo
            ชื่อผู้ชนะ: '2026-09-01', // Shifted sign date
            เลขคุมสัญญา: '2027-08-31', // Shifted end date
          },
        ],
      },
    },
  }));

  const res = await fetchFromDataGo({
    query: 'คอมพิวเตอร์',
    limit: 1,
    documentsDir: TEST_DOCS_DIR,
    downloadAttachments: false,
  });

  assert.equal(res.fetched, 1);
  const doc = await Tor.findOne({ projectId: TEST_PROJECT_SHIFTED }).lean();
  assert.ok(doc);
  assert.equal(doc.status, 'Awarded');
  // Winner and tax ID recovered from shifted columns
  assert.equal(doc.contract.winnerName, 'บริษัท โปรเฟสชั่นนัล คอมพิวเตอร์ จำกัด');
  assert.equal(doc.contract.winnerTaxId, '0105533030645');
  assert.equal(doc.contract.contractNo, 'CN-115/2568');
  assert.equal(doc.contract.contractSignDate, '2026-09-01');
  assert.equal(doc.contract.contractEndDate, '2027-08-31');
  assert.equal(doc.budgetTHB, 89845000);
});

test('fetchFromDataGo: sets Open status when record has no winner yet', async () => {
  mock.method(axios, 'get', async () => ({
    data: {
      success: true,
      result: {
        records: [
          {
            รหัสโครงการ: TEST_PROJECT_OPEN,
            ชื่อโครงการ: 'โครงการพัฒนาระบบคลังข้อมูลภาครัฐ',
            ชื่อหน่วยงาน: 'สำนักงานพัฒนารัฐบาลดิจิทัล',
            'งบประมาณ(บาท)': 15000000,
            'ราคากลาง(บาท)': 15000000,
            ชื่อผู้ชนะ: '',
            เลขประจำตัวผู้เสียภาษีอากร: '',
            พิกัดของโครงการ: '',
          },
        ],
      },
    },
  }));

  const res = await fetchFromDataGo({
    query: 'คอมพิวเตอร์',
    limit: 1,
    documentsDir: TEST_DOCS_DIR,
    downloadAttachments: false,
  });

  assert.equal(res.fetched, 1);
  const doc = await Tor.findOne({ projectId: TEST_PROJECT_OPEN }).lean();
  assert.ok(doc);
  assert.equal(doc.status, 'Open');
  assert.equal(doc.contract.winnerName, null);
  assert.equal(doc.contract.winnerTaxId, null);
});

test('fetchFromDataGo: gracefully handles API failures', async () => {
  mock.method(axios, 'get', async () => {
    throw new Error('Connection timeout to data.go.th');
  });

  const res = await fetchFromDataGo({
    query: 'คอมพิวเตอร์',
    limit: 1,
    documentsDir: TEST_DOCS_DIR,
    downloadAttachments: false,
  });

  assert.equal(res.fetched, 0);
  assert.equal(res.errors.length, 1);
  assert.match(res.errors[0], /data\.go\.th API request error/);
});

test('fetchFromDataGo: fetching a TOR again never undoes download or OCR', async () => {
  await Tor.create({
    projectId: TEST_PROJECT_PAST_DOWNLOAD,
    source: 'datago',
    title: 'โครงการจัดซื้อระบบสำรองข้อมูล',
    pipelineStatus: 'ocr_done',
    document: {
      fileName: `${TEST_PROJECT_PAST_DOWNLOAD}_TOR.pdf`,
      storagePath: `/data/documents/${TEST_PROJECT_PAST_DOWNLOAD}_TOR.pdf`,
      documentType: 'DIGITAL_TEXT_PDF',
      contentHash: 'b'.repeat(64),
      version: 2,
    },
    ocr: { rawText: 'ข้อความจากเอกสาร', processedAt: new Date() },
  });
  mock.method(axios, 'get', async () => ({
    data: {
      success: true,
      result: {
        records: [
          {
            รหัสโครงการ: TEST_PROJECT_PAST_DOWNLOAD,
            ชื่อโครงการ: 'โครงการจัดซื้อระบบสำรองข้อมูล',
            ชื่อหน่วยงาน: 'กรมทดสอบระบบ',
            'งบประมาณ(บาท)': '2,500,000',
          },
        ],
      },
    },
  }));

  await fetchFromDataGo({ query: 'คอมพิวเตอร์', limit: 1, documentsDir: TEST_DOCS_DIR });

  const doc = await Tor.findOne({ projectId: TEST_PROJECT_PAST_DOWNLOAD }).lean();
  assert.equal(doc.pipelineStatus, 'ocr_done');
  assert.equal(doc.document.contentHash, 'b'.repeat(64));
  assert.equal(doc.document.version, 2);
  assert.equal(doc.document.storagePath, `/data/documents/${TEST_PROJECT_PAST_DOWNLOAD}_TOR.pdf`);
  assert.equal(doc.ocr.rawText, 'ข้อความจากเอกสาร');
  assert.equal(doc.budgetTHB, 2_500_000); // fetch still updates what it owns
});
