import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { factChanges, judgeStages, recordChange, stageOfPackage, summaryChanges } from '#pipeline/shared/amendments.js';

const fixture = (name) => fs.readFile(path.join(import.meta.dirname, '..', 'ingestion', 'fixtures', 'egp-package', name), 'utf8');

test("a package's stage is read from its own announcement: a draft says ร่าง", async () => {
  const draft = { announcementText: await fixture('69109028093-draft-announcement.txt') };
  const invitation = { announcementText: await fixture('69109062251-announcement.txt') };

  assert.equal(stageOfPackage(draft), 'draft');
  assert.equal(stageOfPackage(invitation), 'invitation');
  assert.equal(stageOfPackage({ announcementText: '' }), null, 'no text: unread');

  assert.equal(judgeStages(draft, invitation), 'next-stage', 'a draft becoming an invitation is not a change');
  assert.equal(judgeStages(invitation, invitation), 'same-stage');
  assert.equal(judgeStages(draft, draft), 'same-stage', 'a revised draft');
  assert.equal(judgeStages({ announcementText: '' }, invitation), 'unknown');
});

test("a package's facts: what changed, with ISO dates, and a price of 0 as none", () => {
  const before = { submissionDeadline: new Date('2026-11-02T10:00:00+07:00'), referencePriceTHB: 1_000_000, budgetTHB: 0 };
  const after = { submissionDeadline: new Date('2026-11-09T10:00:00+07:00'), referencePriceTHB: 1_000_000, budgetTHB: 1_200_000 };

  assert.deepEqual(factChanges(before, after), [
    { kind: 'changed', field: 'facts.submissionDeadline', before: '2026-11-02T03:00:00.000Z', after: '2026-11-09T03:00:00.000Z' },
    { kind: 'added', field: 'facts.budgetTHB', before: null, after: '1200000' },
  ]);
  assert.deepEqual(factChanges(before, before), []);
});

test("a summary's changes: values and known items only, never free text", () => {
  const before = {
    facts: { warrantyYears: 1, penaltyClause: 'ร้อยละ 0.10 ต่อวัน' },
    technicalRequirements: { requiredTechnologies: [{ name: 'PostgreSQL' }, { name: 'Windows Server 2019' }] },
    eligibility: { standardConditions: ['juristic-person'] },
    deliverables: { system: ['ระบบลงทะเบียน'] },
  };
  const after = {
    facts: { warrantyYears: 2, penaltyClause: 'ค่าปรับร้อยละ 0.1 ต่อวัน' },
    technicalRequirements: { requiredTechnologies: [{ name: 'postgresql' }, { name: 'NGINX Plus' }] },
    eligibility: { standardConditions: ['juristic-person', 'not-blacklisted'] },
    deliverables: { system: ['ระบบลงทะเบียนออนไลน์'] },
  };

  assert.deepEqual(summaryChanges(before, after), [
    { kind: 'changed', field: 'facts.warrantyYears', before: '1', after: '2' },
    { kind: 'added', field: 'technicalRequirements.requiredTechnologies', before: null, after: 'NGINX Plus' },
    { kind: 'removed', field: 'technicalRequirements.requiredTechnologies', before: 'Windows Server 2019', after: null },
    { kind: 'added', field: 'eligibility.standardConditions', before: null, after: 'not-blacklisted' },
  ]);
});

test('one run records one entry; a changed invitation the feed announced is answered, not repeated', () => {
  const now = new Date('2026-10-25T22:05:00+07:00');
  const tor = { amendments: [], packagesCheckedAt: new Date('2026-10-24T22:05:00+07:00') };
  tor.amendments.push = Array.prototype.push;

  const entry = recordChange(tor, { rows: [{ kind: 'changed', field: 'document', before: 'a.zip', after: 'b.zip' }], now, zipId: 'b' });
  recordChange(tor, { rows: [{ kind: 'added', field: 'facts.budgetTHB', before: null, after: '1200000' }], now });

  assert.equal(tor.amendments.length, 1);
  assert.deepEqual([entry.source, entry.zipId, entry.diff, entry.changes.length], ['package', 'b', 'facts', 2]);
  assert.equal(entry.previousCheckAt, tor.packagesCheckedAt, 'it happened after the last look that found nothing');
  assert.equal(tor.lastChangeAt, now);

  // The feed announced a change; the package that answers it fills that entry
  const announced = { amendments: [{ source: 'feed', zipId: null, changes: [], detectedAt: new Date('2026-10-25T17:10:00+07:00') }] };
  const filled = recordChange(announced, { rows: [], now, zipId: 'c' });
  assert.equal(announced.amendments.length, 1);
  assert.deepEqual([filled.source, filled.zipId], ['feed', 'c']);
});
