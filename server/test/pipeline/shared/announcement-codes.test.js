import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EGP_ANNOUNCEMENT_CODES,
  FETCHABLE_CODES,
  AMENDMENT_CODES,
  getAnnouncementInfo,
  classifyAnnouncement,
} from '#pipeline/shared/announcement-codes.js';

test('EGP_ANNOUNCEMENT_CODES contains all five known codes', () => {
  assert.deepEqual(
    Object.keys(EGP_ANNOUNCEMENT_CODES).sort(),
    ['15', 'B0', 'D0', 'D1', 'D2'],
  );
});

test('FETCHABLE_CODES lists every code', () => {
  assert.equal(FETCHABLE_CODES.length, 5);
  assert.ok(FETCHABLE_CODES.includes('B0'));
  assert.ok(FETCHABLE_CODES.includes('D1'));
  assert.ok(FETCHABLE_CODES.includes('D2'));
});

test('AMENDMENT_CODES includes only D1 and D2', () => {
  assert.deepEqual(AMENDMENT_CODES.sort(), ['D1', 'D2']);
});

test('getAnnouncementInfo returns the full entry for known codes', () => {
  const info = getAnnouncementInfo('B0');
  assert.equal(info.type, 'draft_tor');
  assert.equal(info.impliedStatus, 'Draft');
  assert.equal(info.setsAmended, false);
});

test('getAnnouncementInfo returns undefined for unknown codes', () => {
  assert.equal(getAnnouncementInfo('ZZ'), undefined);
  assert.equal(getAnnouncementInfo(''), undefined);
});

test('classifyAnnouncement maps each code to its type', () => {
  assert.equal(classifyAnnouncement('B0'), 'draft_tor');
  assert.equal(classifyAnnouncement('D0'), 'invitation');
  assert.equal(classifyAnnouncement('D1'), 'amendment');
  assert.equal(classifyAnnouncement('D2'), 'amendment');
  assert.equal(classifyAnnouncement('15'), 'reference_price');
  assert.equal(classifyAnnouncement('XX'), null);
});
