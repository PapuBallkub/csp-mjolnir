import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EGP_ANNOUNCEMENT_CODES,
  FETCHABLE_CODES,
  AMENDMENT_CODES,
  getAnnouncementInfo,
  classifyAnnouncement,
  codeFromTypeName,
} from '#pipeline/shared/announcement-codes.js';

test('the table holds every project code in e-GP\'s RSS manual (P0 plans aside)', () => {
  assert.deepEqual(
    Object.keys(EGP_ANNOUNCEMENT_CODES).sort(),
    ['15', 'B0', 'D0', 'D1', 'D2', 'W0', 'W1', 'W2'],
  );
});

test('FETCHABLE_CODES asks for every code, in lifecycle order', () => {
  assert.deepEqual(FETCHABLE_CODES, ['15', 'B0', 'D0', 'D2', 'D1', 'W0', 'W2', 'W1']);
  assert.deepEqual([...FETCHABLE_CODES].sort(), Object.keys(EGP_ANNOUNCEMENT_CODES).sort());
});

test('D1 cancels the invitation; only D2 amends it', () => {
  assert.equal(getAnnouncementInfo('D1').nameTh, 'ยกเลิกประกาศเชิญชวน');
  assert.equal(getAnnouncementInfo('D1').impliedStatus, 'Cancelled');
  assert.equal(getAnnouncementInfo('D1').setsAmended, false);
  assert.equal(getAnnouncementInfo('D2').nameTh, 'เปลี่ยนแปลงประกาศเชิญชวน');
  assert.equal(getAnnouncementInfo('D2').impliedStatus, 'Open');
  assert.deepEqual(AMENDMENT_CODES, ['D2']);
});

test('winner announcements award, and their cancellation cancels', () => {
  assert.equal(getAnnouncementInfo('W0').impliedStatus, 'Awarded');
  assert.equal(getAnnouncementInfo('W2').impliedStatus, 'Awarded');
  assert.equal(getAnnouncementInfo('W1').impliedStatus, 'Cancelled');
});

test('getAnnouncementInfo returns undefined for unknown codes', () => {
  assert.equal(getAnnouncementInfo('ZZ'), undefined);
  assert.equal(getAnnouncementInfo(''), undefined);
  assert.equal(getAnnouncementInfo('P0'), undefined);
});

test('classifyAnnouncement maps each code to its type', () => {
  assert.equal(classifyAnnouncement('15'), 'reference_price');
  assert.equal(classifyAnnouncement('B0'), 'draft_tor');
  assert.equal(classifyAnnouncement('D0'), 'invitation');
  assert.equal(classifyAnnouncement('D2'), 'amendment');
  assert.equal(classifyAnnouncement('D1'), 'invitation_cancelled');
  assert.equal(classifyAnnouncement('W0'), 'winner');
  assert.equal(classifyAnnouncement('W2'), 'winner_changed');
  assert.equal(classifyAnnouncement('W1'), 'winner_cancelled');
  assert.equal(classifyAnnouncement('XX'), null);
});

test('codeFromTypeName reads the type names exactly as the live feed writes them', () => {
  // Copied from feed items on 2026-10-07
  assert.equal(codeFromTypeName('ประกาศเชิญชวน'), 'D0');
  assert.equal(codeFromTypeName('ยกเลิกประกาศเชิญชวน'), 'D1');
  assert.equal(codeFromTypeName('ร่างเอกสารประกวดราคา (e-Bidding) และร่างเอกสารซื้อหรือจ้างด้วยวิธีสอบราคา'), 'B0');
  assert.equal(codeFromTypeName('ประกาศรายชื่อผู้ชนะการเสนอราคา / ประกาศผู้ได้รับการคัดเลือก'), 'W0');
  assert.equal(codeFromTypeName('ยกเลิกประกาศรายชื่อผู้ชนะการเสนอราคา / ประกาศผู้ได้รับการคัดเลือก'), 'W1');
  assert.equal(codeFromTypeName('เปลี่ยนแปลงประกาศรายชื่อผู้ชนะการเสนอราคา'), 'W2');
  assert.equal(codeFromTypeName('แผนการจัดซื้อจัดจ้าง'), null);
  assert.equal(codeFromTypeName(undefined), null);
});
