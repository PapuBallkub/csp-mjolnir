import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

// In production a 500 says "Internal server error" and nothing more, so a
// failure never shows the client a collection name, a query or a stack
// (deployment-checklist.md §1). The switch is isProduction, which env.js reads
// once at import, so each case builds the real app in a fresh process. It runs
// in the temp folder, where dotenv finds no .env, and never connects to a
// database: nobody's real server/.env or records are touched.
const here = path.dirname(fileURLToPath(import.meta.url));
const APP_MODULE = pathToFileURL(path.join(here, '../src/app.js')).href;
const MONGOOSE_MODULE = pathToFileURL(createRequire(import.meta.url).resolve('mongoose')).href;

// With no connection, a query waits in Mongoose's buffer and then fails with a
// plain Error: no status of its own, the kind the error handler turns into a 500.
const CHILD = `
const mongoose = (await import(${JSON.stringify(MONGOOSE_MODULE)})).default;
mongoose.set('bufferTimeoutMS', 200);
const { createApp } = await import(${JSON.stringify(APP_MODULE)});
const server = createApp().listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const res = await fetch('http://127.0.0.1:' + server.address().port + '/api/tors');
console.log('RESULT ' + JSON.stringify({ status: res.status, body: await res.json() }));
process.exit(0);
`;

function failTorsRequest(nodeEnv) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD], {
    cwd: os.tmpdir(),
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      NODE_ENV: nodeEnv,
      CORS_ORIGIN: 'https://gipdp.example.com',
      MONGO_URI: 'mongodb://127.0.0.1:1/never-connected',
      JWT_SECRET: 'test-not-a-secret-test-not-a-secret',
      PASSWORD_PEPPER: 'test-not-a-pepper-test-not-a-pepper',
      // Windows needs it to start a process at all
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    },
  });
  // dotenv prints a line of its own on stdout, so look for ours
  const line = result.stdout.split('\n').find((l) => l.startsWith('RESULT '));
  assert.ok(line, `the app never answered (exit ${result.status}):\n${result.stderr}`);
  return { ...JSON.parse(line.slice('RESULT '.length)), stderr: result.stderr };
}

test('a 500 in production says "Internal server error" and nothing more', () => {
  const { status, body } = failTorsRequest('production');
  assert.equal(status, 500);
  assert.deepEqual(body, { error: { message: 'Internal server error' } });
});

test('the 500 the client never sees the cause of is logged on stderr as one JSON line, with its stack (ADR 0043)', () => {
  const { stderr } = failTorsRequest('production');
  const logged = stderr
    .split('\n')
    .filter((l) => l.startsWith('{'))
    .map((l) => JSON.parse(l))
    .find((entry) => entry.event === 'server.error');

  assert.ok(logged, `no server.error line on stderr:\n${stderr}`);
  assert.equal(logged.severity, 'ERROR');
  assert.equal(logged.status, 500);
  assert.equal(logged.method, 'GET');
  assert.equal(logged.path, '/api/tors');
  assert.match(logged.message, /buffering timed out/);
  assert.match(logged.message, /\n {4}at /, 'the stack is inside the one line');
});

test('a 500 in development shows the real error, so the production case is the flag at work', () => {
  const { status, body } = failTorsRequest('development');
  assert.equal(status, 500);
  assert.match(body.error.message, /buffering timed out/);
});
