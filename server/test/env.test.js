import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

// env.js reads the environment once, at import, so each case loads it in a
// fresh process. It runs in the temp folder, where dotenv finds no .env, and
// gets only the variables named here: nobody's real server/.env leaks in.
const ENV_MODULE = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/common/config/env.js'),
).href;

function loadConfig(jwtSecret) {
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `await import(${JSON.stringify(ENV_MODULE)});`],
    {
      cwd: os.tmpdir(),
      encoding: 'utf8',
      env: {
        MONGO_URI: 'mongodb://127.0.0.1:1/never-connected',
        JWT_SECRET: jwtSecret,
        // Windows needs it to start a process at all
        ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      },
    },
  );
  return { ok: result.status === 0, stderr: result.stderr };
}

test('JWT_SECRET: the server refuses one shorter than 32 bytes, and says why', () => {
  const short = 'a'.repeat(31);
  const { ok, stderr } = loadConfig(short);
  assert.equal(ok, false);
  // The message line alone: the stack trace below it has line numbers
  const message = stderr.split('\n').find((line) => line.includes('JWT_SECRET is too short')) ?? '';
  assert.match(message, /JWT_SECRET is too short: it must be at least 32 bytes/);
  assert.ok(!stderr.includes(short), 'the error never shows the value');
  assert.ok(!/\b31\b/.test(message), 'nor its length');
});

test('JWT_SECRET: 32 bytes is enough', () => {
  assert.equal(loadConfig('a'.repeat(32)).ok, true);
});

test('JWT_SECRET: the minimum counts bytes, not characters', () => {
  // 11 Thai characters are 33 bytes in UTF-8; 10 are 30
  assert.equal(loadConfig('ก'.repeat(11)).ok, true);
  assert.equal(loadConfig('ก'.repeat(10)).ok, false);
});
