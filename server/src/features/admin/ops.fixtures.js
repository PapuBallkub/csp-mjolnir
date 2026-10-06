/**
 * Baseline operational data for the admin dashboard (FR-22, FR-23).
 *
 * Uses the platform's real ingestion sources:
 * 1. process3: e-GP RSS Feed (กรมบัญชีกลาง)
 * 2. datago: Open Government Data (data.go.th CKAN API)
 * 3. egp-pdf: e-GP PDF Attachment Package Backend
 */

const ok14 = Array(14).fill(true);

/** `daysAgo` counts back from today, so index 13 is this morning's run. */
const withFailures = (daysAgo) => ok14.map((_, i) => !daysAgo.includes(13 - i));

export const scraperSources = [
  {
    id: 'process3',
    name: 'e-GP กรมบัญชีกลาง (RSS Feed)',
    portal: 'process3.gprocurement.go.th',
    format: 'xml',
    health: 'ok',
    uptime: 100,
    lastRun: '2026-10-06 02:11',
    docsLast7Days: 5,
    history: ok14,
  },
  {
    id: 'datago',
    name: 'Open Government Data (data.go.th)',
    portal: 'data.go.th',
    format: 'json',
    health: 'ok',
    uptime: 100,
    lastRun: '2026-10-06 02:11',
    docsLast7Days: 24,
    history: ok14,
  },
];

export const reviewQueue = [
  {
    docId: '68039587713',
    title: 'ประกวดราคาซื้อโปรแกรมบริการทางการแพทย์ โรงพยาบาลกระทุ่มแบน',
    agency: 'โรงพยาบาลกระทุ่มแบน',
    ingestedAt: '2026-10-05 18:22',
    ocr: 0.88,
    extraction: 0.87,
    lowFields: [
      { field: 'ราคากลาง (Reference Price)', value: '23,170,000', confidence: 0.87 },
      { field: 'งบประมาณ (Budget)', value: '23,170,000', confidence: 0.87 },
      { field: 'Submission Deadline', value: '2026-10-22', confidence: 0.77 },
      {
        field: 'Penalty Clause',
        value: 'ปรับร้อยละ 0.20 ของมูลค่าสัญญางานจ้างต่อวัน นับถัดจากวันครบกำหนดส่งมอบ',
        confidence: 0.82,
      },
      { field: 'Required Tech Stack', value: 'SQL, Windows Server', confidence: 0.87 },
    ],
  },
  {
    docId: '68099644960',
    title: 'ซื้อสิทธิการใช้บริการ Generative AI เพื่อการวิจัยและการเรียนการสอน',
    agency: 'สถาบันบัณฑิตพัฒนบริหารศาสตร์',
    ingestedAt: '2026-10-05 18:20',
    ocr: 0.92,
    extraction: 0.87,
    lowFields: [
      { field: 'ราคากลาง (Reference Price)', value: '299,920', confidence: 0.87 },
      { field: 'งบประมาณ (Budget)', value: '299,920', confidence: 0.87 },
      { field: 'Submission Deadline', value: '2026-10-18', confidence: 0.77 },
      {
        field: 'Penalty Clause',
        value: 'ปรับร้อยละ 0.20 ของมูลค่าสัญญางานจ้างต่อวัน นับถัดจากวันครบกำหนดส่งมอบ',
        confidence: 0.82,
      },
    ],
  },
  {
    docId: '68049322058',
    title: 'ประกวดราคาจ้างบริการพัฒนาและปรับปรุงระบบงานราคาสินค้า',
    agency: 'กองทุนบำเหน็จบำนาญข้าราชการ (กบข.)',
    ingestedAt: '2026-10-05 18:15',
    ocr: 0.9,
    extraction: 0.87,
    lowFields: [
      { field: 'ราคากลาง (Reference Price)', value: '1,796,185', confidence: 0.87 },
      { field: 'งบประมาณ (Budget)', value: '1,800,000', confidence: 0.87 },
      { field: 'Submission Deadline', value: '2026-10-20', confidence: 0.77 },
      {
        field: 'Penalty Clause',
        value: 'ปรับร้อยละ 0.20 ของมูลค่าสัญญางานจ้างต่อวัน นับถัดจากวันครบกำหนดส่งมอบ',
        confidence: 0.82,
      },
      { field: 'Required Tech Stack', value: 'Oracle, Linux', confidence: 0.87 },
    ],
  },
  {
    docId: '67079184063',
    title: 'ประกวดราคาซื้อโปรแกรมบริการทางการแพทย์ โรงพยาบาลสกลนคร',
    agency: 'โรงพยาบาลสกลนคร',
    ingestedAt: '2026-10-05 18:10',
    ocr: 0.95,
    extraction: 0.88,
    lowFields: [],
    misclassified: {
      predicted: 'IT / software',
      likely: 'Medical software / Equipment bundled — borderline scope',
    },
  },
];

/** Rolling counters for the admin summary strip. */
export const pipelineStats = {
  docsIngestedToday: 29,
  docsAwaitingReview: reviewQueue.length,
  avgOcrConfidence: 0.95,
  avgExtractionConfidence: 0.91,
  amendmentsDetected7d: 5,
};
