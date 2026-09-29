/**
 * Placeholder operational data for the admin dashboard (FR14, FR15).
 *
 * These used to be `client/app/_data/ops.ts`, imported at module scope by a
 * client component — which put every scraper name, error string, document id
 * and OCR confidence score into a public JavaScript chunk that anyone could
 * fetch. Hiding the nav link did nothing about that. They live here now so the
 * data can sit behind requireRole('admin') and simply never reach anyone else.
 *
 * Still fixtures: the real numbers come from the ingestion pipeline when
 * FR14/FR15 are built. What is real today is the boundary around them.
 *
 * Deliberately includes a broken scraper and a misclassified document — the
 * failure states are the reason this screen exists, so a happy-path dashboard
 * would be the wrong thing to design against.
 */

const ok14 = Array(14).fill(true);

/** `daysAgo` counts back from today, so index 13 is this morning's run. */
const withFailures = (daysAgo) => ok14.map((_, i) => !daysAgo.includes(13 - i));

export const scraperSources = [
  {
    id: 'egp-api',
    name: 'e-GP กรมบัญชีกลาง',
    portal: 'process3.gprocurement.go.th',
    format: 'json',
    health: 'ok',
    uptime: 100,
    lastRun: '2026-08-12 06:02',
    docsLast7Days: 38,
    history: ok14,
  },
  {
    id: 'bma-egp2',
    name: 'eGP BMA2',
    portal: 'bmaegp.bangkok.go.th',
    format: 'html',
    health: 'failed',
    uptime: 86.7,
    lastRun: '2026-08-12 06:04',
    docsLast7Days: 4,
    history: withFailures([0, 1]),
    error:
      'Selector `.announce-list > tr` matched 0 rows — the results table was rebuilt on 11 Aug. Last successful run: 10 Aug 06:03.',
  },
  {
    id: 'drainage',
    name: 'สำนักการระบายน้ำ',
    portal: 'dds.bangkok.go.th',
    format: 'scanned-pdf',
    health: 'ok',
    uptime: 99.1,
    lastRun: '2026-08-12 06:11',
    docsLast7Days: 6,
    history: ok14,
  },
  {
    id: 'traffic',
    name: 'สำนักการจราจรและขนส่ง',
    portal: 'traffic.bangkok.go.th',
    format: 'scanned-pdf',
    health: 'degraded',
    uptime: 94.3,
    lastRun: '2026-08-12 06:14',
    docsLast7Days: 3,
    history: withFailures([4, 9]),
    error:
      '3 of 7 PDFs timed out at download (>90s). The portal is rate-limiting; runs now retry twice.',
  },
  {
    id: 'medical',
    name: 'สำนักการแพทย์',
    portal: 'msdbangkok.go.th',
    format: 'image',
    health: 'ok',
    uptime: 97.8,
    lastRun: '2026-08-12 06:19',
    docsLast7Days: 5,
    history: withFailures([11]),
  },
  {
    id: 'districts',
    name: 'สำนักงานเขต 50 เขต',
    portal: '50 district sites',
    format: 'html',
    health: 'degraded',
    uptime: 91.2,
    lastRun: '2026-08-12 06:33',
    docsLast7Days: 19,
    history: withFailures([2, 6, 13]),
    error: '6 district sites unreachable: บางกะปิ, ลาดกระบัง, หนองจอก, ทวีวัฒนา, บางบอน, คลองสามวา.',
  },
];

export const reviewQueue = [
  {
    docId: 'BMA-2569-0142',
    title: 'จ้างพัฒนาระบบบริหารจัดการข้อมูลน้ำท่วมและระบบเตือนภัยล่วงหน้า ระยะที่ 2',
    agency: 'สำนักการระบายน้ำ',
    ingestedAt: '2026-07-28 06:11',
    ocr: 0.71,
    extraction: 0.64,
    lowFields: [
      { field: 'ราคากลาง (Maximum Budget)', value: '12,400,000', confidence: 0.58 },
      {
        field: 'Required Tech Stack',
        value: 'NGINX Plus, Windows Server 2019, Oracle 19c',
        confidence: 0.61,
      },
    ],
  },
  {
    docId: 'BMA-2569-0088',
    title: 'จ้างพัฒนาระบบสารสนเทศโรงพยาบาลในสังกัดกรุงเทพมหานคร ระยะที่ 1',
    agency: 'สำนักการแพทย์',
    ingestedAt: '2026-05-19 06:22',
    ocr: 0.83,
    extraction: 0.77,
    lowFields: [{ field: 'ราคากลาง (Maximum Budget)', value: '22,000,000', confidence: 0.66 }],
  },
  {
    docId: 'BMA-2569-0271',
    title: 'จ้างเหมาปรับปรุงภูมิทัศน์สวนสาธารณะคลองช่องนนทรี ระยะที่ 3',
    agency: 'สำนักสิ่งแวดล้อม',
    ingestedAt: '2026-08-11 06:08',
    ocr: 0.97,
    extraction: 0.94,
    lowFields: [],
    misclassified: { predicted: 'IT / software', likely: 'Civil works — out of scope' },
  },
  {
    docId: 'BMA-2569-0268',
    title: 'จ้างพัฒนาระบบบริหารจัดการงานซ่อมบำรุงอาคาร',
    agency: 'สำนักการโยธา',
    ingestedAt: '2026-08-10 06:15',
    ocr: 0.69,
    extraction: 0.58,
    lowFields: [
      { field: 'Submission Deadline', value: '2569-09-0?', confidence: 0.41 },
      { field: 'Penalty Clause', value: 'ร้อยละ 0.2? ต่อวัน', confidence: 0.52 },
    ],
  },
];

/** Rolling counters for the admin summary strip. */
export const pipelineStats = {
  docsIngestedToday: 12,
  docsAwaitingReview: reviewQueue.length,
  avgOcrConfidence: 0.89,
  avgExtractionConfidence: 0.84,
  amendmentsDetected7d: 5,
};
