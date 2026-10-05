import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Tor } from '#models/index.js';
import { classifyAnnouncement } from '#pipeline/shared/announcement-codes.js';

const TEST_DB = 'mjolnir_test';
const TEST_PROJECT_ID = '99999000099';

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
  await Tor.deleteOne({ projectId: TEST_PROJECT_ID });
});

after(async () => {
  await Tor.deleteOne({ projectId: TEST_PROJECT_ID });
  await disconnectDatabase();
});

test('announcement history: records B0, appends D0, sets isAmended on D1 (FR-02)', async () => {
  // 1. Initial upsert with B0 (Draft TOR)
  const doc1 = await Tor.findOneAndUpdate(
    { projectId: TEST_PROJECT_ID },
    {
      $set: {
        source: 'process3',
        title: 'โครงการทดสอบระบบประวัติประกาศ',
        status: 'Draft',
        announceType: 'B0',
      },
      $push: {
        announcementHistory: {
          code: 'B0',
          type: classifyAnnouncement('B0'),
          receivedAt: new Date('2026-01-01T10:00:00Z'),
          publishedAt: new Date('2026-01-01T08:00:00Z'),
          sourceUrl: 'https://example.com/b0',
        },
      },
    },
    { upsert: true, returnDocument: 'after' },
  );

  assert.equal(doc1.projectId, TEST_PROJECT_ID);
  assert.equal(doc1.status, 'Draft');
  assert.equal(doc1.announcementHistory.length, 1);
  assert.equal(doc1.announcementHistory[0].code, 'B0');
  assert.equal(doc1.announcementHistory[0].type, 'draft_tor');
  assert.equal(doc1.announcementHistory[0].sourceUrl, 'https://example.com/b0');

  // 2. Subsequent upsert with D0 (Invitation to Bid) appends to history
  const doc2 = await Tor.findOneAndUpdate(
    { projectId: TEST_PROJECT_ID },
    {
      $set: {
        status: 'Open',
        announceType: 'D0',
      },
      $push: {
        announcementHistory: {
          code: 'D0',
          type: classifyAnnouncement('D0'),
          receivedAt: new Date('2026-01-05T10:00:00Z'),
          publishedAt: new Date('2026-01-05T08:00:00Z'),
          sourceUrl: 'https://example.com/d0',
        },
      },
    },
    { upsert: true, returnDocument: 'after' },
  );

  assert.equal(doc2.status, 'Open');
  assert.equal(doc2.announcementHistory.length, 2);
  assert.equal(doc2.announcementHistory[0].code, 'B0');
  assert.equal(doc2.announcementHistory[1].code, 'D0');
  assert.equal(doc2.announcementHistory[1].type, 'invitation');

  // 3. Amendment D1 sets isAmended: true and appends 3rd history entry
  const doc3 = await Tor.findOneAndUpdate(
    { projectId: TEST_PROJECT_ID },
    {
      $set: {
        announceType: 'D1',
        isAmended: true,
      },
      $push: {
        announcementHistory: {
          code: 'D1',
          type: classifyAnnouncement('D1'),
          receivedAt: new Date('2026-01-10T10:00:00Z'),
          publishedAt: new Date('2026-01-10T08:00:00Z'),
          sourceUrl: 'https://example.com/d1',
        },
      },
    },
    { upsert: true, returnDocument: 'after' },
  );

  assert.equal(doc3.isAmended, true);
  assert.equal(doc3.announcementHistory.length, 3);
  assert.equal(doc3.announcementHistory[2].code, 'D1');
  assert.equal(doc3.announcementHistory[2].type, 'amendment');

  // 4. Verify chronological order of receivedAt
  const times = doc3.announcementHistory.map((h) => h.receivedAt.getTime());
  assert.ok(times[0] < times[1] && times[1] < times[2]);
});
