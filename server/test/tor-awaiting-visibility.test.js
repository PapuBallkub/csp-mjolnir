import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { TorInsight } from '#models/index.js';
import { getTorByProjectId, listTors } from '../src/features/tors/tor.service.js';

const TEST_DB = 'mjolnir_test';
const PROJECT = '99999000020';
const PILOT = { showUnreviewed: true };

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
  await TorInsight.deleteMany({ projectId: PROJECT });
  // Classified IT from its preview; extraction hasn't run yet (ADR 0018)
  await TorInsight.create({
    projectId: PROJECT,
    identification: { titleTh: 'ทดสอบรอข้อความเต็ม', agency: 'หน่วยงานทดสอบรอ', status: 'Open' },
    metadata: { reviewStatus: 'pending', awaitingFullText: true },
  });
});

after(async () => {
  await TorInsight.deleteMany({ projectId: PROJECT });
  await disconnectDatabase();
});

test('a TOR classified from its preview stays hidden until extraction fills it in', async () => {
  const listed = await listTors({ q: 'ทดสอบรอข้อความเต็ม' }, PILOT);
  assert.equal(listed.total, 0);
  assert.equal(await getTorByProjectId(PROJECT, PILOT), null);

  // Extraction replaces the record and the flag goes; then it shows
  await TorInsight.updateOne({ projectId: PROJECT }, { $set: { 'metadata.awaitingFullText': false } });
  assert.equal((await listTors({ q: 'ทดสอบรอข้อความเต็ม' }, PILOT)).total, 1);
});
