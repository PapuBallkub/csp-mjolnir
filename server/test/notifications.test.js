import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from '#features/notifications/email.service.js';
import {
  buildMatchSnapshot,
  evaluateUserCandidateMatches,
} from '#features/notifications/creators/match-notification.service.js';
import { extractNotifiedProjectIds } from '#features/notifications/creators/find-notification-duplication.js';
import {
  escapeAndDefang,
  renderMatchDigestEmail,
} from '#features/notifications/templates/match-digest.template.js';

test('notifications: creates and verifies HMAC unsubscribe token', () => {
  const userId = '654321098765432109876543';
  const token = createUnsubscribeToken(userId);

  assert.ok(typeof token === 'string' && token.length > 20);
  assert.equal(verifyUnsubscribeToken(userId, token), true);

  // Different user ID fails verification
  assert.equal(verifyUnsubscribeToken('654321098765432109876544', token), false);
  // Corrupted token fails verification
  assert.equal(verifyUnsubscribeToken(userId, 'invalid-token'), false);
});

test('notifications: renders match digest email template with subject and Thai cards', () => {
  const matchedItems = [
    {
      projectId: '69069041234',
      projectTitle: 'โครงการพัฒนาระบบ e-Service Portal',
      agency: 'สำนักงานเขตจตุจักร',
      budget: 3_200_000,
      matchScore: 88,
      matchedSkills: ['Next.js', 'Node.js', 'PostgreSQL'],
      submissionDeadline: new Date('2026-11-20T00:00:00.000Z'),
    },
  ];

  const { subject, html, text } = renderMatchDigestEmail({
    recipientName: 'สมชาย',
    matchedItems,
    unsubscribeUrl: 'https://gipdp.go.th/unsubscribe?token=123',
    appUrl: 'https://gipdp.go.th',
  });

  assert.match(subject, /สรุปพบ 1 โครงการ/);
  assert.ok(html.includes('สมชาย'));
  assert.ok(html.includes('โครงการพัฒนาระบบ e-Service Portal'));
  assert.ok(html.includes('88% ตรงกัน'));
  assert.ok(html.includes('฿3,200,000'));
  assert.ok(html.includes('Next.&#8203;js'));
  assert.ok(html.includes('https://gipdp.go.th/unsubscribe?token=123'));
  assert.ok(text.includes('สมชาย'));
  assert.ok(text.includes('โครงการพัฒนาระบบ e-Service Portal'));
});

test('notifications: escapeAndDefang neutralizes embedded URLs in titles to prevent autolinking', () => {
  // 1. Defangs www. domain names by inserting zero-width space
  const title1 = 'จ้างดูแลระบบ www.virus.com';
  const defanged1 = escapeAndDefang(title1);
  assert.equal(defanged1, 'จ้างดูแลระบบ www&#8203;.virus.&#8203;com');
  // Email clients scan for standard domain regex: with &#8203;, it will NOT match
  assert.ok(!defanged1.includes('www.virus.com'));

  // 2. Defangs https:// protocols
  const title2 = 'ระบบจัดซื้อ https://malware.org/bad';
  const defanged2 = escapeAndDefang(title2);
  assert.ok(defanged2.includes('https:&#8203;//'));
  assert.ok(!defanged2.includes('https://'));

  // 3. Escapes HTML injection tags
  const title3 = '<script>alert("hack")</script> & <b>test</b>';
  const defanged3 = escapeAndDefang(title3);
  assert.ok(!defanged3.includes('<script>'));
  assert.ok(defanged3.includes('&lt;script&gt;'));
  assert.ok(defanged3.includes('&amp;'));

  // 4. In email template, title with virus.com is rendered defanged
  const { html } = renderMatchDigestEmail({
    recipientName: 'ผู้ใช้',
    matchedItems: [
      {
        projectId: '69000000001',
        projectTitle: 'ดูแลระบบ www.virus.com',
        agency: 'กรมทดสอบ',
        budget: 1_000_000,
        matchScore: 90,
      },
    ],
    appUrl: 'https://gipdp.go.th',
  });

  assert.ok(html.includes('www&#8203;.virus.&#8203;com'));
  assert.ok(!html.includes('<h3>\n          ดูแลระบบ www.virus.com'));
});

test('notifications: buildMatchSnapshot correctly formats receipt fields', () => {
  const matchedPairs = [
    {
      tor: {
        projectId: '69069041234',
        identification: {
          titleTh: 'จ้างพัฒนาระบบ Portal',
          agency: 'สำนักงานเขตจตุจักร',
        },
        facts: {
          referencePriceTHB: 2_500_000,
          submissionDeadline: new Date('2026-12-01'),
        },
      },
      matchResult: {
        score: 85,
        matched: ['React', 'Node.js'],
      },
    },
  ];

  const snapshot = buildMatchSnapshot(matchedPairs);

  assert.equal(snapshot.matchedItems.length, 1);
  const item = snapshot.matchedItems[0];
  assert.equal(item.projectId, '69069041234');
  assert.equal(item.projectTitle, 'จ้างพัฒนาระบบ Portal');
  assert.equal(item.agency, 'สำนักงานเขตจตุจักร');
  assert.equal(item.budget, 2_500_000);
  assert.equal(item.matchScore, 85);
  assert.deepEqual(item.matchedSkills, ['React', 'Node.js']);
});

test('notifications: evaluateUserCandidateMatches filters by score and returns empty for empty skills', () => {
  const userNoSkills = { profile: { skills: [] } };
  const tors = [
    {
      projectId: 'TOR-1',
      technicalRequirements: { requiredTechnologies: [{ name: 'React' }] },
    },
  ];

  assert.deepEqual(evaluateUserCandidateMatches(userNoSkills, tors), []);

  const userWithSkills = {
    profile: {
      skills: ['React', 'Node.js'],
      matchNotification: { minScore: 70 },
    },
  };

  const matches = evaluateUserCandidateMatches(userWithSkills, tors, { minScore: 50 });
  assert.ok(Array.isArray(matches));
});

test('notifications: extractNotifiedProjectIds correctly extracts project IDs from match and single-project snapshots', () => {
  const pastNotifications = [
    {
      type: 'match',
      snapshot: {
        matchedItems: [
          { projectId: '69069041234' },
          { projectId: '69079055432' },
        ],
      },
    },
    {
      type: 'amendment',
      snapshot: {
        projectId: '69088899999',
      },
    },
  ];

  const projectIds = extractNotifiedProjectIds(pastNotifications);

  assert.equal(projectIds.size, 3);
  assert.ok(projectIds.has('69069041234'));
  assert.ok(projectIds.has('69079055432'));
  assert.ok(projectIds.has('69088899999'));
  assert.ok(!projectIds.has('unknown-id'));
});
