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
  requestStreak: {
    inARow: 0,
    limit: 230,
    lastAt: null,
    cooldownRemainingMs: 0,
  },
};

/** Fallback snapshot of pipeline funnel stages when collections are cold or empty. */
export const defaultStageSnapshot = {
  stages: {
    fetched: 14,
    downloaded: 8,
    ocr_preview: 2,
    ocr_done: 22,
  },
  screens: {
    pass: 28,
    not_it: 16,
  },
  insights: {
    extracted: 20,
    excluded: 2,
    'awaiting full text': 2,
  },
};

/** Fallback list of stuck / failing pipeline steps. */
export const defaultPipelineFailures = [
  {
    projectId: '68049205582',
    projectTitle: 'จ้างบำรุงรักษาและพัฒนาระบบคลาวด์กลาง กรมการจัดหางาน',
    agency: 'กรมการจัดหางาน',
    step: 'ocr',
    attempts: 2,
    lastError: 'OCR timeout: 62 pages scanned at 300dpi exceeded 60s processing budget',
    lastTransient: false,
    firstFailedAt: '2026-10-14 06:12:00',
    lastFailedAt: '2026-10-14 07:15:22',
  },
  {
    projectId: '68099120441',
    projectTitle: 'ซื้อระบบวิเคราะห์ข้อมูลจราจรอัจฉริยะ',
    agency: 'กรุงเทพมหานคร',
    step: 'extract',
    attempts: 1,
    lastError: 'Gemini API 429: Resource has been exhausted (rate limit exceeded)',
    lastTransient: true,
    firstFailedAt: '2026-10-14 08:30:11',
    lastFailedAt: '2026-10-14 08:30:11',
  },
];

/** Fallback recent scheduled job executions. */
export const defaultPipelineRuns = [
  {
    id: 'run-fixture-01',
    job: 'poll',
    outcome: 'done',
    startedAt: '2026-10-14 08:00:00',
    finishedAt: '2026-10-14 08:03:45',
    durationMs: 225000,
    steps: [
      { name: 'ingest fetch', exitCode: 0, ms: 14200 },
      { name: 'screen', exitCode: 0, ms: 8900 },
      { name: 'ingest download', exitCode: 0, ms: 45000 },
      { name: 'ingest ocr', exitCode: 0, ms: 85000 },
      { name: 'extract', exitCode: 0, ms: 71900 },
    ],
    error: null,
  },
];

