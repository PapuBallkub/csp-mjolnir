import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { pickTorFiles, readAgency, readPackageFacts, roleOfEntry } from '#pipeline/ingestion/lib/egp-package.js';

// What pdf-parse gives for real e-GP documents (fetched 2026-10-08 to 10-11)
const fixture = (name) =>
  fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'egp-package', name), 'utf8');

const bangkok = (iso) => new Date(`${iso}+07:00`).toISOString();
const windowOf = (facts) =>
  facts.submissionWindow && {
    opens: facts.submissionWindow.opensAt.toISOString(),
    closes: facts.submissionWindow.closesAt.toISOString(),
    document: facts.submissionWindow.document,
  };

test('roleOfEntry tells the project files from the blank forms in every package', () => {
  const roles = {
    'annoudoc_1300400000_69109062251.pdf': 'announcement',
    'doc_1300400000_69109062251.pdf': 'bidding',
    'Attach_TOR_1.pdf': 'other',
    'PPC.29092569.pdf': 'other',
    'Attach_PUB_1.pdf': 'other',
    'TOR Smart Touchpoint.pdf': 'other',
    'Bid Bond.pdf': 'form',
    'Performance Bond.pdf': 'form',
    'Advance Payment Bond.pdf': 'form',
    'Retention Bond.pdf': 'form',
    'bidding noltice.pdf': 'form',
    'contract_24.pdf': 'form',
    'definition_1.pdf': 'form',
    'Document Part2.pdf': 'form',
    'Domestic material use plan.pdf': 'form',
    'performance.pdf': 'form',
    'quotation.pdf': 'form',
    'action_plan.xlsx': 'form',
    'price adjustment.pdf': 'form', // the same 14 scanned pages in 13 construction packages
    'tor_69099417591_777a6934-bb9d-4dce-aa57-14dcff06d97e.pdf': 'other',
    'folder/annoudoc_1_2.pdf': 'announcement', // a zip entry may sit in a folder
  };
  for (const [name, role] of Object.entries(roles)) assert.equal(roleOfEntry(name), role, name);
});

test('pickTorFiles finds the TOR by elimination, whatever the agency named it', () => {
  const file = (name, sizeBytes, textLayer = 'scan') => ({ name, sizeBytes, textLayer, role: roleOfEntry(name) });
  const names = (files) => pickTorFiles(files).map((picked) => picked.name);

  // e-GP's own TOR form, typed in, is the TOR in real text: it beats a scan
  assert.deepEqual(
    names([file('Attach_TOR_1.pdf', 2_000_000), file('tor_69099417591_777a6934-bb9d-4dce-aa57-14dcff06d97e.pdf', 180_000, 'text')]),
    ['tor_69099417591_777a6934-bb9d-4dce-aa57-14dcff06d97e.pdf'],
  );
  // A TOR split over files is all of them, in order: the main part is neither
  // the first nor the largest by rule (69099483134: part 1; 69109065679: part 2)
  assert.deepEqual(
    names([file('Attach_TOR_10.pdf', 5), file('Attach_TOR_2.pdf', 900), file('Attach_TOR_1.pdf', 300), file('Attach_PUB_1.pdf', 9_000)]),
    ['Attach_TOR_1.pdf', 'Attach_TOR_2.pdf', 'Attach_TOR_10.pdf'],
  );
  // No name says TOR: the largest remaining PDF, never the announcement or a form
  assert.deepEqual(
    names([
      file('annoudoc_2100200224_69099707621.pdf', 120_000, 'text'),
      file('doc_2100200224_69099707621.pdf', 190_000, 'text'),
      file('price adjustment.pdf', 9_000_000),
      file('PPC.29092569.pdf', 2_400_000),
    ]),
    ['PPC.29092569.pdf'],
  );
  // A construction price build-up or a payment form, however large, isn't the TOR (69099109813)
  assert.deepEqual(
    names([file('1570951_02.pdf', 612_000, 'text'), file('Image220926024742.pdf', 250_000), file('bill_payment.pdf', 496_000)]),
    ['Image220926024742.pdf'],
  );
  // "tor" inside another word isn't a TOR
  assert.deepEqual(names([file('monitor_spec.pdf', 10), file('ขอบเขตของงาน.pdf', 5)]), ['ขอบเขตของงาน.pdf']);
  // Only the announcement, the bidding document and forms: none left
  assert.deepEqual(names([file('annoudoc_1.pdf', 1), file('doc_1.pdf', 2), file('Bid Bond.pdf', 3)]), []);
  // A spreadsheet is never the TOR
  assert.deepEqual(names([file('BOQ.xlsx', 100)]), []);
});

test('an invitation states its agency, ราคากลาง and bid window', () => {
  const facts = readPackageFacts({
    announcementText: fixture('69109062251-announcement.txt'),
    biddingText: fixture('69109062251-bidding.txt'),
  });
  assert.equal(facts.agency.value, 'กรมการค้าภายใน');
  assert.equal(facts.agency.quote, 'ประกาศกรมการค้าภายใน');
  assert.equal(facts.referencePriceTHB.value, 1_290_420);
  assert.match(facts.referencePriceTHB.quote, /^๑,๒๙๐,๔๒๐\.๐๐ บาท \(หนึ่งล้าน/);
  assert.equal(facts.referencePriceTHB.document, 'announcement');
  // e-bidding takes bids on that day, 09:00 to 12:00; the bidding document says it plainly
  assert.deepEqual(windowOf(facts), {
    opens: bangkok('2026-10-19T09:00:00'),
    closes: bangkok('2026-10-19T12:00:00'),
    document: 'bidding',
  });
  assert.match(facts.submissionWindow.quote, /^๑๙ ตุลาคม ๒๕๖๙ ระหว่างเวลา ๐๙\.๐๐ น\. ถึง ๑๒\.๐๐ น\.$/);
  assert.deepEqual(facts.problems, []);
});

test("the announcement's bid window is read even with its values out of order", () => {
  // "ในวันที่ ๑๙ / ระหว่างเวลา น. ถึง น. … ตุลาคม ๒๕๖๙ ๐๙.๐๐ ๑๒.๐๐"
  for (const name of ['69109062251-announcement.txt', '69099683466-announcement.txt', '69099615682-announcement.txt']) {
    const facts = readPackageFacts({ announcementText: fixture(name) });
    assert.deepEqual(
      windowOf(facts),
      { opens: bangkok('2026-10-19T09:00:00'), closes: bangkok('2026-10-19T12:00:00'), document: 'announcement' },
      name,
    );
  }
  const prices = ['69099683466-announcement.txt', '69099615682-announcement.txt'].map(
    (name) => readPackageFacts({ announcementText: fixture(name) }).referencePriceTHB.value,
  );
  assert.deepEqual(prices, [4_916_650, 540_000]);
});

test('a draft states ราคากลาง but no bid window yet', () => {
  const facts = readPackageFacts({
    announcementText: fixture('69109028093-draft-announcement.txt'),
    biddingText: fixture('69109028093-draft-bidding.txt'),
  });
  assert.equal(facts.agency.value, 'สำนักงานคณะกรรมการป้องกันและปราบปรามการทุจริตแห่งชาติ');
  assert.equal(facts.referencePriceTHB.value, 3_274_200);
  // Blank in the draft; the document-availability date in item ๓ must not stand in
  assert.equal(facts.submissionWindow, null);
  assert.deepEqual(facts.problems, []);
});

test('documents that disagree on the bid window give none, and say why', () => {
  const announcementText = fixture('69109062251-announcement.txt').replace('ในวันที่ ๑๙', 'ในวันที่ ๒๐');
  const facts = readPackageFacts({ announcementText, biddingText: fixture('69109062251-bidding.txt') });
  assert.equal(facts.submissionWindow, null);
  assert.equal(facts.problems.length, 1);
  assert.match(facts.problems[0], /^Bid window:/);
});

test('ราคากลาง whose digits and words disagree is not kept', () => {
  const announcementText = fixture('69109062251-announcement.txt').replace('๑,๒๙๐,๔๒๐.๐๐', '๑,๒๙๕,๔๒๐.๐๐');
  const facts = readPackageFacts({ announcementText });
  assert.equal(facts.referencePriceTHB, null);
  assert.match(facts.problems[0], /^ราคากลาง: digits and words don't agree/);
});

test('an afternoon time is not mistaken for item ๓', () => {
  const announcementText = [
    'ประกาศกรมตัวอย่าง',
    'เรื่อง ประกวดราคาจ้างพัฒนาระบบ',
    '๒. ผู้ยื่นข้อเสนอต้องเสนอราคาทางระบบจัดซื้อจัดจ้างภาครัฐด้วยอิเล็กทรอนิกส์ในวันที่ ๓',
    'ระหว่างเวลา น. ถึง น. ซึ่งสามารถจัดเตรียมเอกสารข้อเสนอได้ตั้งแต่วันที่\tพฤศจิกายน ๒๕๖๙ ๑๓.๐๐ ๑๖.๓๐',
    '๓. ผู้สนใจสามารถดูรายละเอียด ได้ตั้งแต่วันที่ ๑ ตุลาคม ๒๕๖๙',
  ].join('\n');
  assert.deepEqual(windowOf(readPackageFacts({ announcementText })), {
    opens: bangkok('2026-11-03T13:00:00'),
    closes: bangkok('2026-11-03T16:30:00'),
    document: 'announcement',
  });
});

test("readAgency reads a draft's heading and a name that wraps", () => {
  const text = [
    'ร่าง',
    '(ร่าง) ประกาศสำนักงานคณะกรรมการกิจการกระจายเสียง กิจการโทรทัศน์',
    'และกิจการโทรคมนาคมแห่งชาติ',
    'เรื่อง ประกวดราคาจ้างออกแบบ',
  ].join('\n');
  assert.equal(
    readAgency(text).value,
    'สำนักงานคณะกรรมการกิจการกระจายเสียง กิจการโทรทัศน์ และกิจการโทรคมนาคมแห่งชาติ',
  );
  // No heading above "เรื่อง": nothing, not a guess
  assert.equal(readAgency('เรื่อง ประกวดราคา'), null);
  assert.equal(readAgency(''), null);
});

test('ราคากลาง is found when the layout splits the word, satang included', () => {
  // "ราคา … / กลางของงาน ในการประกวดราคาครั้งนี้ เป็นเงินทั้งสิ้น … ๑,๑๕๒,๓๗๒.๒๐ บาท (…บาทยี่สิบสตางค์)"
  const facts = readPackageFacts({ announcementText: fixture('69099157522-announcement.txt') });
  assert.equal(facts.referencePriceTHB.value, 1_152_372.2);
  assert.equal(facts.agency.value, 'เทศบาลนครลำปาง');
  // Bids on 20 Oct, in the afternoon
  assert.deepEqual(windowOf(facts), {
    opens: bangkok('2026-10-20T13:00:00'),
    closes: bangkok('2026-10-20T16:00:00'),
    document: 'announcement',
  });
});

test('an announcement that leaves ราคากลาง blank gives none, and no false alarm', () => {
  // 69099483134 was published with the amount left empty
  const announcementText = [
    'ราคากลางของงาน ในการ\tศรีสะเกษ ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding) จ้างก่อสร้าง',
    'ประกวดราคาครั้งนี้ เป็นเงินทั้งสิ้น บาท () จำนวน ๑ รายการ',
  ].join('\n');
  const facts = readPackageFacts({ announcementText });
  assert.equal(facts.referencePriceTHB, null);
  assert.deepEqual(facts.problems, []);
});
