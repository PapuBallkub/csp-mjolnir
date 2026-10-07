import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, mock, test } from 'node:test';
import axios, { AxiosError } from 'axios';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { PipelineFailure, Tor } from '#models/index.js';
import { runDownloadStep } from '#pipeline/ingestion/ingest.js';
import { MAX_ATTEMPTS } from '#pipeline/shared/failures.js';

// A database of its own: the download step takes every `fetched` TOR, and the
// other test files leave theirs in mjolnir_test while this one runs
const TEST_DB = 'mjolnir_test_download_step';
const PROJECT = '55555000001';

let documentsDir;

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
  documentsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gipdp-download-'));
});

beforeEach(async () => {
  await Tor.deleteMany({});
  await PipelineFailure.deleteMany({});
  await Tor.create({
    projectId: PROJECT,
    source: 'process3',
    title: 'จ้างพัฒนาระบบคอมพิวเตอร์',
    pipelineStatus: 'fetched',
    announcementHistory: [{ code: 'D0', type: 'invitation', publishedAt: new Date('2026-10-07') }],
  });
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
  await fs.rm(documentsDir, { recursive: true, force: true });
});

/** e-GP answers both probes, but has no file for this project. */
function egpHasNoFile() {
  return mock.method(axios, 'get', async () => ({ data: { data: {} } }));
}

const failureOf = () => PipelineFailure.findOne({ projectId: PROJECT, step: 'download' }).lean();

test('download step: a TOR e-GP has no file for gives up, and is then left alone', async () => {
  // It has already failed all but one of its attempts
  await PipelineFailure.create({
    projectId: PROJECT,
    step: 'download',
    attempts: MAX_ATTEMPTS - 1,
    firstFailedAt: new Date(),
    lastFailedAt: new Date(),
  });
  const get = egpHasNoFile();

  await runDownloadStep({ documentsDir });
  assert.equal((await failureOf()).attempts, MAX_ATTEMPTS);
  assert.equal(get.mock.callCount(), 2);

  await runDownloadStep({ documentsDir });
  assert.equal(get.mock.callCount(), 2, 'a TOR that gave up sends e-GP no more requests');

  await runDownloadStep({ documentsDir, retryFailed: true });
  assert.equal(get.mock.callCount(), 4, '--retry-failed tries it again');
  assert.equal((await Tor.findOne({ projectId: PROJECT }).lean()).pipelineStatus, 'fetched');
});

test('download step: an e-GP outage is recorded but not counted against the TOR', async () => {
  mock.method(axios, 'get', async () => {
    throw new AxiosError('timeout of 10000ms exceeded', 'ECONNABORTED');
  });

  await runDownloadStep({ documentsDir });

  const failure = await failureOf();
  assert.equal(failure.attempts, 0);
  assert.equal(failure.lastTransient, true);
  assert.match(failure.lastError, /e-GP did not answer/);
});

test('download step: a download that works forgets the earlier failures', async () => {
  await PipelineFailure.create({
    projectId: PROJECT,
    step: 'download',
    attempts: 1,
    firstFailedAt: new Date(),
    lastFailedAt: new Date(),
  });
  mock.method(axios, 'get', async (url) => {
    if (url.includes('infoProcureDocAnnounZip')) return { data: { data: { zipId: 'zip-1', buildName1: 'pkg.zip' } } };
    if (url.includes('downloadFileTest')) return { data: Buffer.from('%PDF-1.4 not a real document') };
    return { data: { data: {} } };
  });

  await runDownloadStep({ documentsDir });

  assert.equal((await Tor.findOne({ projectId: PROJECT }).lean()).pipelineStatus, 'downloaded');
  assert.equal(await failureOf(), null);
});

test('download step: a TOR that is past (cancelled, or with a winner) is never downloaded', async () => {
  await Tor.deleteMany({});
  await Tor.create([
    { projectId: '55555000002', source: 'process3', title: 'ยกเลิกแล้ว', status: 'Cancelled', pipelineStatus: 'fetched' },
    {
      projectId: '55555000003',
      source: 'datago',
      title: 'มีผู้ชนะแล้ว',
      status: 'Open', // stored as Open, but a contract has a winner
      contract: { winnerName: 'บริษัท ผู้ชนะ จำกัด' },
      pipelineStatus: 'fetched',
    },
  ]);
  const get = egpHasNoFile();

  await runDownloadStep({ documentsDir });

  assert.equal(get.mock.callCount(), 0, 'no request to e-GP for either');
});

test('download step: a TOR the e-GP feed never announced is never downloaded', async () => {
  await Tor.deleteMany({});
  // What the removed data.go.th fallback left behind: "Open" only by default
  await Tor.create({ projectId: '55555000004', source: 'process3', title: 'จ้างพัฒนาระบบ ปี 2568', pipelineStatus: 'fetched' });
  const get = egpHasNoFile();

  await runDownloadStep({ documentsDir });

  assert.equal(get.mock.callCount(), 0);
});
