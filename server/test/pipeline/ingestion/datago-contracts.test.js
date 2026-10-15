import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Tor } from '#models/index.js';
import { importStream, upsertPastContracts } from '#pipeline/ingestion/import-history.js';
import {
  checkRow,
  cleanContractNo,
  mergeContracts,
  isPubliclyAnnounced,
  looksIt,
  parseAmount,
  parseThaiShortDate,
  readCsv,
  readRow,
  titleWithoutMethod,
} from '#pipeline/ingestion/sources/datago-contracts.js';

const TEST_DB = 'mjolnir_test_datago_contracts';

// The file's own header: 31 names, its spacing as in most parts
const HEADER = [
  'ลำดับ', 'รหัสโครงการ', 'ชื่อโครงการ', 'ชื่อประเภทโครงการ', 'ชื่อหน่วยงาน', 'ชื่อหน่วยงานย่อย', 'วิธีจัดซื้อฯ',
  'กลุ่มวิธีจัดซื้อฯ', 'วันที่ประกาศ', 'งบประมาณ(บาท)', 'ราคากลาง(บาท)', 'ราคาตกลงซื้อ/จ้าง', 'ปีงบประมาณ', 'วันที่เกิดรายการ',
  'จังหวัด', 'จังหวัด (Eng)', 'เขต/อำเภอ', 'เขต/อำเภอ (Eng)', 'แขวง/ตำบล', 'แขวง/ตำบล (Eng)', 'สถานะโครงการ',
  'พิกัดของโครงการ', 'ละติจูดโครงการ', 'ลองจิจูดโครงการ', 'เลขนิติบุคคล', 'ชื่อผู้ชนะ', 'เลขที่สัญญา', 'วันที่ลงนามสัญญา',
  'วันที่สิ้นสุดสัญญา', 'งบสัญญา(บาท)', 'สถานะสัญญา',
];
const METHOD_NOTE = 'วิธีการจัดหา ประกาศเชิญชวนทั่วไป คัดเลือก เฉพาะเจาะจง';

/** A row as the file has it: 28 values, the last ones under the wrong headings. */
const row = ({ id, title, method = 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)', kind = 'ซื้อ', status = 'ระหว่างดำเนินการ', winner = 'บริษัท ตัวอย่าง จำกัด' }) => [
  '1190', id, title, kind, 'กรุงเทพมหานคร', 'สำนักยุทธศาสตร์', METHOD_NOTE, method, '28 เม.ย. 68', '96,469,000', '96469000',
  '95842000', '2568', '12 ก.ย. 68', 'กรุงเทพมหานคร', 'ดินแดง', 'ดินแดง', status, '', '', '',
  '0993000524276', winner, '12-12-2568', '12 ก.ย. 68', '10 พ.ค. 69', '95842000', 'ระหว่างดำเนินการ',
];
const DATA_CENTRE = row({
  id: '67099725090',
  title: 'ประกวดราคาซื้อโครงการขยายทรัพยากรพื้นฐานดิจิทัลสำหรับศูนย์ข้อมูลกรุงเทพมหานคร ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
  winner: '',
});
const ROAD_DIRECT = row({ id: '68039514868', title: 'จ้างก่อสร้างถนนลูกรัง หมู่ที่ 3', method: 'เฉพาะเจาะจง', kind: 'จ้าง' });
const ROAD_BIDDING = row({ id: '68039514869', title: 'ประกวดราคาจ้างก่อสร้างถนนคอนกรีต ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)', kind: 'จ้าง' });
const LICENCE = row({ id: '68099000001', title: 'การเช่าใช้บริการ Microsoft ๓๖๕ ด้วยวิธีคัดเลือก', method: 'คัดเลือก', kind: 'เช่า' });

const csv = (...rows) =>
  [HEADER, ...rows].map((values) => values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');

test('parseThaiShortDate: Buddhist-era short dates to ISO, and nothing else', () => {
  assert.equal(parseThaiShortDate('9 เม.ย. 68'), '2025-04-09');
  assert.equal(parseThaiShortDate('10 พ.ค. 69'), '2026-05-10');
  assert.equal(parseThaiShortDate('31 ธ.ค. 2567'), '2024-12-31');
  assert.equal(parseThaiShortDate('31 ก.พ. 68'), null, 'no such day');
  assert.equal(parseThaiShortDate('ระหว่างดำเนินการ'), null);
  assert.equal(parseThaiShortDate(''), null);
});

test('parseAmount and cleanContractNo: numbers, and none for placeholders', () => {
  assert.equal(parseAmount('96,469,000'), 96469000);
  assert.equal(parseAmount('237000'), 237000);
  assert.equal(parseAmount('0'), null);
  assert.equal(parseAmount(''), null);
  assert.equal(cleanContractNo('063/2568'), '063/2568');
  assert.equal(cleanContractNo('พ.190/2568'), 'พ.190/2568');
  for (const junk of ['-', '*', '', '��./2568']) assert.equal(cleanContractNo(junk), null, JSON.stringify(junk));
});

test('checkRow: 28 values with a status word at position 18', () => {
  assert.equal(checkRow(DATA_CENTRE), null);
  assert.match(checkRow([...DATA_CENTRE, '', '', '']), /31 values/);
  const shifted = [...DATA_CENTRE];
  shifted[17] = '100.53';
  assert.match(checkRow(shifted), /no status word at position 18/);
});

test('readRow: each value by its position, not its heading', () => {
  const read = readRow(DATA_CENTRE);
  assert.equal(read.projectId, '67099725090');
  assert.equal(read.kind, 'buy');
  assert.equal(read.method, 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)');
  assert.equal(read.announcedOn, '2025-04-28');
  assert.equal(read.budgetTHB, 96469000);
  assert.equal(read.agreedPriceTHB, 95842000);
  assert.equal(read.fiscalYear, 2568);
  assert.equal(read.district, 'ดินแดง', 'under จังหวัด (Eng)');
  assert.equal(read.projectStatus, 'ระหว่างดำเนินการ', 'under เขต/อำเภอ (Eng)');
  assert.equal(read.winnerTaxId, '0993000524276', 'under พิกัดของโครงการ');
  assert.equal(read.winnerName, null, 'blank in this row');
  assert.equal(read.contractNo, '12-12-2568', 'under ลองจิจูดโครงการ');
  assert.equal(read.signedOn, '2025-09-12', 'under เลขนิติบุคคล');
  assert.equal(read.endsOn, '2026-05-10', 'under ชื่อผู้ชนะ');
  assert.equal(read.contractAmountTHB, 95842000, 'under เลขที่สัญญา');
});

test('isPubliclyAnnounced and looksIt: the two filters before the title screen', () => {
  assert.equal(isPubliclyAnnounced('ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)'), true);
  assert.equal(isPubliclyAnnounced('คัดเลือก'), true);
  assert.equal(isPubliclyAnnounced('จ้างที่ปรึกษาโดยวิธีประกาศเชิญชวนทั่วไป'), true);
  assert.equal(isPubliclyAnnounced('เฉพาะเจาะจง'), false);
  assert.equal(isPubliclyAnnounced('จ้างที่ปรึกษาโดยวิธีเฉพาะเจาะจง'), false);
  assert.equal(isPubliclyAnnounced('ตลาดอิเล็กทรอนิกส์ (e-market)'), false);

  // The method's own words ("อิเล็กทรอนิกส์", "e-bidding") don't count
  assert.equal(titleWithoutMethod(ROAD_BIDDING[2]), 'ประกวดราคาจ้างก่อสร้างถนนคอนกรีต');
  assert.equal(looksIt(ROAD_BIDDING[2]), false);
  assert.equal(looksIt(DATA_CENTRE[2]), true);
  assert.equal(looksIt(LICENCE[2]), true, 'a product name');
  assert.equal(looksIt('จ้างพัฒนาระบบสารบรรณอิเล็กทรอนิกส์'), true);
  assert.equal(looksIt('ซื้อวัสดุสำนักงาน (air conditioner maintenance)'), false, '"ai" only as a word');
});

test('readCsv: refuses a header that is not the dataset\'s', async () => {
  await assert.rejects(readCsv(Readable.from('a,b,c\n1,2,3\n'), () => {}), /Unexpected header/);
});

test('readCsv: part 1\'s shorter header (26 names) has the same 28 values a row', async () => {
  // No district or English location headings, but the rows are the same
  const short = HEADER.filter((name) => !/\(Eng\)|^เขต\/อำเภอ$|^แขวง\/ตำบล$/.test(name));
  assert.equal(short.length, 26);
  const text = [short, DATA_CENTRE].map((values) => values.map((value) => `"${value}"`).join(',')).join('\n');
  const rows = [];
  await readCsv(Readable.from(text), (values) => rows.push(values));
  assert.equal(rows.length, 1);
  assert.equal(checkRow(rows[0]), null);
  assert.equal(readRow(rows[0]).contractNo, '12-12-2568');
});

test('importStream: counts each filter, and keeps publicly announced IT-looking rows', async () => {
  const written = [];
  const counts = await importStream(Readable.from(csv(DATA_CENTRE, ROAD_DIRECT, ROAD_BIDDING, LICENCE)), {
    write: async (rows) => {
      written.push(...rows);
      return { inserted: rows.length, updated: 0 };
    },
  });

  assert.deepEqual(
    { rows: counts.rows, public: counts.public, it: counts.it, inserted: counts.inserted },
    { rows: 4, public: 3, it: 2, inserted: 2 },
  );
  assert.deepEqual(written.map((r) => r.projectId), ['67099725090', '68099000001']);
});

test('importStream: a project awarded as several contracts is one project, its amounts added up', async () => {
  // One project split between two winners: the same project values, a contract each
  const lot = (winner, contractNo, amount) => {
    const values = row({ id: '67099358357', title: 'ประกวดราคาเช่าซื้อพร้อมบริการวิทยุสื่อสารระบบดิจิทัล', winner });
    values[23] = contractNo;
    values[26] = amount;
    return values;
  };
  const written = [];
  const counts = await importStream(Readable.from(csv(lot('บริษัท ก จำกัด', 'บ.27/2568', '218382045.9'), DATA_CENTRE, lot('บริษัท ข จำกัด', 'บ.28/2568', '460602900'))), {
    write: async (rows) => {
      written.push(...rows);
      return { inserted: rows.length, updated: 0 };
    },
  });

  assert.equal(counts.it, 3, 'three IT-looking rows');
  assert.equal(counts.projects, 2, 'two projects');
  const radio = written.find((project) => project.projectId === '67099358357');
  assert.equal(radio.winnerName, 'บริษัท ก จำกัด', 'the first contract stays the project\'s');
  assert.equal(radio.contractAmountTHB, 218382045.9 + 460602900);
  assert.deepEqual(radio.winners.map((w) => [w.name, w.contractNo]), [['บริษัท ก จำกัด', 'บ.27/2568'], ['บริษัท ข จำกัด', 'บ.28/2568']]);
});

test('importStream: a dry run writes nothing; --limit stops early', async () => {
  let writes = 0;
  const write = async (rows) => {
    writes += rows.length;
    return { inserted: rows.length, updated: 0 };
  };
  const dry = await importStream(Readable.from(csv(DATA_CENTRE, LICENCE)), { dryRun: true, write });
  assert.equal(dry.it, 2);
  assert.equal(writes, 0);

  const limited = await importStream(Readable.from(csv(DATA_CENTRE, LICENCE)), { limit: 1, write });
  assert.equal(limited.projects, 1, '--limit counts projects');
  assert.equal(writes, 1);
});

test('importStream: stops when too many rows fail the position check', async () => {
  const bad = [...DATA_CENTRE];
  bad[17] = '100.53';
  const rows = Array.from({ length: 1000 }, (_, i) => (i % 10 === 0 ? bad : DATA_CENTRE));
  await assert.rejects(importStream(Readable.from(csv(...rows)), { dryRun: true }), /layout changed/);
});

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
});

beforeEach(async () => {
  await Tor.deleteMany({});
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
});

test('upsertPastContracts: a new project is created Awarded, with its contract', async () => {
  const result = await upsertPastContracts([mergeContracts([readRow(DATA_CENTRE)])]);
  assert.deepEqual(result, { inserted: 1, updated: 0 });

  const tor = await Tor.findOne({ projectId: '67099725090' }).lean();
  assert.equal(tor.source, 'datago');
  assert.equal(tor.status, 'Awarded');
  assert.equal(tor.pipelineStatus, 'fetched');
  assert.equal(tor.procurementKind, 'buy');
  assert.equal(tor.announceDate, '2025-04-28');
  assert.equal(tor.district, 'ดินแดง');
  assert.equal(tor.contract.winnerTaxId, '0993000524276');
  assert.equal(tor.contract.contractSignDate, '2025-09-12');
  assert.equal(tor.contract.amountTHB, 95842000);
  assert.equal(tor.contract.fiscalYear, 2568);
  assert.equal(tor.contract.contractStatus, 'ระหว่างดำเนินการ');
  assert.deepEqual(tor.contract.winners.map((w) => [w.taxId, w.contractNo, w.amountTHB]), [['0993000524276', '12-12-2568', 95842000]]);
});

test('upsertPastContracts: a project we already have keeps its values and gains the contract', async () => {
  await Tor.create({
    projectId: '67099725090',
    source: 'process3',
    title: 'ชื่อจากประกาศ',
    agency: 'สำนักงานจากเอกสาร',
    budgetTHB: 90000000,
    status: 'Open',
    pipelineStatus: 'ocr_done',
    announcementHistory: [{ code: 'D0', type: 'invitation', publishedAt: new Date('2025-04-28') }],
  });

  const result = await upsertPastContracts([readRow(DATA_CENTRE)]);
  assert.deepEqual(result, { inserted: 0, updated: 1 });

  const tor = await Tor.findOne({ projectId: '67099725090' }).lean();
  assert.equal(tor.source, 'process3');
  assert.equal(tor.title, 'ชื่อจากประกาศ');
  assert.equal(tor.agency, 'สำนักงานจากเอกสาร');
  assert.equal(tor.budgetTHB, 90000000);
  assert.equal(tor.pipelineStatus, 'ocr_done');
  assert.equal(tor.status, 'Awarded', 'a signed contract');
  assert.equal(tor.contract.agreedPriceTHB, 95842000);
});
