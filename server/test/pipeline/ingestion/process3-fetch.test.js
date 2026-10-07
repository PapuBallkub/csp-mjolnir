import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, mock, test } from 'node:test';
import axios, { AxiosError } from 'axios';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Tor } from '#models/index.js';
import { fetchFromProcess3, isFeedClosed, parseItemDescription } from '#pipeline/ingestion/sources/process3.js';

const TEST_DB = 'mjolnir_test';
const TEST_PROJECT_1 = '88888000001';
const TEST_PROJECT_2 = '88888000002';
const TEST_PROJECT_SEEN_AGAIN = '88888000003';
const TEST_PROJECT_PAST_DOWNLOAD = '88888000004';
const TEST_PROJECT_WRONG_TYPE = '88888000005';
const TEST_PROJECT_FOLLOWED = '88888000006';
const TEST_PROJECT_NEVER_SEEN = '88888000007';
const TEST_PROJECT_NEW_A = '88888000008';
const TEST_PROJECT_NEW_B = '88888000009';
// The one IT invitation in the recorded feed (fixtures/egp-rss-D0-2026-10-07.xml)
const REAL_IT_PROJECT = '69109062251';
const TEST_PROJECTS = [
  TEST_PROJECT_1,
  TEST_PROJECT_2,
  TEST_PROJECT_SEEN_AGAIN,
  TEST_PROJECT_PAST_DOWNLOAD,
  TEST_PROJECT_WRONG_TYPE,
  TEST_PROJECT_FOLLOWED,
  TEST_PROJECT_NEVER_SEEN,
  TEST_PROJECT_NEW_A,
  TEST_PROJECT_NEW_B,
  REAL_IT_PROJECT,
];
const TEST_DOCS_DIR = './data/test_documents';

// The feed is open then: 18:00 Bangkok. Requests aren't paced in tests; the
// pacer has its own tests, and one test here checks every request goes through it.
const OPEN_HOURS = new Date('2026-10-07T11:00:00Z');
const noWait = async () => {};
const fetchP3 = (options = {}) =>
  fetchFromProcess3({ query: 'คอมพิวเตอร์', limit: 1, documentsDir: TEST_DOCS_DIR, now: OPEN_HOURS, pace: noWait, ...options });

const recordedFeed = () =>
  fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'egp-rss-D0-2026-10-07.xml'));

const TYPE_NAMES = {
  15: 'ประกาศราคากลาง',
  B0: 'ร่างเอกสารประกวดราคา (e-Bidding) และร่างเอกสารซื้อหรือจ้างด้วยวิธีสอบราคา',
  D0: 'ประกาศเชิญชวน',
  D2: 'เปลี่ยนแปลงประกาศเชิญชวน',
  D1: 'ยกเลิกประกาศเชิญชวน',
  W0: 'ประกาศรายชื่อผู้ชนะการเสนอราคา / ประกาศผู้ได้รับการคัดเลือก',
  W2: 'เปลี่ยนแปลงประกาศรายชื่อผู้ชนะการเสนอราคา',
  W1: 'ยกเลิกประกาศรายชื่อผู้ชนะการเสนอราคา / ประกาศผู้ได้รับการคัดเลือก',
};

/**
 * A feed response in e-GP's own format: the project id, method and type name
 * are in the description, and the link points at the announcement document.
 */
function buildRssXml(items) {
  const itemXml = items
    .map(
      (item) => `
    <item>
      <title>${item.title || ''}</title>
      <link>https://process5.gprocurement.go.th/egp-template-service/dwnt/view-pdf-file?templateId=${item.projectId}</link>
      <description>${item.projectId}, ${item.method || 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)'}, ${TYPE_NAMES[item.code]}</description>
      <pubDate>${item.pubDate || '2026-10-05'}</pubDate>
      <guid></guid>
    </item>`,
    )
    .join('\n');

  return Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>ประกาศจัดซื้อจัดจ้างภาครัฐ</title>
    ${itemXml}
  </channel>
</rss>`);
}

/** Answers each announcement type from `byCode`, and an empty feed otherwise. */
function feedAnswers(byCode) {
  return mock.method(axios, 'get', async (url) => {
    const code = new URL(url).searchParams.get('anounceType');
    return { data: buildRssXml((byCode[code] ?? []).map((item) => ({ code, ...item }))) };
  });
}

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
  await Tor.deleteMany({ projectId: { $in: TEST_PROJECTS } });
});

after(async () => {
  await Tor.deleteMany({ projectId: { $in: TEST_PROJECTS } });
  await disconnectDatabase();
});

/** A TOR that download and OCR have finished, as fetch finds it on a later poll. */
function createOcrDoneTor(projectId) {
  return Tor.create({
    projectId,
    source: 'process3',
    title: 'จ้างพัฒนาระบบคอมพิวเตอร์ที่อ่านแล้ว',
    pipelineStatus: 'ocr_done',
    document: {
      fileName: `${projectId}_TOR.pdf`,
      storagePath: `/data/documents/${projectId}_TOR.pdf`,
      sizeBytes: 1234,
      pages: 30,
      documentType: 'SCANNED_PAPER_PDF',
      contentHash: 'a'.repeat(64),
      version: 2,
    },
    ocr: { rawText: 'ข้อความจาก OCR', processedAt: new Date() },
  });
}

function assertUntouchedByFetch(doc) {
  assert.equal(doc.pipelineStatus, 'ocr_done');
  assert.equal(doc.document.contentHash, 'a'.repeat(64));
  assert.equal(doc.document.version, 2);
  assert.equal(doc.document.storagePath, `/data/documents/${doc.projectId}_TOR.pdf`);
  assert.equal(doc.document.documentType, 'SCANNED_PAPER_PDF');
  assert.equal(doc.ocr.rawText, 'ข้อความจาก OCR');
}

test('parseItemDescription: reads the project id, method and type the feed writes there', () => {
  assert.deepEqual(parseItemDescription('69099615682, ประกวดราคาอิเล็กทรอนิกส์ (e-bidding), ประกาศเชิญชวน'), {
    projectId: '69099615682',
    method: 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)',
    typeName: 'ประกาศเชิญชวน',
  });
  // Winner type names contain a slash, never a comma, but a comma must not split them either
  assert.equal(
    parseItemDescription('69079155972, คัดเลือก, ประกาศรายชื่อผู้ชนะการเสนอราคา / ประกาศผู้ได้รับการคัดเลือก').typeName,
    'ประกาศรายชื่อผู้ชนะการเสนอราคา / ประกาศผู้ได้รับการคัดเลือก',
  );
  // A procurement plan carries a plan id, not a project id
  assert.equal(parseItemDescription("P69100030274, ' ', แผนการจัดซื้อจัดจ้าง").projectId, null);
  assert.deepEqual(parseItemDescription(undefined), { projectId: null, method: null, typeName: null });
});

test('isFeedClosed: e-GP closes the feed 09:00–12:00 and 13:00–17:00 Bangkok time', () => {
  const at = (bangkok) => new Date(`2026-10-07T${bangkok}:00+07:00`);
  for (const time of ['08:59', '12:01', '12:59', '17:01', '23:30', '03:00']) assert.equal(isFeedClosed(at(time)), false, time);
  for (const time of ['09:00', '10:30', '12:00', '13:00', '16:59', '17:00']) assert.equal(isFeedClosed(at(time)), true, time);
});

test('fetchFromProcess3: a recorded e-GP response is read end to end', async () => {
  const pace = mock.fn(async () => {});
  const get = mock.method(axios, 'get', async (url) => {
    const code = new URL(url).searchParams.get('anounceType');
    return { data: code === 'D0' ? recordedFeed() : buildRssXml([]) };
  });

  const result = await fetchP3({ limit: 5, pace });

  // Only one of its 20 invitations mentions คอมพิวเตอร์
  assert.equal(result.fetched, 1);
  assert.deepEqual(result.errors, []);
  const doc = await Tor.findOne({ projectId: REAL_IT_PROJECT }).lean();
  assert.match(doc.title, /^ประกวดราคาจ้างบำรุงรักษาเครื่องคอมพิวเตอร์แม่ข่าย \(Server\)/);
  assert.equal(doc.procurementMethod, 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)');
  assert.equal(doc.announceType, 'D0');
  assert.equal(doc.status, 'Open');
  assert.match(doc.egpUrl, /view-pdf-file\?templateId=/);
  assert.equal(doc.announcementHistory[0].publishedAt.toISOString(), '2026-10-07T00:00:00.000Z');

  // Every request uses e-GP's spelling, and went through the pacer first (NFR-03)
  const urls = get.mock.calls.map((call) => new URL(call.arguments[0]));
  assert.ok(urls.every((url) => url.searchParams.has('anounceType') && !url.searchParams.has('announceType')));
  assert.deepEqual(pace.mock.calls.map((call) => call.arguments[0]), get.mock.calls.map((call) => call.arguments[0]));
});

test('fetchFromProcess3: B0 drafts, D0 opens, D2 amends, D1 cancels (FR-02)', async () => {
  const project = { projectId: TEST_PROJECT_1, title: 'จ้างพัฒนาระบบคอมพิวเตอร์และคลาวด์' };
  const statusAfter = async (code, item) => {
    feedAnswers({ [code]: [{ ...project, ...item }] });
    assert.equal((await fetchP3()).fetched, 1);
    return Tor.findOne({ projectId: TEST_PROJECT_1 }).lean();
  };

  const draft = await statusAfter('B0', { pubDate: '2026-10-01' });
  assert.deepEqual([draft.status, draft.isAmended], ['Draft', false]);

  const open = await statusAfter('D0', { pubDate: '2026-10-03' });
  assert.deepEqual([open.status, open.isAmended], ['Open', false]);

  const changed = await statusAfter('D2', { pubDate: '2026-10-05', title: '' });
  assert.deepEqual([changed.status, changed.isAmended], ['Open', true]);
  assert.equal(changed.title, project.title); // an empty title doesn't replace a known one

  const cancelled = await statusAfter('D1', { pubDate: '2026-10-06' });
  assert.deepEqual([cancelled.status, cancelled.isAmended], ['Cancelled', true]);
  assert.deepEqual(
    cancelled.announcementHistory.map((entry) => [entry.code, entry.type]),
    [['B0', 'draft_tor'], ['D0', 'invitation'], ['D2', 'amendment'], ['D1', 'invitation_cancelled']],
  );
});

test('fetchFromProcess3: a reference price (15) is recorded without changing the status', async () => {
  feedAnswers({ 15: [{ projectId: TEST_PROJECT_2, title: 'ประกาศราคากลางระบบจัดซื้อคอมพิวเตอร์' }] });

  assert.equal((await fetchP3()).fetched, 1);

  const doc = await Tor.findOne({ projectId: TEST_PROJECT_2 }).lean();
  assert.deepEqual([doc.announceType, doc.status, doc.isAmended], ['15', 'Open', false]);
  assert.equal(doc.announcementHistory[0].type, 'reference_price');
});

test('fetchFromProcess3: an RSS item seen on every poll is recorded once', async () => {
  feedAnswers({
    B0: [{ projectId: TEST_PROJECT_SEEN_AGAIN, title: 'จ้างพัฒนาระบบคอมพิวเตอร์ ระบบสารบรรณอิเล็กทรอนิกส์', pubDate: '2026-10-01' }],
  });

  for (let poll = 0; poll < 2; poll++) await fetchP3();

  const doc = await Tor.findOne({ projectId: TEST_PROJECT_SEEN_AGAIN }).lean();
  assert.equal(doc.announcementHistory.length, 1);
  assert.equal(doc.status, 'Draft');
});

test('fetchFromProcess3: fetching a TOR again never undoes download or OCR', async () => {
  await createOcrDoneTor(TEST_PROJECT_PAST_DOWNLOAD);
  feedAnswers({
    D0: [{ projectId: TEST_PROJECT_PAST_DOWNLOAD, title: 'จ้างพัฒนาระบบคอมพิวเตอร์ที่อ่านแล้ว', pubDate: '2026-10-03' }],
  });

  await fetchP3();

  const doc = await Tor.findOne({ projectId: TEST_PROJECT_PAST_DOWNLOAD }).lean();
  assertUntouchedByFetch(doc);
  // The new announcement itself is still recorded
  assert.equal(doc.announcementHistory.length, 1);
  assert.equal(doc.status, 'Open');
});

test('fetchFromProcess3: an item of a different type than asked for is reported, not saved', async () => {
  // What a misspelled parameter could look like: asked for winners, given invitations
  mock.method(axios, 'get', async (url) => {
    const code = new URL(url).searchParams.get('anounceType');
    const items = code === 'W0' ? [{ code: 'D0', projectId: TEST_PROJECT_WRONG_TYPE, title: 'จ้างซ่อมคอมพิวเตอร์' }] : [];
    return { data: buildRssXml(items) };
  });

  const result = await fetchP3();

  assert.equal(result.fetched, 0);
  assert.match(result.errors[0], /^RSS W0: got a "ประกาศเชิญชวน" item \(D0\); not saved$/);
  assert.equal(await Tor.findOne({ projectId: TEST_PROJECT_WRONG_TYPE }), null);
});

test('fetchFromProcess3: a feed that does not answer is reported, not replaced by old contracts', async () => {
  const get = mock.method(axios, 'get', async (url) => {
    if (url.includes('egpannouncerss.xml')) throw new AxiosError('timeout of 20000ms exceeded', 'ECONNABORTED');
    throw new Error(`fetch must not fall back to another source: ${url}`);
  });

  const result = await fetchP3();

  assert.equal(result.fetched, 0);
  assert.equal(result.unreachable, true);
  assert.equal(result.errors.length, get.mock.callCount());
  assert.match(result.errors[0], /timeout/);
  assert.ok(get.mock.calls.every((call) => call.arguments[0].includes('egpannouncerss.xml')));
});

test('fetchFromProcess3: a feed that answers with nothing new is not an outage', async () => {
  mock.method(axios, 'get', async (url) => {
    if (new URL(url).searchParams.get('anounceType') === '15') {
      throw new AxiosError('timeout of 20000ms exceeded', 'ECONNABORTED');
    }
    return { data: buildRssXml([]) };
  });

  const result = await fetchP3();

  assert.equal(result.fetched, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(result.unreachable, false);
});

test('fetchFromProcess3: during e-GP\'s closed hours nothing is requested', async () => {
  const get = mock.method(axios, 'get', async () => {
    throw new Error('no request may be sent while the feed is closed');
  });

  const result = await fetchP3({ now: new Date('2026-10-07T10:30:00+07:00') });

  assert.equal(get.mock.callCount(), 0);
  assert.deepEqual([result.fetched, result.closed, result.unreachable], [0, true, true]);
  assert.match(result.errors[0], /09:00–12:00 and 13:00–17:00/);
});

test('fetchFromProcess3: news about a followed project gets through whatever its title says', async () => {
  await Tor.create({
    projectId: TEST_PROJECT_FOLLOWED,
    source: 'process3',
    title: 'ประกวดราคาจ้างพัฒนาระบบคอมพิวเตอร์',
    announcementHistory: [{ code: 'D0', type: 'invitation', publishedAt: new Date('2026-09-20'), sourceUrl: 'u' }],
  });
  // A winner announcement whose title doesn't mention คอมพิวเตอร์
  feedAnswers({ W0: [{ projectId: TEST_PROJECT_FOLLOWED, title: 'ประกาศผู้ชนะการเสนอราคา จ้างพัฒนาระบบ', pubDate: '2026-10-07' }] });

  const result = await fetchP3();

  assert.deepEqual([result.discovered, result.updated], [0, 1]);
  const doc = await Tor.findOne({ projectId: TEST_PROJECT_FOLLOWED }).lean();
  assert.equal(doc.status, 'Awarded');
  assert.equal(doc.announceType, 'W0');
});

test('fetchFromProcess3: a cancellation or a winner never adds a project we did not follow', async () => {
  const unknown = { projectId: TEST_PROJECT_NEVER_SEEN, title: 'ประกวดราคาซื้อเครื่องคอมพิวเตอร์', pubDate: '2026-10-07' };
  feedAnswers({ D1: [unknown], W0: [unknown], W2: [unknown], W1: [unknown] });

  const result = await fetchP3({ limit: 5 });

  assert.equal(result.fetched, 0);
  assert.equal(await Tor.findOne({ projectId: TEST_PROJECT_NEVER_SEEN }), null);
});

test('fetchFromProcess3: an older item seen again does not turn the latest announcement back', async () => {
  const project = { projectId: TEST_PROJECT_1 };
  // TEST_PROJECT_1 ended the lifecycle test cancelled (D1, 6 Oct); its D0 of 3 Oct is still in the feed
  feedAnswers({ D0: [{ ...project, title: 'จ้างพัฒนาระบบคอมพิวเตอร์และคลาวด์', pubDate: '2026-10-03' }] });

  await fetchP3();

  const doc = await Tor.findOne({ projectId: TEST_PROJECT_1 }).lean();
  assert.deepEqual([doc.status, doc.announceType], ['Cancelled', 'D1']);
  assert.equal(doc.announcementHistory.length, 4);
});

test('fetchFromProcess3: the limit caps new projects, and never stops the later types', async () => {
  const get = feedAnswers({
    D0: [
      { projectId: TEST_PROJECT_NEW_A, title: 'จ้างพัฒนาระบบคอมพิวเตอร์ ก', pubDate: '2026-10-07' },
      { projectId: TEST_PROJECT_NEW_B, title: 'จ้างพัฒนาระบบคอมพิวเตอร์ ข', pubDate: '2026-10-07' },
    ],
  });

  const result = await fetchP3({ limit: 1 });

  assert.equal(result.discovered, 1);
  assert.ok(await Tor.findOne({ projectId: TEST_PROJECT_NEW_A }));
  assert.equal(await Tor.findOne({ projectId: TEST_PROJECT_NEW_B }), null);
  // Every type was still asked for, so cancellations and winners can't be missed
  assert.equal(get.mock.callCount(), 8);
});
