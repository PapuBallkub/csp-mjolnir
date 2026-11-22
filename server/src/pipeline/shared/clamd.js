/**
 * server/src/pipeline/shared/clamd.js
 *
 * Asks ClamAV's daemon, clamd, whether a file is known to be malicious, so a
 * file from e-GP is never kept, parsed or served before it has been scanned.
 * It speaks clamd's INSTREAM command over TCP (clamd(8)): the bytes go in
 * chunks, each after its length as 4 bytes big-endian, and a zero length ends
 * them. Node's net module is all that takes.
 *
 * clamd's TCP port has no authentication and no encryption, so it listens on
 * the compose network or on loopback, never on a public address.
 */

import net from 'node:net';

const CHUNK_BYTES = 64 * 1024;
// The most clamd takes in one stream: docker-compose.yml sets its
// StreamMaxLength to the same (a test checks the two agree). Past it, clamd
// answers and hangs up while we're still writing, and the reset can arrive
// before the answer, so a larger file is called too large here, unsent.
export const MAX_STREAM_BYTES = 200 * 1024 * 1024;
const DEFAULT_PORT = 3310;
// clamd's own ReadTimeout: longer than that, and clamd has given up already
const DEFAULT_TIMEOUT_MS = 120_000;
const PING_TIMEOUT_MS = 10_000;
// A reply is one short line; anything longer isn't clamd
const MAX_REPLY_CHARS = 4096;

// A signature name is text from outside: kept only if it's plain and short
const READABLE_SIGNATURE = /^[\x21-\x7E]{1,200}$/;

/**
 * Where clamd is, from CLAMD_HOST, CLAMD_PORT and CLAMD_TIMEOUT_MS. Null when
 * CLAMD_HOST is unset: this machine has no scanner.
 *
 * @param {object} [env]
 * @returns {{ host: string, port: number, timeoutMs: number } | null}
 * @throws {Error} When a value is set but unusable, so a typo never reads as "no scanner"
 */
export function clamdConfig(env = process.env) {
  const host = (env.CLAMD_HOST ?? '').trim();
  if (!host) return null;
  return {
    host,
    port: wholeNumber(env, 'CLAMD_PORT', DEFAULT_PORT, 65535),
    timeoutMs: wholeNumber(env, 'CLAMD_TIMEOUT_MS', DEFAULT_TIMEOUT_MS),
  };
}

function wholeNumber(env, name, fallback, max = Number.MAX_SAFE_INTEGER) {
  const raw = (env[name] ?? '').trim();
  if (raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be a whole number from 1 to ${max}, not "${raw}".`);
  }
  return value;
}

/**
 * What clamd's reply to INSTREAM means.
 *
 * @param {string} reply - Without its terminating NUL
 * @returns {{ result: 'clean' }
 *   | { result: 'infected', signature: string }
 *   | { result: 'unscanned', reason: 'too-large' | 'error' }}
 */
export function readScanReply(reply) {
  const line = String(reply).trim();
  if (line === 'stream: OK') return { result: 'clean' };

  const found = /^stream: (.+) FOUND$/.exec(line);
  if (found) {
    // With AlertExceedsMax, content past MaxFileSize or MaxScanSize is
    // reported under this name: not scanned, so never clean, and not a virus
    if (found[1].startsWith('Heuristics.Limits.Exceeded')) return { result: 'unscanned', reason: 'too-large' };
    return { result: 'infected', signature: READABLE_SIGNATURE.test(found[1]) ? found[1] : 'unreadable' };
  }

  // Past StreamMaxLength: "INSTREAM size limit exceeded. ERROR"
  if (/size limit exceeded/i.test(line)) return { result: 'unscanned', reason: 'too-large' };
  return { result: 'unscanned', reason: 'error' };
}

/**
 * Sends one command, and for INSTREAM the bytes, then reads clamd's one-line
 * reply. Never rejects.
 *
 * @returns {Promise<{ reply: string } | { failure: 'unreachable' | 'timeout' | 'error' }>}
 */
function exchange({ host, port, timeoutMs }, command, body = null) {
  return new Promise((resolve) => {
    let reply = '';
    let connected = false;
    let settled = false;

    const socket = net.connect({ host, port });
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(outcome);
    };
    const timer = setTimeout(() => finish({ failure: 'timeout' }), timeoutMs);

    // Waits when the socket's buffer is full, so a 200 MB file isn't queued in memory twice
    const write = (chunk) =>
      new Promise((done) => {
        if (socket.write(chunk)) done();
        else socket.once('drain', done);
      });

    socket.on('connect', async () => {
      connected = true;
      await write(Buffer.from(command, 'latin1'));
      if (!body) return;
      for (let offset = 0; offset < body.length && !settled; offset += CHUNK_BYTES) {
        const chunk = body.subarray(offset, offset + CHUNK_BYTES);
        const length = Buffer.alloc(4);
        length.writeUInt32BE(chunk.length);
        await write(length);
        await write(chunk);
      }
      if (!settled) await write(Buffer.alloc(4));
    });

    socket.on('data', (data) => {
      reply += data.toString('latin1');
      const end = reply.indexOf('\0');
      if (end !== -1) finish({ reply: reply.slice(0, end) });
      else if (reply.length > MAX_REPLY_CHARS) finish({ failure: 'error' });
    });

    // clamd closes the connection after its reply, and also when a stream
    // passes StreamMaxLength, often while we're still writing. A reply that
    // came first says why; the write error that follows doesn't.
    socket.on('end', () => finish(reply ? { reply } : { failure: 'error' }));
    socket.on('error', () => finish(reply ? { reply } : { failure: connected ? 'error' : 'unreachable' }));
  });
}

/**
 * Scans bytes held in memory: nothing is written to disk for clamd to read.
 *
 * @param {Buffer} buffer
 * @param {{ host: string, port: number, timeoutMs: number, maxStreamBytes?: number }} config -
 *   From clamdConfig; `maxStreamBytes` only in tests
 * @returns {Promise<{ result: 'clean' }
 *   | { result: 'infected', signature: string }
 *   | { result: 'unscanned', reason: 'too-large' | 'unreachable' | 'timeout' | 'error' }>}
 *   Never rejects.
 */
export async function scanBuffer(buffer, config) {
  if (buffer.length > (config.maxStreamBytes ?? MAX_STREAM_BYTES)) return { result: 'unscanned', reason: 'too-large' };
  const outcome = await exchange(config, 'zINSTREAM\0', buffer);
  if (outcome.failure) return { result: 'unscanned', reason: outcome.failure };
  return readScanReply(outcome.reply);
}

/** Whether clamd answers at all: PING, and PONG back. */
export async function pingClamd(config) {
  const outcome = await exchange({ ...config, timeoutMs: Math.min(config.timeoutMs, PING_TIMEOUT_MS) }, 'zPING\0');
  return outcome.reply?.trim() === 'PONG';
}

/** A scanner for the pipeline: bytes in, a scanBuffer result out. */
export const clamdScanner = (config) => (buffer) => scanBuffer(buffer, config);

/**
 * The EICAR test string, which every antivirus reports and which is harmless:
 * it proves clamd is up and matching signatures. Built from pieces here, so
 * the source file isn't itself reported (and quarantined) by a developer's
 * own antivirus; it exists only in memory, on its way to clamd.
 */
export function eicarTestString() {
  return Buffer.from(['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR-STANDARD-ANTIVIRUS-TEST', '-FILE!$H+H*'].join(''), 'latin1');
}
