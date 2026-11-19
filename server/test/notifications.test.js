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
import { renderWatchlistDigestEmail } from '#features/notifications/templates/watchlist-digest.template.js';

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
  assert.ok(html.includes('Next&#8203;.&#8203;js'));
  assert.ok(html.includes('https://gipdp.go.th/unsubscribe?token=123'));
  assert.ok(text.includes('สมชาย'));
  assert.ok(text.includes('โครงการพัฒนาระบบ e-Service Portal'));
});

test('notifications: escapeAndDefang neutralizes embedded URLs in titles to prevent autolinking', () => {
  // 1. Defangs www. domain names by inserting zero-width space around every dot
  const title1 = 'จ้างดูแลระบบ www.virus.com';
  const defanged1 = escapeAndDefang(title1);
  assert.equal(defanged1, 'จ้างดูแลระบบ www&#8203;.&#8203;virus&#8203;.&#8203;com');
  assert.ok(!defanged1.includes('www.virus.com'));

  // 2. Defangs multi-level domains like .go.th or .co.th so "go.th" is NOT autolinked
  const titleBoi = 'จ้างจัดทำและปรับปรุงข้อมูลเพื่อเผยแพร่บนเว็บไซต์ www.boi.go.th ประจำปีงบประมาณ 2570';
  const defangedBoi = escapeAndDefang(titleBoi);
  assert.equal(defangedBoi.includes('go.th'), false);
  assert.equal(defangedBoi.includes('boi.go'), false);
  assert.equal(defangedBoi.includes('www.'), false);
  assert.ok(defangedBoi.includes('boi&#8203;.&#8203;go&#8203;.&#8203;th'));

  // 3. Defangs https:// protocols
  const title2 = 'ระบบจัดซื้อ https://malware.org/bad';
  const defanged2 = escapeAndDefang(title2);
  assert.ok(defanged2.includes('https:&#8203;//'));
  assert.ok(!defanged2.includes('https://'));

  // 4. Escapes HTML injection tags
  const title3 = '<script>alert("hack")</script> & <b>test</b>';
  const defanged3 = escapeAndDefang(title3);
  assert.ok(!defanged3.includes('<script>'));
  assert.ok(defanged3.includes('&lt;script&gt;'));
  assert.ok(defanged3.includes('&amp;'));

  // 5. In email template, title with virus.com is rendered defanged
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

  assert.ok(html.includes('www&#8203;.&#8203;virus&#8203;.&#8203;com'));
  assert.ok(!html.includes('ดูแลระบบ www.virus.com'));
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

test('notifications: evaluateUserCandidateMatches respects includeSubcontract setting for individual freelancers', () => {
  const tors = [
    {
      projectId: 'TOR-COMPANIES-ONLY',
      companiesOnly: true,
      technicalRequirements: { requiredTechnologies: [{ name: 'React' }, { name: 'Node.js' }] },
    },
  ];

  // Freelancer with includeSubcontract: true (default) gets matched for subcontract/JV opportunities
  const freelancerWithSubcontract = {
    profile: {
      entityType: 'individual',
      skills: ['React', 'Node.js'],
      matchNotification: { enabled: true, minScore: 50, includeSubcontract: true },
    },
  };

  const matchesIncluded = evaluateUserCandidateMatches(freelancerWithSubcontract, tors, { minScore: 50 });
  assert.equal(matchesIncluded.length, 1);
  assert.equal(matchesIncluded[0].tor.projectId, 'TOR-COMPANIES-ONLY');

  // Freelancer with includeSubcontract: false explicitly skips companies-only bids
  const freelancerNoSubcontract = {
    profile: {
      entityType: 'individual',
      skills: ['React', 'Node.js'],
      matchNotification: { enabled: true, minScore: 50, includeSubcontract: false },
    },
  };

  const matchesExcluded = evaluateUserCandidateMatches(freelancerNoSubcontract, tors, { minScore: 50 });
  assert.equal(matchesExcluded.length, 0);
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

test('notifications: renders watchlist digest email with amendment, status change, and deadline cards', () => {
  const alerts = [
    {
      type: 'amendment',
      projectId: '69011122233',
      projectTitle: 'ระบบสารสนเทศทะเบียนราษฎร์ www.dopa.go.th',
      agency: 'กรมการปกครอง',
      budget: 8_500_000,
      amendedVersion: 2,
      changedFieldsTh: ['คุณสมบัติผู้ยื่นข้อเสนอ', 'ขอบเขตงาน'],
    },
    {
      type: 'status_change',
      projectId: '69044455566',
      projectTitle: 'ระบบคลาวด์ภาครัฐ',
      agency: 'สำนักงานพัฒนารัฐบาลดิจิทัล',
      budget: 15_000_000,
      previousStatusTh: 'เปิดรับข้อเสนอ',
      newStatusTh: 'ประกาศผู้ชนะ',
    },
    {
      type: 'deadline',
      projectId: '69077788899',
      projectTitle: 'ระบบบริการประชาชนอัจฉริยะ',
      agency: 'กรุงเทพมหานคร',
      budget: 4_200_000,
      daysRemaining: 3,
      deadlineDate: new Date('2026-11-22T00:00:00.000Z'),
    },
  ];

  const { subject, html, text } = renderWatchlistDigestEmail({
    recipientName: 'วิชัย',
    alerts,
    unsubscribeUrl: 'https://gipdp.go.th/unsubscribe?token=watchlist999',
    appUrl: 'https://gipdp.go.th',
  });

  // Verify subject and recipient
  assert.match(subject, /สรุปอัปเดต 3 โครงการ/);
  assert.ok(html.includes('วิชัย'));
  assert.ok(text.includes('วิชัย'));

  // Verify amendment card
  assert.ok(html.includes('แก้ไขเอกสาร TOR (เวอร์ชัน 2)'));
  assert.ok(html.includes('คุณสมบัติผู้ยื่นข้อเสนอ'));
  assert.ok(html.includes('ขอบเขตงาน'));
  // Verify anti-autolinking defanged domain
  assert.ok(html.includes('dopa&#8203;.&#8203;go&#8203;.&#8203;th'));
  assert.ok(!html.includes('www.dopa.go.th'));

  // Verify status change card
  assert.ok(html.includes('สถานะโครงการเปลี่ยนแปลง'));
  assert.ok(html.includes('เปิดรับข้อเสนอ'));
  assert.ok(html.includes('ประกาศผู้ชนะ'));

  // Verify deadline card
  assert.ok(html.includes('ใกล้สิ้นสุดกำหนดยื่นข้อเสนอ (เหลืออีก 3 วัน)'));
  assert.ok(html.includes('฿4,200,000'));

  // Verify unsubscribe link
  assert.ok(html.includes('https://gipdp.go.th/unsubscribe?token=watchlist999'));
  assert.ok(text.includes('https://gipdp.go.th/unsubscribe?token=watchlist999'));
});
