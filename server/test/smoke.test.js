// Boots the real app against a real database and checks it answers. The point
// is not coverage — it is that CI fails when the wiring breaks: a bad subpath
// import, a router that stops mounting, a model that will not register.
//
// CI points MONGO_URI at a throwaway mongo service container. Running this
// locally uses whatever is in server/.env, which is the shared Atlas cluster,
// so keep the assertions here read-only.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';

import { createApp } from '../src/app.js';

let server;
let baseUrl;

before(async () => {
  await connectDatabase();

  // Port 0 lets the OS pick a free one, so this never collides with a dev server.
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
});

test('GET /health reports a live database', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.database.state, 'connected');
  assert.equal(body.database.name, 'mjolnir', 'dbName should be pinned, not left to the URI');
});

test('an unknown route 404s as JSON through the error handler', async () => {
  const response = await fetch(`${baseUrl}/no-such-route`);
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type'), /application\/json/);

  const body = await response.json();
  assert.match(body.error.message, /No route for GET \/no-such-route/);
});
