import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, mock, test } from 'node:test';
import axios, { AxiosError } from 'axios';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Tor } from '#models/index.js';
import {
  fetchFromProcess3,
  isFeedClosed,
  parseItemDescription,
  procurementKindOf,
} from '#pipeline/ingestion/sources/process3.js';

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
const TEST_PROJECT_NO_KEYWORD = '88888000010';
const TEST_PROJECT_HIRE = '88888000011';
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
  TEST_PROJECT_NO_KEYWORD,
  TEST_PROJECT_HIRE,
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

test('isFeedClosed: e-GP opens the feed 17:01–08:29 only, Bangkok time', () => {
  const at = (bangkok) => new Date(`2026-10-07T${bangkok}:00+07:00`);
  for (const time of ['17:01', '23:30', '00:00', '03:00', '08:29']) assert.equal(isFeedClosed(at(time)), false, time);
  // No lunch-hour opening: an older manual had one, and the feed timed out then
  for (const time of ['08:30', '08:59', '10:30', '12:05', '12:59', '16:59', '17:00']) assert.equal(isFeedClosed(at(time)), true, time);
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
  // An invitation comes with a new package, perhaps: download checks (ADR 0020)
  assert.equal(doc.packageCheckNeeded, true);
});

test('fetch flags a package check only for a stage that builds a package, once', async () => {
  await Tor.deleteMany({ projectId: TEST_PROJECT_PAST_DOWNLOAD });
  await createOcrDoneTor(TEST_PROJECT_PAST_DOWNLOAD);
  const flag = async () => (await Tor.findOne({ projectId: TEST_PROJECT_PAST_DOWNLOAD }).lean()).packageCheckNeeded;

  // A winner builds no package
  feedAnswers({ W0: [{ projectId: TEST_PROJECT_PAST_DOWNLOAD, pubDate: '2026-10-04' }] });
  await fetchP3();
  assert.equal(await flag(), false);
  mock.restoreAll();

  // A changed invitation does
  feedAnswers({ D2: [{ projectId: TEST_PROJECT_PAST_DOWNLOAD, pubDate: '2026-10-05' }] });
  await fetchP3();
  assert.equal(await flag(), true);

  // ...and opens the record of a change the agency announced, for download to fill in (ADR 0032)
  const changes = async () => (await Tor.findOne({ projectId: TEST_PROJECT_PAST_DOWNLOAD }).lean()).amendments;
  const [announced] = await changes();
  assert.deepEqual([announced.source, announced.zipId, announced.date.toISOString().slice(0, 10)], ['feed', null, '2026-10-05']);
  assert.ok((await Tor.findOne({ projectId: TEST_PROJECT_PAST_DOWNLOAD }).lean()).lastChangeAt);

  // Once download has checked, the same item seen again doesn't flag it anew, or record it twice
  await Tor.updateOne({ projectId: TEST_PROJECT_PAST_DOWNLOAD }, { packageCheckNeeded: false });
  await fetchP3();
  assert.equal(await flag(), false);
  assert.equal((await changes()).length, 1);
  mock.restoreAll();
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
  // Two unanswered in a row: the rest would hang for their timeouts too (ADR 0027)
  assert.equal(get.mock.callCount(), 2);
  assert.equal(result.requested, 2);
  assert.equal(result.answered, 0);
  assert.match(result.errors[0], /timeout/);
  assert.match(result.errors.at(-1), /stopped asking after 2 requests in a row went unanswered/);
  assert.ok(get.mock.calls.every((call) => call.arguments[0].includes('egpannouncerss.xml')));
});

test('fetchFromProcess3: when e-GP asks us to slow down (429), it stops asking at once', async () => {
  const get = mock.method(axios, 'get', async (url) => {
    if (new URL(url).searchParams.get('anounceType') === 'D0') {
      throw new AxiosError('Request failed with status code 429', 'ERR_BAD_REQUEST', undefined, undefined, { status: 429 });
    }
    return { data: buildRssXml([]) };
  });

  const result = await fetchP3({ types: ['B0', 'D0', 'D2', 'W0'] });

  assert.equal(get.mock.callCount(), 2, 'B0 answered, D0 refused, nothing after');
  assert.equal(result.rateLimited, true);
  assert.equal(result.unreachable, false, 'refusing us is busy, not down');
  assert.equal(result.answered, 1);
  assert.match(result.errors.at(-1), /slow down \(HTTP 429\)/);
});

test('fetchFromProcess3: reads e-GP\'s count of the day and the oldest day in each list, and can ask one day', async () => {
  const get = mock.method(axios, 'get', async (url) => {
    return { data: new URL(url).searchParams.get('anounceType') === 'D0' ? recordedFeed() : buildRssXml([]) };
  });

  const result = await fetchP3({ types: ['D0', 'W0'], deptId: '0307', announceDate: '20261007' });

  // The national list of 2026-10-07: 20 shown of the 377 announced
  assert.equal(result.itemsByType.D0, 20);
  assert.equal(result.countByType.D0, 377);
  assert.equal(result.oldestDateByType.D0, '2026-10-07');
  assert.equal(result.oldestDateByType.W0, undefined, 'an empty list has no oldest day');
  const asked = new URL(get.mock.calls[0].arguments[0]);
  assert.equal(asked.searchParams.get('announceDate'), '20261007');
  assert.equal(asked.searchParams.get('deptId'), '0307');
});

test('fetchFromProcess3: one request left unanswered does not stop the others, and items are counted by code', async () => {
  mock.method(axios, 'get', async (url) => {
    const code = new URL(url).searchParams.get('anounceType');
    if (code === '15') throw new AxiosError('timeout of 20000ms exceeded', 'ECONNABORTED');
    return { data: buildRssXml(code === 'W0' ? [{ projectId: '69100000001', code: 'W0', title: 'ซื้อรถบรรทุก' }] : []) };
  });

  const result = await fetchP3();

  assert.equal(result.requested, 8);
  assert.equal(result.answered, 7);
  assert.equal(result.itemsByType.W0, 1);
  assert.equal(result.itemsByType.D0, 0);
  assert.equal(result.itemsByType['15'], undefined, 'an unanswered request returned no items to count');
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
  assert.match(result.errors[0], /only 17:01–08:29/);
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

test('procurementKindOf: จ้าง is a job, ซื้อ is supplying goods, เช่า is renting', () => {
  assert.equal(procurementKindOf('ประกวดราคาจ้างบำรุงรักษาเครื่องคอมพิวเตอร์แม่ข่าย (Server)'), 'hire');
  assert.equal(procurementKindOf('ประกวดราคาซื้อสิทธิการใช้งานระบบบัญชีผู้ใช้งาน Active Directory'), 'buy');
  assert.equal(procurementKindOf('ประกวดราคาเช่ารถยนต์ส่วนกลาง 3 ประเภท'), 'rent');
  assert.equal(procurementKindOf('จ้างโครงการวางท่อระบบประปาหมู่บ้าน'), 'hire');
  assert.equal(procurementKindOf('โครงการจัดหาโปรแกรมบริหารจัดการ'), null);
  assert.equal(procurementKindOf(undefined), null);
});

test('fetchFromProcess3: with no keyword, every opening item is a candidate, and keeps its kind', async () => {
  // Neither title says คอมพิวเตอร์: classify decides from the document (ADR 0018)
  feedAnswers({
    D0: [
      { projectId: TEST_PROJECT_NO_KEYWORD, title: 'ประกวดราคาซื้อสิทธิการใช้งานระบบบัญชีผู้ใช้งาน Active Directory', pubDate: '2026-10-07' },
      { projectId: TEST_PROJECT_HIRE, title: 'ประกวดราคาจ้างพัฒนาแอปพลิเคชันบริการประชาชน', pubDate: '2026-10-07' },
    ],
  });

  const result = await fetchP3({ query: null, limit: Infinity });

  assert.equal(result.discovered, 2);
  assert.equal((await Tor.findOne({ projectId: TEST_PROJECT_NO_KEYWORD }).lean()).procurementKind, 'buy');
  assert.equal((await Tor.findOne({ projectId: TEST_PROJECT_HIRE }).lean()).procurementKind, 'hire');
});

test('fetch asks one agency for only the types it was given', async () => {
  const get = feedAnswers({});

  await fetchP3({ deptId: '0307', types: ['D0', 'B0'] });

  const asked = get.mock.calls.map((call) => new URL(call.arguments[0]));
  assert.deepEqual(asked.map((url) => url.searchParams.get('anounceType')), ['B0', 'D0'], 'in the order a project goes through them');
  assert.ok(asked.every((url) => url.searchParams.get('deptId') === '0307'));
  mock.restoreAll();
});
