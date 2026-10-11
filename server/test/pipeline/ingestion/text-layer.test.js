import assert from 'node:assert/strict';
import { test } from 'node:test';

import { textLayerOf } from '#pipeline/ingestion/lib/text-layer.js';

test('a text layer counts as text only when it is Thai', () => {
  // A real TOR's layer, typed in an old non-Unicode Thai font (69109097103)
  const garbled = "{rt ruxruifl 'r:fr t?afl 1:uauud'u (sLeep test) qiruau obm i,}u rjrysirthud:srl'lcu v{.fi . bdero";
  assert.equal(textLayerOf(garbled), 'garbled');

  const thai = 'ร่างขอบเขตของงาน (Terms of Reference : TOR) โครงการซื้อสิทธิการใช้งานระบบบัญชีผู้ใช้งาน Active Directory';
  assert.equal(textLayerOf(thai), 'text');

  // A scan: nothing but pdf-parse's page markers
  assert.equal(textLayerOf('\n\n-- 1 of 28 --\n\n-- 2 of 28 --\n'), 'scan');
  assert.equal(textLayerOf(''), 'scan');
  assert.equal(textLayerOf(null), 'scan');
});

test('an English-only text layer is OCR\'d too, by design', () => {
  // Thai government TORs are Thai; one that isn't costs an OCR, never its text
  const english = 'Terms of Reference for the maintenance of servers, workstations and LAN cabling for one year.';
  assert.equal(textLayerOf(english), 'garbled');
});
