import assert from 'node:assert/strict';
import { test } from 'node:test';

import { egpAnnouncementUrl } from '#pipeline/shared/egp-links.js';

test('egpAnnouncementUrl builds the public e-GP page for a project', () => {
  assert.equal(
    egpAnnouncementUrl('68039469567'),
    'https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=68039469567',
  );
});

test('egpAnnouncementUrl trims and encodes the ID so a stray space never breaks the link', () => {
  assert.equal(
    egpAnnouncementUrl(' 6803 '),
    'https://process5.gprocurement.go.th/egp-agpc01-web/announcement?keywordSearch=6803',
  );
  assert.match(egpAnnouncementUrl('a&b'), /keywordSearch=a%26b$/);
});
