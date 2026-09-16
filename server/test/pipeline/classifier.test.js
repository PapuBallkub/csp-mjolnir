import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyIT } from '#pipeline/lib/classifier.js';

test('classifyIT identifies short IT titles with 1 or more keywords', () => {
  const title1 = 'จัดซื้อเครื่องคอมพิวเตอร์แม่ข่าย';
  const res1 = classifyIT(title1);
  assert.equal(res1.isIT, true);
  assert.ok(res1.matchedKeywords.includes('คอมพิวเตอร์'));

  const title2 = 'Cloud Server Service for Bangkok Municipality';
  const res2 = classifyIT(title2);
  assert.equal(res2.isIT, true);
  assert.ok(res2.matchedKeywords.includes('cloud'));
  assert.ok(res2.matchedKeywords.includes('server'));
});

test('classifyIT requires >=2 keywords for long document bodies', () => {
  // Long text (> 200 chars) with only 1 keyword
  const longText1 =
    'โครงการประกวดราคาจ้างก่อสร้างปรับปรุงอาคารสำนักงานและภูมิทัศน์โดยรอบ ' +
    'รวมถึงงานทาสีภายนอกอาคาร งานปรับปรุงระบบไฟฟ้ากำลัง งานประปาและสุขาภิบาล ' +
    'มีการจัดเตรียมโต๊ะ เก้าอี้ และคอมพิวเตอร์ หนึ่งเครื่องสำหรับเจ้าหน้าที่ควบคุมงาน ' +
    'กำหนดแล้วเสร็จภายใน ๑๘๐ วันทำการ';

  const res1 = classifyIT(longText1);
  assert.equal(res1.isIT, false);
  assert.deepEqual(res1.matchedKeywords, ['คอมพิวเตอร์']);

  // Long text with 2 or more keywords
  const longText2 =
    'โครงการพัฒนาระบบสารสนเทศเพื่อการบริหารจัดการภาครัฐ ' +
    'โดยมีขอบเขตการจัดหาระบบฐานข้อมูล และเครื่องคอมพิวเตอร์แม่ข่าย ' +
    'พร้อมติดตั้งระบบเครือข่ายความเร็วสูงเพื่อเชื่อมโยงข้อมูลระหว่างหน่วยงาน ' +
    'กำหนดระยะเวลาดำเนินงาน ๓๖๐ วัน';

  const res2 = classifyIT(longText2);
  assert.equal(res2.isIT, true);
  assert.ok(res2.matchedKeywords.length >= 2);
});

test('classifyIT rejects non-IT procurement documents', () => {
  const construction =
    'จ้างเหมาก่อสร้างถนนคอนกรีตเสริมเหล็ก สายบ้านหนองหว้า ถึงบ้านดอนดู่ ' +
    'ตำบลโนนสูง อำเภอเมือง จังหวัดนครราชสีมา โดยทำการลงหินคลุกและบดอัดแน่น';
  const res = classifyIT(construction);
  assert.equal(res.isIT, false);
  assert.equal(res.matchedKeywords.length, 0);
});

test('classifyIT handles empty and invalid inputs gracefully', () => {
  assert.equal(classifyIT('').isIT, false);
  assert.equal(classifyIT(null).isIT, false);
  assert.equal(classifyIT(undefined).isIT, false);
});
