import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';
import { Tor } from '#models/index.js';
import { runScanStep } from '#pipeline/ingestion/ingest.js';

// A database of its own: the rescan reads every TOR with a stored file
const TEST_DB = 'mjolnir_test_scan_step';
const PROJECT = '55555000077';

let documentsDir;

before(async () => {
  await connectDatabase({ dbName: TEST_DB });
  documentsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gipdp-scan-'));
});

beforeEach(async () => {
  await Tor.deleteMany({});
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDatabase();
  await fs.rm(documentsDir, { recursive: true, force: true });
});

async function store(relativePath, content) {
  const filePath = path.join(documentsDir, PROJECT, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  return filePath;
}

/** A TOR whose package holds `files`, its TOR (the first) recorded as its document too. */
const torWith = (files) =>
  Tor.create({
    projectId: PROJECT,
    source: 'process3',
    title: 'จ้างพัฒนาระบบ',
    packages: [{ zipId: 'a'.repeat(32), kind: 'announcement', files }],
    document: { fileName: files[0].fileName, storagePath: files[0].storagePath, scan: files[0].scan ?? null },
  });
const torOf = () => Tor.findOne({ projectId: PROJECT }).lean();

/** A scanner that records what it was given and answers by content. */
function scanner(answer = () => ({ result: 'clean' })) {
  const seen = [];
  const scan = async (data) => {
    seen.push(data.toString('latin1'));
    return answer(data.toString('latin1'));
  };
  return { scan, seen };
}
const quiet = (t) => t.mock.method(console, 'warn', () => {});

test('scan step: a file kept before files were scanned is scanned, and every record of it says clean', async () => {
  const torPath = await store('pkg/tor.pdf', '%PDF-1.4 the TOR');
  const annexPath = await store('pkg/boq.xlsx', Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  await torWith([
    { role: 'tor', fileName: 'tor.pdf', storagePath: torPath },
    { role: 'other', fileName: 'boq.xlsx', storagePath: annexPath },
  ]);
  const { scan, seen } = scanner();
  const now = new Date('2026-11-22T12:00:00Z');

  const totals = await runScanStep({ documentsDir, scan, now });

  assert.equal(seen.length, 2, 'each file once, though the TOR has two records');
  assert.equal(totals.clean, 2);
  const tor = await torOf();
  assert.deepEqual(
    tor.packages[0].files.map((file) => file.scan.result),
    ['clean', 'clean'],
  );
  assert.equal(tor.document.scan.result, 'clean');
  assert.equal(tor.document.scan.scannedAt.toISOString(), now.toISOString());
});

test('scan step: a flagged file is deleted, and every record of it says what ClamAV found', async (t) => {
  quiet(t);
  const torPath = await store('pkg/tor.pdf', '%PDF-1.4 FLAG-ME');
  await torWith([{ role: 'tor', fileName: 'tor.pdf', storagePath: torPath }]);
  const { scan } = scanner((text) =>
    text.includes('FLAG-ME') ? { result: 'infected', signature: 'Pdf.Exploit.Test-1' } : { result: 'clean' },
  );

  const totals = await runScanStep({ documentsDir, scan });

  assert.equal(totals.infected, 1);
  assert.equal(existsSync(torPath), false, 'the bytes are gone');
  const tor = await torOf();
  for (const record of [tor.packages[0].files[0], tor.document]) {
    assert.equal(record.scan.result, 'infected');
    assert.equal(record.scan.signature, 'Pdf.Exploit.Test-1');
  }
  assert.equal(tor.document.storagePath, torPath, 'the record stays, so the preview can say it was blocked');
});

test('scan step: a file whose bytes are not its type is recorded, kept on disk, and never scanned', async (t) => {
  quiet(t);
  const fakePath = await store('pkg/tor.pdf', 'MZ an executable');
  await torWith([{ role: 'tor', fileName: 'tor.pdf', storagePath: fakePath }]);
  const { scan, seen } = scanner();

  const totals = await runScanStep({ documentsDir, scan });

  assert.equal(totals.wrongType, 1);
  assert.equal(seen.length, 0);
  assert.equal(existsSync(fakePath), true);
  assert.equal((await torOf()).document.scan.result, 'wrong-type');
});

test('scan step: settled files are left alone, unless --all asks for today\'s signatures', async () => {
  const cleanPath = await store('pkg/tor.pdf', '%PDF-1.4 already clean');
  const earlier = { result: 'clean', signature: null, scannedAt: new Date('2026-11-01T00:00:00Z') };
  await torWith([{ role: 'tor', fileName: 'tor.pdf', storagePath: cleanPath, scan: earlier }]);

  const first = scanner();
  await runScanStep({ documentsDir, scan: first.scan });
  assert.equal(first.seen.length, 0);

  const again = scanner();
  const now = new Date('2026-11-22T12:00:00Z');
  await runScanStep({ documentsDir, scan: again.scan, all: true, now });
  assert.equal(again.seen.length, 1);
  assert.equal((await torOf()).document.scan.scannedAt.toISOString(), now.toISOString());
});

test('scan step: a recorded path outside the documents folder is never opened', async (t) => {
  quiet(t);
  const outside = path.join(os.tmpdir(), `gipdp-scan-outside-${process.pid}.pdf`);
  await fs.writeFile(outside, '%PDF-1.4 NOT OURS');
  await torWith([{ role: 'tor', fileName: 'outside.pdf', storagePath: outside }]);
  const { scan, seen } = scanner();

  try {
    const totals = await runScanStep({ documentsDir, scan });
    assert.equal(seen.length, 0);
    assert.equal(totals.missing, 1);
    assert.equal((await torOf()).document.scan, null, 'nothing recorded about it');
  } finally {
    await fs.unlink(outside).catch(() => {});
  }
});

test('scan step: too large to scan is recorded as unscanned; a scanner that goes away stops the step', async (t) => {
  quiet(t);
  const bigPath = await store('pkg/big.pdf', '%PDF-1.4 BIG');
  const nextPath = await store('pkg/next.pdf', '%PDF-1.4 NEXT');
  await torWith([
    { role: 'tor', fileName: 'big.pdf', storagePath: bigPath },
    { role: 'other', fileName: 'next.pdf', storagePath: nextPath },
  ]);

  const tooLarge = scanner((text) => (text.includes('BIG') ? { result: 'unscanned', reason: 'too-large' } : { result: 'clean' }));
  const totals = await runScanStep({ documentsDir, scan: tooLarge.scan });
  assert.equal(totals.tooLarge, 1);
  let tor = await torOf();
  assert.equal(tor.packages[0].files[0].scan.result, 'unscanned', 'never served');
  assert.equal(tor.packages[0].files[1].scan.result, 'clean');

  await Tor.updateOne({ projectId: PROJECT }, { $set: { 'packages.0.files.1.scan': null } });
  const gone = scanner(() => ({ result: 'unscanned', reason: 'unreachable' }));
  const stopped = await runScanStep({ documentsDir, scan: gone.scan });
  assert.equal(stopped.stoppedBy, 'no-answer');
  tor = await torOf();
  assert.equal(tor.packages[0].files[1].scan, null, 'nothing recorded for a file it could not scan');
});

test('scan step: with no scanner, or one that does not answer, nothing is read', async (t) => {
  quiet(t);
  const torPath = await store('pkg/tor.pdf', '%PDF-1.4 the TOR');
  await torWith([{ role: 'tor', fileName: 'tor.pdf', storagePath: torPath }]);

  assert.equal((await runScanStep({ documentsDir, config: null })).stoppedBy, 'no-scanner');
  const config = { host: '127.0.0.1', port: 3310, timeoutMs: 100 };
  assert.equal((await runScanStep({ documentsDir, config, ping: async () => false })).stoppedBy, 'no-answer');
  assert.equal((await torOf()).document.scan, null);
});

test('scan step: the self-test sends the EICAR test string and needs it flagged', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const matching = scanner((text) =>
    text.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE') ? { result: 'infected', signature: 'Win.Test.EICAR_HDB-1' } : { result: 'clean' },
  );
  assert.equal((await runScanStep({ documentsDir, scan: matching.scan, selfTest: true })).selfTest, true);
  assert.equal(matching.seen.length, 1, 'the test string only: no stored file is read');

  const blind = scanner();
  assert.equal((await runScanStep({ documentsDir, scan: blind.scan, selfTest: true })).selfTest, false);
});

/**
 * A clamd that answers PING, and flags a stream holding the EICAR string when
 * `matching` (otherwise it answers OK, as a clamd with no signatures would).
 */
async function fakeClamd({ matching }) {
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on('error', () => {});
    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);
      if (buffer.toString('latin1').startsWith('zPING\0')) return socket.end('PONG\0');
      // The stream ends with a zero length: four zero bytes
      if (buffer.length > 14 && buffer.subarray(-4).equals(Buffer.alloc(4))) {
        const found = matching && buffer.includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE');
        socket.end(found ? 'stream: Win.Test.EICAR_HDB-1 FOUND\0' : 'stream: OK\0');
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

/** Runs `npm run ingest:scan -- --self-test` as a deploy would, with nothing listening for MongoDB. */
function runSelfTestCli(clamdPort) {
  const ingest = path.join(import.meta.dirname, '..', '..', '..', 'src', 'pipeline', 'ingestion', 'ingest.js');
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [ingest, '--step', 'scan', '--self-test'],
      {
        cwd: path.join(import.meta.dirname, '..', '..', '..'),
        env: {
          ...process.env,
          // Port 1: any attempt to connect fails within two seconds
          MONGO_URI: 'mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=2000',
          CLAMD_HOST: '127.0.0.1',
          CLAMD_PORT: String(clamdPort),
          DOCUMENTS_DIR: documentsDir,
        },
        timeout: 30_000,
      },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout, stderr }),
    );
  });
}

test('scan step: the self-test never touches the database, so it is safe on any machine', async () => {
  const matching = await fakeClamd({ matching: true });
  try {
    const run = await runSelfTestCli(matching.address().port);
    assert.equal(run.code, 0, run.stderr);
    assert.match(run.stdout, /scanning works/);
    assert.doesNotMatch(run.stdout + run.stderr, /Mongo|ECONNREFUSED/i, 'no connection was attempted');
  } finally {
    await new Promise((resolve) => matching.close(resolve));
  }

  // A clamd that answers but matches nothing fails the check
  const blind = await fakeClamd({ matching: false });
  try {
    const run = await runSelfTestCli(blind.address().port);
    assert.equal(run.code, 1);
    assert.match(run.stderr, /not matching signatures/);
  } finally {
    await new Promise((resolve) => blind.close(resolve));
  }
});
