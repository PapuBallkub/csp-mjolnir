import assert from 'node:assert/strict';
import { after, before, beforeEach, mock, test } from 'node:test';
import axios, { AxiosError } from 'axios';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Tor } from '#models/index.js';
import { fetchFromProcess3 } from '#pipeline/ingestion/sources/process3.js';

const TEST_DB = 'mjolnir_test';
const TEST_PROJECT_1 = '88888000001';
const TEST_PROJECT_2 = '88888000002';
const TEST_PROJECT_SEEN_AGAIN = '88888000003';
const TEST_PROJECT_PAST_DOWNLOAD = '88888000004';
const TEST_PROJECTS = [
  TEST_PROJECT_1,
  TEST_PROJECT_2,
  TEST_PROJECT_SEEN_AGAIN,
  TEST_PROJECT_PAST_DOWNLOAD,
];
const TEST_DOCS_DIR = './data/test_documents';

function buildRssXml(items) {
  const itemXml = items
    .map(
      (item) => `
    <item>
      <title>${item.title || ''}</title>
      <link>${item.link || ''}</link>
      <description>${item.description || ''}</description>
      <pubDate>${item.pubDate || 'Mon, 05 Oct 2026 09:00:00 +0700'}</pubDate>
      <project_id>${item.projectId || ''}</project_id>
    </item>`,
    )
    .join('\n');

  return Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>e-GP Announcements</title>
    ${itemXml}
  </channel>
</rss>`);
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

test('fetchFromProcess3: ingests B0, transitions to Open on D0, and sets isAmended on D1 (FR-02)', async () => {
  // Step 1: Ingest B0 (Draft TOR)
  mock.method(axios, 'get', async (url) => {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('announceType');
    if (code === 'B0') {
      return {
        data: buildRssXml([
          {
            title: 'จ้างพัฒนาระบบคอมพิวเตอร์และคลาวด์',
            link: `https://process3.gprocurement.go.th/egp?project_id=${TEST_PROJECT_1}`,
            description: 'รายละเอียดระบบคอมพิวเตอร์',
            projectId: TEST_PROJECT_1,
            pubDate: '2026-10-01T08:00:00.000Z',
          },
        ]),
      };
    }
    return { data: buildRssXml([]) };
  });

  const resB0 = await fetchFromProcess3({
    query: 'คอมพิวเตอร์',
    limit: 1,
    documentsDir: TEST_DOCS_DIR,
    downloadAttachments: false,
  });

  assert.equal(resB0.fetched, 1);
  const docB0 = await Tor.findOne({ projectId: TEST_PROJECT_1 }).lean();
  assert.ok(docB0);
  assert.equal(docB0.announceType, 'B0');
  assert.equal(docB0.status, 'Draft');
  assert.equal(docB0.isAmended, false);
  assert.equal(docB0.announcementHistory.length, 1);
  assert.equal(docB0.announcementHistory[0].code, 'B0');
  assert.equal(docB0.announcementHistory[0].type, 'draft_tor');

  // Step 2: Ingest D0 (Invitation to Bid) for the same project
  mock.method(axios, 'get', async (url) => {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('announceType');
    if (code === 'D0') {
      return {
        data: buildRssXml([
          {
            title: 'จ้างพัฒนาระบบคอมพิวเตอร์และคลาวด์',
            link: `https://process3.gprocurement.go.th/egp?project_id=${TEST_PROJECT_1}`,
            description: 'รายละเอียดระบบคอมพิวเตอร์',
            projectId: TEST_PROJECT_1,
            pubDate: '2026-10-03T08:00:00.000Z',
          },
        ]),
      };
    }
    return { data: buildRssXml([]) };
  });

  const resD0 = await fetchFromProcess3({
    query: 'คอมพิวเตอร์',
    limit: 1,
    documentsDir: TEST_DOCS_DIR,
    downloadAttachments: false,
  });

  assert.equal(resD0.fetched, 1);
  const docD0 = await Tor.findOne({ projectId: TEST_PROJECT_1 }).lean();
  assert.equal(docD0.announceType, 'D0');
  assert.equal(docD0.status, 'Open'); // Derived forward transition from Draft -> Open!
  assert.equal(docD0.isAmended, false);
  assert.equal(docD0.announcementHistory.length, 2);
  assert.equal(docD0.announcementHistory[0].code, 'B0');
  assert.equal(docD0.announcementHistory[1].code, 'D0');
  assert.equal(docD0.announcementHistory[1].type, 'invitation');

  // Step 3: Ingest D1 (Amendment) for the same project with minimal title
  mock.method(axios, 'get', async (url) => {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('announceType');
    if (code === 'D1') {
      return {
        data: buildRssXml([
          {
            title: '', // Sparse/empty title in amendment RSS
            link: `https://process3.gprocurement.go.th/egp?project_id=${TEST_PROJECT_1}`,
            description: 'แก้ไขเอกสารคอมพิวเตอร์',
            projectId: TEST_PROJECT_1,
            pubDate: '2026-10-05T08:00:00.000Z',
          },
        ]),
      };
    }
    return { data: buildRssXml([]) };
  });

  const resD1 = await fetchFromProcess3({
    query: 'คอมพิวเตอร์',
    limit: 1,
    documentsDir: TEST_DOCS_DIR,
    downloadAttachments: false,
  });

  assert.equal(resD1.fetched, 1);
  const docD1 = await Tor.findOne({ projectId: TEST_PROJECT_1 }).lean();
  assert.equal(docD1.announceType, 'D1');
  assert.equal(docD1.status, 'Open'); // Remains Open
  assert.equal(docD1.isAmended, true); // Amended flag set!
  assert.equal(docD1.title, 'จ้างพัฒนาระบบคอมพิวเตอร์และคลาวด์'); // Title preserved!
  assert.equal(docD1.announcementHistory.length, 3);
  assert.equal(docD1.announcementHistory[2].code, 'D1');
  assert.equal(docD1.announcementHistory[2].type, 'amendment');
});

test('fetchFromProcess3: handles Reference Price (15) announcement correctly (FR-02)', async () => {
  mock.method(axios, 'get', async (url) => {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('announceType');
    if (code === '15') {
      return {
        data: buildRssXml([
          {
            title: 'ประกาศราคากลางระบบจัดซื้อคอมพิวเตอร์',
            link: `https://process3.gprocurement.go.th/egp?project_id=${TEST_PROJECT_2}`,
            description: 'ราคากลางคอมพิวเตอร์',
            projectId: TEST_PROJECT_2,
            pubDate: '2026-10-02T08:00:00.000Z',
          },
        ]),
      };
    }
    return { data: buildRssXml([]) };
  });

  const res15 = await fetchFromProcess3({
    query: 'คอมพิวเตอร์',
    limit: 1,
    documentsDir: TEST_DOCS_DIR,
    downloadAttachments: false,
  });

  assert.equal(res15.fetched, 1);
  const doc15 = await Tor.findOne({ projectId: TEST_PROJECT_2 }).lean();
  assert.ok(doc15);
  assert.equal(doc15.announceType, '15');
  assert.equal(doc15.status, 'Open');
  assert.equal(doc15.isAmended, false);
  assert.equal(doc15.announcementHistory.length, 1);
  assert.equal(doc15.announcementHistory[0].code, '15');
  assert.equal(doc15.announcementHistory[0].type, 'reference_price');
});

test('fetchFromProcess3: an RSS item seen on every poll is recorded once', async () => {
  mock.method(axios, 'get', async (url) => {
    const code = new URL(url).searchParams.get('announceType');
    if (code !== 'B0') return { data: buildRssXml([]) };
    return {
      data: buildRssXml([
        {
          title: 'จ้างพัฒนาระบบคอมพิวเตอร์ ระบบสารบรรณอิเล็กทรอนิกส์',
          link: `https://process3.gprocurement.go.th/egp?project_id=${TEST_PROJECT_SEEN_AGAIN}`,
          description: 'คอมพิวเตอร์',
          projectId: TEST_PROJECT_SEEN_AGAIN,
          pubDate: '2026-10-01T08:00:00.000Z',
        },
      ]),
    };
  });

  for (let poll = 0; poll < 2; poll++) {
    await fetchFromProcess3({ query: 'คอมพิวเตอร์', limit: 1, documentsDir: TEST_DOCS_DIR });
  }

  const doc = await Tor.findOne({ projectId: TEST_PROJECT_SEEN_AGAIN }).lean();
  assert.equal(doc.announcementHistory.length, 1);
  assert.equal(doc.status, 'Draft');
});

test('fetchFromProcess3: fetching a TOR again never undoes download or OCR', async () => {
  await createOcrDoneTor(TEST_PROJECT_PAST_DOWNLOAD);
  mock.method(axios, 'get', async (url) => {
    const code = new URL(url).searchParams.get('announceType');
    if (code !== 'D0') return { data: buildRssXml([]) };
    return {
      data: buildRssXml([
        {
          title: 'จ้างพัฒนาระบบคอมพิวเตอร์ที่อ่านแล้ว',
          link: `https://process3.gprocurement.go.th/egp?project_id=${TEST_PROJECT_PAST_DOWNLOAD}`,
          description: 'คอมพิวเตอร์',
          projectId: TEST_PROJECT_PAST_DOWNLOAD,
          pubDate: '2026-10-03T08:00:00.000Z',
        },
      ]),
    };
  });

  await fetchFromProcess3({ query: 'คอมพิวเตอร์', limit: 1, documentsDir: TEST_DOCS_DIR });

  const doc = await Tor.findOne({ projectId: TEST_PROJECT_PAST_DOWNLOAD }).lean();
  assertUntouchedByFetch(doc);
  // The new announcement itself is still recorded
  assert.equal(doc.announcementHistory.length, 1);
  assert.equal(doc.status, 'Open');
});

test('fetchFromProcess3: a feed that does not answer is reported, not replaced by old contracts', async () => {
  const get = mock.method(axios, 'get', async (url) => {
    if (url.includes('egpannouncerss.xml')) throw new AxiosError('timeout of 20000ms exceeded', 'ECONNABORTED');
    throw new Error(`fetch must not fall back to another source: ${url}`);
  });

  const result = await fetchFromProcess3({ query: 'คอมพิวเตอร์', limit: 1, documentsDir: TEST_DOCS_DIR });

  assert.equal(result.fetched, 0);
  assert.equal(result.unreachable, true);
  assert.equal(result.errors.length, get.mock.callCount());
  assert.match(result.errors[0], /timeout/);
  assert.ok(get.mock.calls.every((call) => call.arguments[0].includes('egpannouncerss.xml')));
});

test('fetchFromProcess3: a feed that answers with nothing new is not an outage', async () => {
  mock.method(axios, 'get', async (url) => {
    if (new URL(url).searchParams.get('announceType') === '15') {
      throw new AxiosError('timeout of 20000ms exceeded', 'ECONNABORTED');
    }
    return { data: buildRssXml([]) };
  });

  const result = await fetchFromProcess3({ query: 'คอมพิวเตอร์', limit: 1, documentsDir: TEST_DOCS_DIR });

  assert.equal(result.fetched, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(result.unreachable, false);
});
