import assert from 'node:assert/strict';
import { test } from 'node:test';
import { XMLParser } from 'fast-xml-parser';

import { escapeRegex } from '#common/utils/escape-regex.js';
import {
  isSafeHttpUrl,
  isAllowedEgpUrl,
  sanitizeMailHeader,
  escapeCsvCell,
} from '#common/utils/sanitize.js';
import { escapeAndDefang } from '#features/notifications/templates/match-digest.template.js';
import { decodeThaiXml } from '#pipeline/ingestion/sources/process3.js';

test('decodeThaiXml: single canonical decode into UTF-8 (ASVS V1.1.1, V1.5.3)', () => {
  const rawUtf8 = Buffer.from('<rss><title>โครงการ %252e%252e</title></rss>', 'utf8');
  const { xmlText, encoding, isCorrupted } = decodeThaiXml(rawUtf8);

  assert.equal(encoding, 'utf-8');
  assert.equal(isCorrupted, false);
  assert.ok(xmlText.includes('%252e%252e'));
});

test('escapeAndDefang: HTML output encoding and URL defanging (ASVS V1.1.2, V1.2.1, V1.3.3, V1.3.7)', () => {
  const rendered = escapeAndDefang('<script>alert("xss" & \'1\')</script> https://malware.org');

  assert.ok(!rendered.includes('<script>'));
  assert.ok(rendered.includes('&lt;script&gt;'));
  assert.ok(rendered.includes('&quot;xss&quot;'));
  assert.ok(!rendered.includes('https://malware.org'));
  assert.ok(rendered.includes('&#8203;'));
});

test('isSafeHttpUrl: permits http/https and rejects dangerous schemes (ASVS V1.2.2)', () => {
  assert.equal(isSafeHttpUrl('https://process3.gprocurement.go.th/doc.pdf'), true);
  assert.equal(isSafeHttpUrl('http://localhost:3000/search'), true);
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isSafeHttpUrl('file:///etc/passwd'), false);
});

test('escapeRegex: escapes regex metacharacters (ASVS V1.2.9, V1.3.12)', () => {
  const input = '(a+)+$ C++ [test] .*?^${}()|\\';
  const regex = new RegExp(escapeRegex(input), 'i');

  assert.equal(regex.test(input), true);
  assert.equal(regex.test('aaaaaaaaaaaaaaaaX'), false);
});

test('escapeCsvCell: prefixes formula characters and quotes per RFC 4180 (ASVS V1.2.10)', () => {
  assert.equal(escapeCsvCell('=CMD|\' /C calc\'!A0'), '\'=CMD|\' /C calc\'!A0');
  assert.equal(escapeCsvCell('+SUM(A1:A10)'), '\'+SUM(A1:A10)');
  assert.equal(escapeCsvCell('-1+1'), '\'-1+1');
  assert.equal(escapeCsvCell('\tmalicious'), '\'\tmalicious');
  assert.equal(escapeCsvCell('โครงการ "ระยะที่ 1", กรุงเทพฯ'), '"โครงการ ""ระยะที่ 1"", กรุงเทพฯ"');
});

test('isAllowedEgpUrl: enforces SSRF domain and protocol allowlist (ASVS V1.3.6)', () => {
  assert.equal(isAllowedEgpUrl('https://process3.gprocurement.go.th/egpannouncerss.xml'), true);
  assert.equal(isAllowedEgpUrl('http://process3.gprocurement.go.th/doc.pdf'), false);
  assert.equal(isAllowedEgpUrl('https://localhost:8000/internal.pdf'), false);
  assert.equal(isAllowedEgpUrl('https://169.254.169.254/latest/meta-data/iam.pdf'), false);
  assert.equal(isAllowedEgpUrl('https://gprocurement.go.th.evil.com/doc.pdf'), false);
  assert.equal(isAllowedEgpUrl('https://process3.gprocurement.go.th:8443/doc.pdf'), false);
});

test('sanitizeMailHeader: strips CRLF to prevent SMTP header injection (ASVS V1.3.11)', () => {
  const sanitized = sanitizeMailHeader('user@example.com\r\nBcc: attacker@evil.com');
  assert.ok(!sanitized.includes('\r'));
  assert.ok(!sanitized.includes('\n'));
});

test('XMLParser: rejects external SYSTEM entities to prevent XXE (ASVS V1.5.1)', () => {
  const parser = new XMLParser({ ignoreAttributes: false });
  const xxePayload = `<?xml version="1.0"?>
    <!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
    <rss><title>&xxe;</title></rss>`;

  assert.throws(() => parser.parse(xxePayload), /External entities are not supported/i);
});
