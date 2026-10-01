// The eligibility conditions every e-GP TOR repeats. A TOR records which of
// them it lists, as these keys (TorInsight.eligibility.standardConditions);
// the user profile will hold the same keys as a checklist, so matching is an
// exact comparison instead of fuzzy text (FR-12, FR-13).
//
// Shape only: the enum source for the models, kept beside them. Anything that
// varies per TOR, such as a financial-standing threshold, is not standard and
// stays in companyRequirements as text. Revisit once more TORs are seen.

export const STANDARD_CONDITIONS = [
  { key: 'legal-capacity', th: 'มีความสามารถตามกฎหมาย' },
  { key: 'not-bankrupt', th: 'ไม่เป็นบุคคลล้มละลาย' },
  { key: 'not-dissolving', th: 'ไม่อยู่ระหว่างเลิกกิจการ' },
  { key: 'not-suspended', th: 'ไม่ถูกระงับการยื่นข้อเสนอหรือทำสัญญากับหน่วยงานของรัฐไว้ชั่วคราว' },
  { key: 'not-blacklisted', th: 'ไม่เป็นผู้ถูกระบุชื่อในบัญชีรายชื่อผู้ทิ้งงาน' },
  { key: 'meets-procurement-rules', th: 'มีคุณสมบัติและไม่มีลักษณะต้องห้ามตามที่คณะกรรมการนโยบายการจัดซื้อจัดจ้างฯ กำหนด' },
  // Decisive for freelancers: an individual cannot bid. The TOR page shows it
  // as "เฉพาะนิติบุคคล" even though the rest of this list stays off the page.
  { key: 'juristic-person', th: 'เป็นนิติบุคคลผู้มีอาชีพรับจ้างงานที่ประกวดราคา' },
  { key: 'no-collusion', th: 'ไม่เป็นผู้มีผลประโยชน์ร่วมกันกับผู้ยื่นข้อเสนอรายอื่น' },
  { key: 'no-immunity', th: 'ไม่เป็นผู้ได้รับเอกสิทธิ์หรือความคุ้มกันที่อาจปฏิเสธไม่ยอมขึ้นศาลไทย' },
  { key: 'egp-registered', th: 'ลงทะเบียนในระบบจัดซื้อจัดจ้างภาครัฐด้วยอิเล็กทรอนิกส์ (e-GP)' },
];

export const STANDARD_CONDITION_KEYS = STANDARD_CONDITIONS.map((condition) => condition.key);
