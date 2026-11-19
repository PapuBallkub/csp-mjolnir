import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildAmendmentSnapshot,
  buildDeadlineSnapshot,
  buildStatusSnapshot,
  evaluateWatchlistItemUpdates,
  FIELD_NAMES_TH,
} from '#features/notifications/creators/watchlist-notification.service.js';

test('watchlist-notifications: buildAmendmentSnapshot maps changed fields to Thai descriptions', () => {
  const tor = {
    projectId: '69099324161',
    lastChangeAt: new Date('2026-10-25T15:05:00.000Z'),
  };
  const insight = {
    projectId: '69099324161',
    identification: {
      titleTh: 'โครงการพัฒนาระบบคลังข้อมูลสถิติ',
      agency: 'สำนักงานสถิติแห่งชาติ',
    },
    facts: {
      referencePriceTHB: 4_952_350,
      budgetTHB: 5_000_000,
    },
    amendmentInfo: {
      amendmentSummary: 'ประกาศแก้ไขครั้งที่ 1',
    },
  };
  const amendment = {
    headline: 'แก้ไขราคากลางและวันยื่นข้อเสนอ',
    detectedAt: new Date('2026-10-25T15:05:00.000Z'),
    changes: [
      { field: 'facts.referencePriceTHB' },
      { field: 'facts.submissionDeadline' },
    ],
  };

  const snapshot = buildAmendmentSnapshot(tor, insight, amendment);

  assert.equal(snapshot.projectId, '69099324161');
  assert.equal(snapshot.projectTitle, 'โครงการพัฒนาระบบคลังข้อมูลสถิติ');
  assert.equal(snapshot.agency, 'สำนักงานสถิติแห่งชาติ');
  assert.equal(snapshot.budget, 4_952_350);
  assert.equal(snapshot.amendmentHeadline, 'แก้ไขราคากลางและวันยื่นข้อเสนอ');
  assert.deepEqual(snapshot.changedFields, ['facts.referencePriceTHB', 'facts.submissionDeadline']);
  assert.deepEqual(snapshot.changedFieldsTh, ['ราคากลาง', 'วันยื่นข้อเสนอ']);
  assert.equal(snapshot.detectedAt.toISOString(), '2026-10-25T15:05:00.000Z');
});

test('watchlist-notifications: buildStatusSnapshot formats status transition payload', () => {
  const insight = {
    projectId: '69099324161',
    identification: {
      titleTh: 'โครงการบริการ Cloud Computing',
      agency: 'กระทรวงดิจิทัลเพื่อเศรษฐกิจและสังคม',
      status: 'Awarded',
    },
    facts: {
      referencePriceTHB: 12_000_000,
    },
  };

  const snapshot = buildStatusSnapshot(insight, 'Open', 'Awarded');

  assert.equal(snapshot.projectId, '69099324161');
  assert.equal(snapshot.projectTitle, 'โครงการบริการ Cloud Computing');
  assert.equal(snapshot.agency, 'กระทรวงดิจิทัลเพื่อเศรษฐกิจและสังคม');
  assert.equal(snapshot.budget, 12_000_000);
  assert.equal(snapshot.previousStatus, 'Open');
  assert.equal(snapshot.newStatus, 'Awarded');
  assert.ok(snapshot.changedAt instanceof Date);
});

test('watchlist-notifications: buildDeadlineSnapshot computes submission and comment deadline payload', () => {
  const deadlineDate = new Date('2026-11-25T16:30:00.000Z');
  const insight = {
    projectId: '69099324161',
    identification: {
      titleTh: 'จ้างบำรุงรักษาซอฟต์แวร์',
      agency: 'กรมการข้าว',
    },
    facts: {
      submissionDeadline: deadlineDate,
      referencePriceTHB: 850_000,
    },
  };

  const snapshot = buildDeadlineSnapshot(insight, 3, 'submission');

  assert.equal(snapshot.projectId, '69099324161');
  assert.equal(snapshot.daysRemaining, 3);
  assert.equal(snapshot.deadlineType, 'submission');
  assert.equal(snapshot.deadlineDate.toISOString(), deadlineDate.toISOString());
  assert.equal(snapshot.budget, 850_000);
});

test('watchlist-notifications: evaluateWatchlistItemUpdates detects amendments only after savedAt', () => {
  const watchlistItem = {
    projectId: 'PRJ-001',
    savedAt: new Date('2026-10-20T08:00:00.000Z'),
    savedStatus: 'Open',
  };

  // Case A: Tor changed AFTER save
  const torNewer = {
    projectId: 'PRJ-001',
    lastChangeAt: new Date('2026-10-25T10:00:00.000Z'),
    amendments: [
      {
        detectedAt: new Date('2026-10-25T10:00:00.000Z'),
        headline: 'ประกาศปรับปรุงคุณสมบัติผู้ยื่นข้อเสนอ',
        changes: [{ field: 'document' }],
      },
    ],
  };
  const insight = {
    projectId: 'PRJ-001',
    identification: { titleTh: 'โครงการนำร่อง AI', agency: 'สวทช.', status: 'Open' },
  };

  const alertsNewer = evaluateWatchlistItemUpdates(watchlistItem, { tor: torNewer, insight });
  const amendmentAlert = alertsNewer.find((a) => a.type === 'amendment');
  assert.ok(amendmentAlert, 'Should produce an amendment alert');
  assert.equal(amendmentAlert.snapshot.amendmentHeadline, 'ประกาศปรับปรุงคุณสมบัติผู้ยื่นข้อเสนอ');

  // Case B: Tor changed BEFORE save (should NOT alert)
  const torOlder = {
    projectId: 'PRJ-001',
    lastChangeAt: new Date('2026-10-15T10:00:00.000Z'),
    amendments: [
      {
        detectedAt: new Date('2026-10-15T10:00:00.000Z'),
        headline: 'ประกาศแก้ไขก่อนบันทึก',
      },
    ],
  };
  const alertsOlder = evaluateWatchlistItemUpdates(watchlistItem, { tor: torOlder, insight });
  const amendmentAlertOlder = alertsOlder.find((a) => a.type === 'amendment');
  assert.equal(amendmentAlertOlder, undefined, 'Must not alert for amendments prior to save');
});

test('watchlist-notifications: evaluateWatchlistItemUpdates detects lifecycle status transition', () => {
  const watchlistItem = {
    projectId: 'PRJ-002',
    savedAt: new Date('2026-10-01'),
    savedStatus: 'Open',
  };

  const tor = { projectId: 'PRJ-002', status: 'Awarded' };
  const insight = {
    projectId: 'PRJ-002',
    identification: { titleTh: 'โครงการ ERP', agency: 'กทม.', status: 'Awarded' },
  };

  const alerts = evaluateWatchlistItemUpdates(watchlistItem, { tor, insight });
  const statusAlert = alerts.find((a) => a.type === 'status_change');
  assert.ok(statusAlert, 'Should produce a status_change alert');
  assert.equal(statusAlert.snapshot.previousStatus, 'Open');
  assert.equal(statusAlert.snapshot.newStatus, 'Awarded');
});

test('watchlist-notifications: evaluateWatchlistItemUpdates detects approaching deadline at thresholds', () => {
  const now = new Date('2026-11-17T12:00:00.000Z');
  // Exactly 3 days remaining
  const deadline3Days = new Date('2026-11-20T12:00:00.000Z');

  const watchlistItem = {
    projectId: 'PRJ-003',
    savedAt: new Date('2026-11-01'),
    savedStatus: 'Open',
  };

  const tor = { projectId: 'PRJ-003', status: 'Open' };
  const insight = {
    projectId: 'PRJ-003',
    identification: { titleTh: 'โครงการระบบสารสนเทศ', agency: 'กพร.', status: 'Open' },
    facts: {
      submissionDeadline: deadline3Days,
    },
  };

  // Case A: 3 days remaining triggers alert
  const alerts3 = evaluateWatchlistItemUpdates(watchlistItem, { tor, insight }, { now, deadlineAlertDays: [3, 7] });
  const deadlineAlert3 = alerts3.find((a) => a.type === 'deadline');
  assert.ok(deadlineAlert3, 'Should produce a deadline alert for 3 days');
  assert.equal(deadlineAlert3.snapshot.daysRemaining, 3);

  // Case B: 15 days remaining should NOT trigger alert (when userNoticeDays is 3)
  const deadline15Days = new Date('2026-12-02T12:00:00.000Z');
  const insight15 = {
    ...insight,
    facts: { submissionDeadline: deadline15Days },
  };
  const alerts15 = evaluateWatchlistItemUpdates(watchlistItem, { tor, insight: insight15 }, { now, userNoticeDays: 3 });
  assert.equal(alerts15.length, 0, 'Should not alert when daysRemaining (15) exceeds userNoticeDays (3)');

  // Case C: Custom user notice threshold (e.g. 5 days) triggers alert when configured
  const deadline5Days = new Date('2026-11-22T12:00:00.000Z');
  const insight5 = {
    ...insight,
    facts: { submissionDeadline: deadline5Days },
  };
  const alerts5 = evaluateWatchlistItemUpdates(watchlistItem, { tor, insight: insight5 }, { now, userNoticeDays: 5 });
  const deadlineAlert5 = alerts5.find((a) => a.type === 'deadline');
  assert.ok(deadlineAlert5, 'Should produce a deadline alert for customized 5-day setting');
  assert.equal(deadlineAlert5.snapshot.daysRemaining, 5);

  // Case D: Injected/discovered project with 20 days remaining triggers initial alert when userNoticeDays is 30
  const deadline20Days = new Date('2026-12-07T12:00:00.000Z');
  const insight20 = {
    ...insight,
    facts: { submissionDeadline: deadline20Days },
  };
  const alerts20 = evaluateWatchlistItemUpdates(
    watchlistItem,
    { tor, insight: insight20 },
    { now, userNoticeDays: 30, pastAlertedDays: [] }
  );
  const deadlineAlert20 = alerts20.find((a) => a.type === 'deadline');
  assert.ok(deadlineAlert20, 'Should trigger initial alert for 20 days when within 30-day notice window');
  assert.equal(deadlineAlert20.snapshot.daysRemaining, 20);

  // Case E: Does not repeat on non-milestone day (e.g. 19 days) if already alerted at 20 days
  const deadline19Days = new Date('2026-12-06T12:00:00.000Z');
  const insight19 = {
    ...insight,
    facts: { submissionDeadline: deadline19Days },
  };
  const alerts19 = evaluateWatchlistItemUpdates(
    watchlistItem,
    { tor, insight: insight19 },
    { now, userNoticeDays: 30, pastAlertedDays: [20] }
  );
  assert.equal(alerts19.length, 0, 'Should not spam on non-milestone day 19 if already alerted at 20 days');

  // Case F: User changes threshold from 30 to 5, and project has 4 days left (past alerts were at 30 and 7)
  const deadline4Days = new Date('2026-11-21T12:00:00.000Z');
  const insight4 = {
    ...insight,
    facts: { submissionDeadline: deadline4Days },
  };
  const alerts4 = evaluateWatchlistItemUpdates(
    watchlistItem,
    { tor, insight: insight4 },
    { now, userNoticeDays: 5, pastAlertedDays: [30, 7] }
  );
  const deadlineAlert4 = alerts4.find((a) => a.type === 'deadline');
  assert.ok(deadlineAlert4, 'Should alert at 4 days when user changed to 5 days and no prior alert <= 5 exists');
  assert.equal(deadlineAlert4.snapshot.daysRemaining, 4);
});
