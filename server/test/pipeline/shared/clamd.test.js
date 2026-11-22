import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { after, test } from 'node:test';
import {
  MAX_STREAM_BYTES,
  clamdConfig,
  eicarTestString,
  pingClamd,
  readScanReply,
  scanBuffer,
} from '#pipeline/shared/clamd.js';

/**
 * A stand-in for clamd on a free port: it reads one command, and for INSTREAM
 * every chunk up to the zero length, then answers with `reply` (or with
 * nothing, when `reply` is null). What it received is kept for the test.
 */
async function fakeClamd(reply, { closeAfter = null } = {}) {
  const received = [];
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    const seen = { command: null, chunks: [], ended: false };
    received.push(seen);
    socket.on('error', () => {});
    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);
      if (seen.command === null) {
        const end = buffer.indexOf(0);
        if (end === -1) return;
        seen.command = buffer.subarray(0, end).toString('latin1');
        buffer = buffer.subarray(end + 1);
        if (seen.command === 'zPING') {
          if (reply !== null) socket.end('PONG\0');
          return;
        }
      }
      // <4-byte big-endian length><data>, until a zero length
      while (!seen.ended && buffer.length >= 4) {
        const length = buffer.readUInt32BE(0);
        if (length === 0) {
          seen.ended = true;
          if (reply !== null) socket.end(`${reply}\0`);
          return;
        }
        if (buffer.length < 4 + length) return;
        seen.chunks.push(buffer.subarray(4, 4 + length));
        buffer = buffer.subarray(4 + length);
        const total = seen.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        // As clamd does past StreamMaxLength: answer, then close with our
        // bytes still arriving, which resets the connection
        if (closeAfter !== null && total > closeAfter) {
          seen.ended = true;
          socket.write('INSTREAM size limit exceeded. ERROR\0', () => socket.destroy());
          return;
        }
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return { config: { host: '127.0.0.1', port: server.address().port, timeoutMs: 2000 }, received };
}

const servers = [];
after(() => Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve)))));

test('scanBuffer: sends INSTREAM in length-prefixed chunks, ended by a zero length', async () => {
  const { config, received } = await fakeClamd('stream: OK');
  // Past one 64 KB chunk, so the framing is used more than once
  const bytes = Buffer.alloc(150 * 1024, 7);
  bytes.write('%PDF-1.7', 0, 'latin1');

  assert.deepEqual(await scanBuffer(bytes, config), { result: 'clean' });
  const [seen] = received;
  assert.equal(seen.command, 'zINSTREAM');
  assert.ok(seen.chunks.length >= 3, 'more than one chunk');
  assert.ok(seen.chunks.every((chunk) => chunk.length <= 64 * 1024));
  assert.ok(Buffer.concat(seen.chunks).equals(bytes), 'clamd got exactly the bytes');
  assert.equal(seen.ended, true);
});

test('scanBuffer: a signature found is infected, with its name', async () => {
  const { config } = await fakeClamd('stream: Win.Test.EICAR_HDB-1 FOUND');
  assert.deepEqual(await scanBuffer(eicarTestString(), config), { result: 'infected', signature: 'Win.Test.EICAR_HDB-1' });
});

test('scanBuffer: content past clamd limits is never clean, and never called a virus', async () => {
  // AlertExceedsMax names what it skipped
  const exceeded = await fakeClamd('stream: Heuristics.Limits.Exceeded.MaxFileSize FOUND');
  assert.deepEqual(await scanBuffer(Buffer.from('%PDF-1.4'), exceeded.config), { result: 'unscanned', reason: 'too-large' });

  // Past the stream limit, nothing is sent at all
  const { config, received } = await fakeClamd('stream: OK');
  assert.deepEqual(await scanBuffer(Buffer.alloc(1025), { ...config, maxStreamBytes: 1024 }), { result: 'unscanned', reason: 'too-large' });
  assert.equal(received.length, 0, 'never connected');

  // A clamd set lower than MAX_STREAM_BYTES hangs up mid-stream. Whether its
  // answer or the reset arrives first depends on the network stack (on
  // Windows, the reset usually wins); either way the file is not clean.
  const cut = await fakeClamd('stream: OK', { closeAfter: 64 * 1024 });
  const verdict = await scanBuffer(Buffer.alloc(512 * 1024), cut.config);
  assert.equal(verdict.result, 'unscanned');
  assert.ok(['too-large', 'error'].includes(verdict.reason), verdict.reason);
});

test('MAX_STREAM_BYTES matches the StreamMaxLength and MaxFileSize docker-compose.yml gives clamd', async () => {
  const compose = await fs.readFile(path.join(import.meta.dirname, '..', '..', '..', '..', 'docker-compose.yml'), 'utf8');
  const megabytes = (name) => Number(new RegExp(`CLAMD_CONF_${name}: (\\d+)M\\b`).exec(compose)?.[1]);
  // clamd's M is 1024 * 1024 bytes
  assert.equal(megabytes('StreamMaxLength') * 1024 * 1024, MAX_STREAM_BYTES);
  assert.equal(megabytes('MaxFileSize') * 1024 * 1024, MAX_STREAM_BYTES);
  assert.match(compose, /CLAMD_CONF_AlertExceedsMax: "yes"/, 'content past the limits is flagged, not passed');
});

test('scanBuffer: no clamd, a silent one, or an error is unscanned, never clean, and never throws', async () => {
  // Nothing listening: a port that was free a moment ago
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const freePort = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const unreachable = await scanBuffer(Buffer.from('x'), { host: '127.0.0.1', port: freePort, timeoutMs: 2000 });
  assert.deepEqual(unreachable, { result: 'unscanned', reason: 'unreachable' });

  const silent = await fakeClamd(null);
  assert.deepEqual(await scanBuffer(Buffer.from('x'), { ...silent.config, timeoutMs: 200 }), { result: 'unscanned', reason: 'timeout' });

  const failing = await fakeClamd("Can't allocate memory ERROR");
  assert.deepEqual(await scanBuffer(Buffer.from('x'), failing.config), { result: 'unscanned', reason: 'error' });
});

test('readScanReply: a signature name is text from outside, kept only when plain', () => {
  assert.deepEqual(readScanReply('stream: Pdf.Exploit.CVE_2024_4367-1 FOUND'), {
    result: 'infected',
    signature: 'Pdf.Exploit.CVE_2024_4367-1',
  });
  for (const odd of ['bad\x1b[31mname', 'two words', 'x'.repeat(201)]) {
    assert.deepEqual(readScanReply(`stream: ${odd} FOUND`), { result: 'infected', signature: 'unreadable' }, odd);
  }
  assert.deepEqual(readScanReply('something else entirely'), { result: 'unscanned', reason: 'error' });
});

test('pingClamd: PONG is up; anything else is down', async () => {
  const { config, received } = await fakeClamd('stream: OK');
  assert.equal(await pingClamd(config), true);
  assert.equal(received[0].command, 'zPING');

  const silent = await fakeClamd(null);
  assert.equal(await pingClamd({ ...silent.config, timeoutMs: 200 }), false);
});

test('clamdConfig: no CLAMD_HOST is no scanner; a value set wrong is an error, not "no scanner"', () => {
  assert.equal(clamdConfig({}), null);
  assert.equal(clamdConfig({ CLAMD_HOST: '  ' }), null);
  assert.deepEqual(clamdConfig({ CLAMD_HOST: 'clamav' }), { host: 'clamav', port: 3310, timeoutMs: 120000 });
  assert.deepEqual(clamdConfig({ CLAMD_HOST: '127.0.0.1', CLAMD_PORT: '13310', CLAMD_TIMEOUT_MS: '5000' }), {
    host: '127.0.0.1',
    port: 13310,
    timeoutMs: 5000,
  });
  for (const [name, value] of [['CLAMD_PORT', '0'], ['CLAMD_PORT', '70000'], ['CLAMD_PORT', 'abc'], ['CLAMD_TIMEOUT_MS', '1.5']]) {
    assert.throws(() => clamdConfig({ CLAMD_HOST: 'clamav', [name]: value }), new RegExp(name));
  }
});

test('eicarTestString: the standard 68-byte test string, built only in memory', () => {
  const eicar = eicarTestString();
  assert.equal(eicar.length, 68);
  assert.ok(eicar.toString('latin1').startsWith('X5O!P%@AP'));
  assert.ok(eicar.toString('latin1').endsWith('$H+H*'));
});
