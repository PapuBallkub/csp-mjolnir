import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, mock, test } from 'node:test';
import AdmZip from 'adm-zip';
import axios, { AxiosError } from 'axios';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { PipelineFailure, TitleScreen, Tor, TorInsight, TorInsightVersion } from '#models/index.js';
import { applyPackage, applyPricePackage, readTorParts, runAddStep, runDownloadStep } from '#pipeline/ingestion/ingest.js';
import { isPreviewRead } from '#pipeline/ingestion/lib/ocr.js';
import { downloadEgpPackage, downloadEgpPricePackage } from '#pipeline/ingestion/lib/tor-downloader.js';
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

/** A title screen verdict, as the screen step saves it (ADR 0026). */
const screened = (projectId, verdict, audit = false) =>
  TitleScreen.create({
    projectId,
    title: 'จ้างพัฒนาระบบคอมพิวเตอร์',
    verdict,
    audit,
    modelName: 'gemini-test',
    promptVersion: 'screen-test',
    screenedAt: new Date(),
  });

beforeEach(async () => {
  await Tor.deleteMany({});
  await PipelineFailure.deleteMany({});
  await TitleScreen.deleteMany({});
  await screened(PROJECT, 'it');
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

  // One request: the price package is no stand-in for the announcement's (ADR 0020)
  await runDownloadStep({ documentsDir });
  assert.equal((await failureOf()).attempts, MAX_ATTEMPTS);
  assert.equal(get.mock.callCount(), 1);

  await runDownloadStep({ documentsDir });
  assert.equal(get.mock.callCount(), 1, 'a TOR that gave up sends e-GP no more requests');

  await runDownloadStep({ documentsDir, retryFailed: true });
  assert.equal(get.mock.callCount(), 2, '--retry-failed tries it again');
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

test('download step: a new project waits for the title screen, and not_it stops it (ADR 0026)', async () => {
  await TitleScreen.deleteMany({});
  const get = egpHasNoFile();

  await runDownloadStep({ documentsDir });
  assert.equal(get.mock.callCount(), 0, 'not screened yet: not downloaded');

  await screened(PROJECT, 'not_it');
  await runDownloadStep({ documentsDir });
  assert.equal(get.mock.callCount(), 0, 'not IT by its title: not downloaded');

  await runDownloadStep({ documentsDir, screened: false });
  assert.equal(get.mock.callCount(), 1, '--skip-screen downloads it anyway');
});

test('download step: unsure and audited not_it projects are downloaded', async () => {
  const unsure = '55555000005';
  const audited = '55555000006';
  await Tor.create(
    [unsure, audited].map((projectId) => ({
      projectId,
      source: 'process3',
      title: 'ซื้อครุภัณฑ์คอมพิวเตอร์',
      pipelineStatus: 'fetched',
      announcementHistory: [{ code: 'D0', type: 'invitation', publishedAt: new Date('2026-10-07') }],
    })),
  );
  await screened(unsure, 'unsure');
  await screened(audited, 'not_it', true);
  const get = egpHasNoFile();

  await runDownloadStep({ documentsDir });

  const asked = get.mock.calls.map((call) => call.arguments[0]).join(' ');
  for (const projectId of [PROJECT, unsure, audited]) assert.match(asked, new RegExp(projectId));
});

test('download step: a project already downloaded is checked at a new stage, screened or not', async () => {
  await TitleScreen.deleteMany({});
  await Tor.updateOne({ projectId: PROJECT }, { pipelineStatus: 'ocr_done', packageCheckNeeded: true, priceCheckedAt: new Date() });
  const get = egpHasNoFile();

  await runDownloadStep({ documentsDir });

  assert.ok(get.mock.callCount() > 0, 'the screen only gates new projects');
});

test('download step: nothing new starts once the time box is over (ADR 0027)', async () => {
  const get = egpHasNoFile();

  await runDownloadStep({ documentsDir, until: new Date(Date.now() - 1000) });

  assert.equal(get.mock.callCount(), 0);
  assert.equal((await Tor.findOne({ projectId: PROJECT }).lean()).pipelineStatus, 'fetched');
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

/** A past project from data.go.th: awarded, never in the feed, never screened by the download gate. */
const pastProject = (projectId, historyRequestedAt = null) => ({
  projectId,
  source: 'datago',
  title: 'จ้างพัฒนาระบบสารสนเทศ ปี 2568',
  status: 'Awarded',
  contract: { winnerName: 'บริษัท ผู้ชนะ จำกัด', agreedPriceTHB: 1_850_000 },
  pipelineStatus: 'fetched',
  historyRequestedAt,
});

test('download step: a past project asked for is downloaded, though awarded; one not asked for is not (ADR 0028)', async () => {
  const asked = '55555000007';
  const notAsked = '55555000008';
  await Tor.create([pastProject(asked, new Date()), pastProject(notAsked)]);
  const get = egpHasNoFile();

  await runDownloadStep({ documentsDir });

  const urls = get.mock.calls.map((call) => call.arguments[0]).join(' ');
  assert.match(urls, new RegExp(asked), 'asked for: downloaded without a title screen');
  assert.doesNotMatch(urls, new RegExp(notAsked));
});

test('download step: a past project e-GP has no package for gives up at once (ADR 0028)', async () => {
  const asked = '55555000007';
  await Tor.create(pastProject(asked, new Date()));
  egpHasNoFile();

  await runDownloadStep({ documentsDir });

  // An awarded project's package won't appear later; a new one's may, so it gets its usual tries
  const past = await PipelineFailure.findOne({ projectId: asked, step: 'download' }).lean();
  assert.equal(past.attempts, MAX_ATTEMPTS);
  assert.equal((await failureOf()).attempts, 1);
});

test('download step: --queue takes one kind of work, soonest deadline first (ADR 0030)', async () => {
  // PROJECT is new; one more new, closing sooner; one at a new stage; one past project
  const sooner = '55555000011';
  const atNewStage = '55555000012';
  const past = '55555000013';
  await screened(sooner, 'it');
  await Tor.updateOne({ projectId: PROJECT }, { submissionDeadline: new Date('2026-11-20') });
  await Tor.create([
    {
      projectId: sooner,
      source: 'process3',
      title: 'จ้างพัฒนาระบบ',
      pipelineStatus: 'fetched',
      submissionDeadline: new Date('2026-11-02'),
      announcementHistory: [{ code: 'D0', type: 'invitation', publishedAt: new Date('2026-10-07') }],
    },
    {
      projectId: atNewStage,
      source: 'process3',
      title: 'จ้างบำรุงรักษาระบบ',
      pipelineStatus: 'ocr_done',
      packageCheckNeeded: true,
      priceCheckedAt: new Date(),
      announcementHistory: [{ code: 'D0', type: 'invitation', publishedAt: new Date('2026-10-07') }],
    },
    pastProject(past, new Date()),
  ]);
  const get = egpHasNoFile();
  const asked = () => [...new Set(get.mock.calls.map((call) => call.arguments[0].match(/projectId=(\d+)/)?.[1]))];

  await runDownloadStep({ documentsDir, queues: ['changed'] });
  assert.deepEqual(asked(), [atNewStage]);

  get.mock.resetCalls();
  await runDownloadStep({ documentsDir, queues: ['new'] });
  assert.deepEqual(asked(), [sooner, PROJECT], 'the soonest deadline first');

  get.mock.resetCalls();
  await runDownloadStep({ documentsDir, queues: ['past'] });
  assert.deepEqual(asked(), [past]);
});

test('download step: a TOR the e-GP feed never announced is never downloaded', async () => {
  await Tor.deleteMany({});
  // What the removed data.go.th fallback left behind: "Open" only by default
  await Tor.create({ projectId: '55555000004', source: 'process3', title: 'จ้างพัฒนาระบบ ปี 2568', pipelineStatus: 'fetched' });
  const get = egpHasNoFile();

  await runDownloadStep({ documentsDir });

  assert.equal(get.mock.callCount(), 0);
});

/* ------------------------- e-GP packages (ADR 0020) ------------------------ */

// A real announcement: กรมการค้าภายใน, ราคากลาง 1,290,420, bids 19 Oct 2569 09:00–12:00
const ANNOUNCEMENT_PDF = path.join(import.meta.dirname, 'fixtures', 'egp-package', 'annoudoc_1300400000_69109062251.pdf');
const noWait = async () => {};
const download = (args) => downloadEgpPackage({ ...args, pace: noWait });
// What OCR reads off the price form: real Tesseract output, set per test
let priceFormOcr = '';
const downloadPrice = (args) =>
  downloadEgpPricePackage({ ...args, pace: noWait, ocr: async () => ({ text: priceFormOcr }) });
const run = (options = {}) => runDownloadStep({ documentsDir, download, downloadPrice, ...options });
const priceFormFixture = (id) =>
  fs.readFile(path.join(import.meta.dirname, 'fixtures', 'egp-package', `${id}-price-form-ocr.txt`), 'utf8');

function zipOf(files) {
  const zip = new AdmZip();
  for (const [name, data] of Object.entries(files)) zip.addFile(name, Buffer.from(data));
  return zip.toBuffer();
}

/**
 * e-GP's current packages for the project, and every package's bytes by
 * zipId. `price` is the price package's zipId; none by default.
 */
function egpServes({ current, zips, price = null }) {
  return mock.method(axios, 'get', async (url) => {
    if (url.includes('infoProcureDocAnnounZip')) {
      return { data: { data: { zipId: current, buildName1: `${PROJECT}_${current}.zip` } } };
    }
    if (url.includes('infoDocPriceestZipHis')) {
      return { data: { data: price ? { zipFileId: price, zipFileName: `pricebuild_0000000000_${PROJECT}.zip` } : {} } };
    }
    const fileId = new URL(url).searchParams.get('fileId');
    if (url.includes('downloadFileTest') && zips[fileId]) return { data: zips[fileId] };
    throw new Error(`unexpected request: ${url}`);
  });
}

const invitation = async (tor = '%PDF-1.4 the TOR') =>
  zipOf({
    'annoudoc_1300400000_55555000001.pdf': await fs.readFile(ANNOUNCEMENT_PDF),
    'Attach_TOR_1.pdf': tor,
    'Bid Bond.pdf': '%PDF-1.4 a blank form',
    'quotation.pdf': '%PDF-1.4 a blank form',
  });
const torOf = () => Tor.findOne({ projectId: PROJECT }).lean();

test("download step: a package keeps its project files, not e-GP's forms, and its announcement is read", async () => {
  egpServes({ current: 'zip-d0', zips: { 'zip-d0': await invitation() } });

  await run();

  const tor = await torOf();
  assert.equal(tor.pipelineStatus, 'downloaded');
  const [pkg] = tor.packages;
  assert.deepEqual(
    pkg.files.map((file) => [file.fileName, file.role]),
    [
      ['annoudoc_1300400000_55555000001.pdf', 'announcement'],
      ['Attach_TOR_1.pdf', 'tor'],
    ],
  );
  for (const file of pkg.files) assert.ok(existsSync(file.storagePath), file.fileName);
  assert.equal(tor.document.fileName, 'Attach_TOR_1.pdf');
  assert.equal(tor.document.storagePath, pkg.files[1].storagePath);
  // Read in code from the announcement, and kept on the Tor like the feed's values
  assert.equal(tor.agency, 'กรมการค้าภายใน');
  assert.equal(tor.referencePriceTHB, 1_290_420);
  assert.equal(tor.submissionDeadline.toISOString(), new Date('2026-10-19T12:00:00+07:00').toISOString());
  assert.equal(pkg.facts.submissionWindow.opensAt.toISOString(), new Date('2026-10-19T09:00:00+07:00').toISOString());
  assert.match(pkg.announcementText, /ประกาศกรมการค้าภายใน/);
});

test('download step: the TOR is found by elimination, whatever its name', async () => {
  const zip = zipOf({
    'annoudoc_2100200224_55555000001.pdf': await fs.readFile(ANNOUNCEMENT_PDF),
    'PPC.29092569.pdf': '%PDF-1.4 a TOR named after its date',
  });
  egpServes({ current: 'zip-draft', zips: { 'zip-draft': zip } });

  await run();

  assert.equal((await torOf()).document.fileName, 'PPC.29092569.pdf');
});

test('download step: a package already downloaded is not downloaded again', async () => {
  const get = egpServes({ current: 'zip-d0', zips: { 'zip-d0': await invitation() } });
  await run();
  assert.equal(get.mock.callCount(), 3, 'the package, its download, and a look for a price package');

  // Read since, and the feed announced something new: download checks
  await Tor.updateOne({ projectId: PROJECT }, { pipelineStatus: 'ocr_done', packageCheckNeeded: true });
  await run();

  assert.equal(get.mock.callCount(), 5, 'a look at each package, no download');
  const tor = await torOf();
  assert.equal(tor.packages.length, 1);
  assert.equal(tor.packageCheckNeeded, false);
  assert.equal(tor.pipelineStatus, 'ocr_done');
});

test("download step: a new package whose TOR didn't change updates the facts, and isn't read again", async () => {
  egpServes({ current: 'zip-d0', zips: { 'zip-d0': await invitation() } });
  await run();
  await Tor.updateOne({ projectId: PROJECT }, { pipelineStatus: 'ocr_done', packageCheckNeeded: true });

  egpServes({ current: 'zip-d2', zips: { 'zip-d2': await invitation() } });
  await run();

  const tor = await torOf();
  assert.equal(tor.packages.length, 2, 'the earlier package stays');
  assert.equal(tor.pipelineStatus, 'ocr_done', 'the same TOR is not read again');
  assert.equal(tor.document.version, 1);
  assert.equal(tor.document.storagePath, tor.packages[1].files[1].storagePath);
});

test('download step: a new package with a changed TOR sends it back to OCR, as a new version', async () => {
  egpServes({ current: 'zip-d0', zips: { 'zip-d0': await invitation('%PDF-1.4 the TOR, first') } });
  await run();
  await Tor.updateOne({ projectId: PROJECT }, { pipelineStatus: 'ocr_done', packageCheckNeeded: true });

  egpServes({ current: 'zip-d2', zips: { 'zip-d2': await invitation('%PDF-1.4 the TOR, changed') } });
  await run();

  const tor = await torOf();
  assert.equal(tor.pipelineStatus, 'downloaded');
  assert.equal(tor.document.version, 2);
});

test('download step: a summary built from a TOR file a new package replaces is kept first, with that file and its text (ADR 0031)', async () => {
  egpServes({ current: 'zip-d0', zips: { 'zip-d0': await invitation('%PDF-1.4 the TOR, first') } });
  await run();
  await Tor.updateOne({ projectId: PROJECT }, { pipelineStatus: 'ocr_done', packageCheckNeeded: true, 'ocr.rawText': 'ข้อความ TOR ฉบับแรก' });
  const before = await torOf();
  await TorInsight.create({
    projectId: PROJECT,
    identification: { titleTh: 'จ้างพัฒนาระบบคอมพิวเตอร์', agency: 'กรมตัวอย่าง', status: 'Open' },
    facts: { referencePriceTHB: 1_000_000 },
    metadata: { excluded: null },
  });

  egpServes({ current: 'zip-d2', zips: { 'zip-d2': await invitation('%PDF-1.4 the TOR, changed') } });
  await run();

  const kept = await TorInsightVersion.findOne({ projectId: PROJECT }).lean();
  assert.equal(kept.reason, 'source-changed');
  assert.equal(kept.insight.facts.referencePriceTHB, 1_000_000);
  assert.equal(kept.tor.document.contentHash, before.document.contentHash, 'the file it was built from, not the new one');
  assert.equal(kept.ocrText, 'ข้อความ TOR ฉบับแรก');
  assert.notEqual((await torOf()).document.contentHash, before.document.contentHash);

  await TorInsight.deleteMany({});
  await TorInsightVersion.deleteMany({});
});

test("applyPackage: a package that doesn't state a fact leaves the last one standing, and never replaces the feed's agency", () => {
  const tor = new Tor({
    projectId: PROJECT,
    source: 'datago',
    title: 'จ้างพัฒนาระบบ',
    agency: 'สำนักงานจากฟีด',
    referencePriceTHB: 1_000_000,
    submissionDeadline: new Date('2026-10-19T05:00:00Z'),
  });
  const draft = {
    zipId: 'zip-b0',
    files: [],
    facts: {
      agency: { value: 'กรมอื่น', quote: 'ประกาศกรมอื่น', document: 'announcement' },
      referencePriceTHB: null,
      submissionWindow: null,
    },
  };
  const file = {
    fileName: 'Attach_TOR_1.pdf',
    storagePath: '/x/Attach_TOR_1.pdf',
    sizeBytes: 1,
    pages: 1,
    contentHash: 'h1',
    documentType: 'SCANNED_PAPER_PDF',
  };

  const { torChanged } = applyPackage(tor, { package: draft, tor: file });

  assert.equal(torChanged, true);
  assert.equal(tor.agency, 'สำนักงานจากฟีด');
  assert.equal(tor.referencePriceTHB, 1_000_000);
  assert.equal(tor.submissionDeadline.toISOString(), '2026-10-19T05:00:00.000Z');
  assert.equal(tor.document.version, 1, 'the first TOR is version 1');
});

test('download step: a TOR split over files is kept as all its parts, in order', async () => {
  const zip = zipOf({
    'annoudoc_1300400000_55555000001.pdf': await fs.readFile(ANNOUNCEMENT_PDF),
    'Attach_TOR_2.pdf': '%PDF-1.4 the TOR itself, the larger part',
    'Attach_TOR_1.pdf': '%PDF-1.4 an attachment',
    'price adjustment.pdf': '%PDF-1.4 a construction form',
  });
  egpServes({ current: 'zip-parts', zips: { 'zip-parts': zip } });

  await run();

  const { document, packages } = await torOf();
  assert.deepEqual(document.parts.map((part) => part.fileName), ['Attach_TOR_1.pdf', 'Attach_TOR_2.pdf']);
  assert.equal(document.storagePath, document.parts[0].storagePath);
  // The hash covers both parts, so a change to either is a changed TOR
  assert.notEqual(document.contentHash, document.parts[0].contentHash);
  assert.deepEqual(
    packages[0].files.map((file) => file.role).sort(),
    ['announcement', 'tor', 'tor'],
    'the price-adjustment form is not kept',
  );
});

test('readTorParts: a TOR in several files reads as one document, a preview spending its pages in order', async () => {
  const pages = { 'a.pdf': 4, 'b.pdf': 5, 'c.pdf': 3 };
  const reads = [];
  const fakeOcr = async (storagePath, options) => {
    reads.push([storagePath, options.maxPages ?? null]);
    const total = pages[storagePath];
    const pagesRead = Math.min(total, options.maxPages ?? total);
    return { text: `ข้อความ ${storagePath}`, pages: total, pagesRead, usedOcr: true, confidence: 0.8, truncated: pagesRead < total };
  };
  const parts = Object.entries(pages).map(([storagePath, count]) => ({ storagePath, fileName: storagePath, pages: count }));

  const preview = await readTorParts(parts, { maxPages: 6 }, fakeOcr);
  assert.deepEqual(reads, [['a.pdf', 6], ['b.pdf', 2]], 'c.pdf is left for the full read');
  assert.deepEqual([preview.pages, preview.pagesRead, preview.truncated], [12, 6, true]);
  assert.equal(isPreviewRead(preview), true);
  assert.match(preview.text, /^=== a\.pdf ===\nข้อความ a\.pdf\n\n=== b\.pdf ===/);

  reads.length = 0;
  const whole = await readTorParts(parts, {}, fakeOcr);
  assert.deepEqual(reads, [['a.pdf', null], ['b.pdf', null], ['c.pdf', null]]);
  assert.deepEqual([whole.pages, whole.pagesRead, whole.truncated], [12, 12, false]);
  assert.equal(isPreviewRead(whole), false);
  assert.equal(whole.confidence, 0.8);
});

/* ----------------------- a project found by hand (ingest:add) ----------------------- */

const FOUND_BY_HAND = '55555000099';

test('download step: --id for a project not in the database adds no placeholder', async () => {
  const get = egpServes({ current: 'zip-d0', zips: { 'zip-d0': await invitation() } });

  assert.equal(await run({ id: FOUND_BY_HAND }), 0);

  assert.equal(await Tor.exists({ projectId: FOUND_BY_HAND }), null, 'no "Project X" with a default status');
  assert.equal(get.mock.callCount(), 0);
});

test('ingest:add builds the record from e-GP: title, agency, stage and posting date from its announcement', async () => {
  egpServes({ current: 'zip-d0', zips: { 'zip-d0': await invitation() } });

  const tor = await runAddStep({ id: FOUND_BY_HAND, documentsDir, download, downloadPrice });

  const saved = await Tor.findOne({ projectId: FOUND_BY_HAND }).lean();
  assert.equal(saved.source, 'manual');
  assert.match(saved.title, /^ประกวดราคาจ้างบำรุงรักษาเครื่องคอมพิวเตอร์แม่ข่าย .* ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ \(e-bidding\)$/);
  assert.equal(saved.procurementMethod, 'ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)');
  assert.equal(saved.procurementKind, 'hire');
  assert.equal(saved.agency, 'กรมการค้าภายใน');
  // Not marked ร่าง: an invitation, Open, posted the day its announcement says
  assert.equal(saved.status, 'Open');
  assert.equal(saved.announcementHistory[0].code, 'D0');
  assert.equal(saved.announcementHistory[0].publishedAt.toISOString().slice(0, 10), '2026-10-07');
  assert.equal(saved.referencePriceTHB, 1_290_420);
  assert.equal(saved.pipelineStatus, 'downloaded', 'ready for OCR');
  assert.ok(saved.priceCheckedAt);
  assert.equal(tor.projectId, FOUND_BY_HAND);

  // Added once: a second add refuses, and leaves it as it is
  assert.equal(await runAddStep({ id: FOUND_BY_HAND, documentsDir, download, downloadPrice }), null);
  await Tor.deleteOne({ projectId: FOUND_BY_HAND });
});

/* --------------------------- the price form (ADR 0023) --------------------------- */

const pricePackage = () => zipOf({ 'pB0.pdf': '%PDF-1.4 a scanned price form' });

test("download step: the price form's budget is read from its words, its ราคากลาง checked", async () => {
  priceFormOcr = await priceFormFixture('69109062251'); // digits garbled, words right
  egpServes({ current: 'zip-d0', price: 'zip-price', zips: { 'zip-d0': await invitation(), 'zip-price': pricePackage() } });

  await run();

  const tor = await torOf();
  assert.equal(tor.budgetTHB, 1_194_600, 'from the words: OCR read the digits as ๑,๑๕๕,๒๐๐');
  assert.equal(tor.referencePriceTHB, 1_290_420);
  assert.ok(tor.priceCheckedAt);
  const price = tor.packages.find((pkg) => pkg.kind === 'price');
  assert.equal(price.files[0].role, 'price-form');
  assert.equal(price.facts.budgetTHB.document, 'price-form');
  assert.match(price.facts.budgetTHB.quote, /^วงเงินงบประมาณที่ได้รับจัดสรร .*บาทถ้วน \)$/);
  assert.deepEqual(price.problems, [], 'the form and the announcement agree on ราคากลาง');
});

test("download step: a price form's ราคากลาง that differs from the announcement's is noted, not used", async () => {
  priceFormOcr = await priceFormFixture('69099683466'); // ราคากลาง 4,916,650; the announcement says 1,290,420
  egpServes({ current: 'zip-d0', price: 'zip-price', zips: { 'zip-d0': await invitation(), 'zip-price': pricePackage() } });

  await run();

  const tor = await torOf();
  assert.equal(tor.referencePriceTHB, 1_290_420, "the announcement's real text stands");
  assert.equal(tor.budgetTHB, 4_917_700);
  const price = tor.packages.find((pkg) => pkg.kind === 'price');
  assert.match(price.problems[0], /^ราคากลาง: the price form says 4,916,650, the announcement 1,290,420/);
});

test('download step: a project with no price package is asked once, and again at a new stage', async () => {
  const get = egpServes({ current: 'zip-d0', zips: { 'zip-d0': await invitation() } });
  await run();
  const asked = () => get.mock.calls.filter((call) => call.arguments[0].includes('infoDocPriceestZipHis')).length;
  assert.equal(asked(), 1);
  assert.ok((await torOf()).priceCheckedAt, 'asked, and found none');

  await run();
  assert.equal(asked(), 1, 'not asked again for nothing');

  await Tor.updateOne({ projectId: PROJECT }, { packageCheckNeeded: true });
  await run();
  assert.equal(asked(), 2, 'a new stage may bring a price package');
});

test('applyPricePackage: the form fills in ราคากลาง only where the announcement gave none', () => {
  const tor = new Tor({ projectId: PROJECT, source: 'process3', title: 'จ้างพัฒนาระบบ' });
  const quoted = (value) => ({ value, quote: `(${value})`, document: 'price-form' });
  applyPricePackage(tor, {
    kind: 'price',
    zipId: 'zip-price',
    files: [],
    facts: { budgetTHB: quoted(4_917_700), referencePriceTHB: quoted(4_916_650) },
    problems: [],
  });
  assert.equal(tor.budgetTHB, 4_917_700);
  assert.equal(tor.referencePriceTHB, 4_916_650, 'the announcement left it blank');
});
