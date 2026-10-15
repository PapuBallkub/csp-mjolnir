/**
 * server/src/pipeline/ingestion/sources/datago-contracts.js
 *
 * Reads data.go.th's e-GP contracts for fiscal year 2568 (`egp-contact-2568`)
 * from its CSV files (ADR 0028). Not from the API: it holds only 74% of the
 * rows. See docs/data-sources/data_go_th.md for what was checked.
 *
 * Every row is a signed contract, never an open project. The header names 31
 * columns but each row has 28 values, so a value's heading is wrong from the
 * 16th on: rows are read by position, and a file whose status column doesn't
 * hold a status word is refused.
 */

import { Readable } from 'node:stream';
import { parse } from 'csv-parse';
import { paceRequest } from '../../shared/request-pacer.js';
import { USER_AGENT } from '../../shared/user-agent.js';

export const DATASET = 'egp-contact-2568';
const API = 'https://data.go.th/api/3/action';

// The header names 31 columns in parts 2–10 and 26 in part 1 (no district
// or English location headings). Every row has the same 28 values either way.
export const HEADINGS = [31, 26];
export const VALUES_PER_ROW = 28;

// What each value really is, by position from 0 (the docs count from 1)
const AT = {
  projectId: 1,
  title: 2,
  kind: 3, // ชื่อประเภทโครงการ: ซื้อ, จ้าง, เช่า
  agency: 4,
  subAgency: 5,
  method: 7, // กลุ่มวิธีจัดซื้อฯ; position 6 holds the same text in every row
  announcedOn: 8,
  budget: 9,
  referencePrice: 10,
  agreedPrice: 11,
  fiscalYear: 12,
  province: 14,
  district: 15, // under จังหวัด (Eng)
  projectStatus: 17, // under เขต/อำเภอ (Eng)
  winnerTaxId: 21, // under พิกัดของโครงการ
  winnerName: 22, // under ละติจูดโครงการ
  contractNo: 23, // under ลองจิจูดโครงการ
  signedOn: 24, // under เลขนิติบุคคล
  endsOn: 25, // under ชื่อผู้ชนะ
  contractAmount: 26, // under เลขที่สัญญา
  contractStatus: 27, // under วันที่ลงนามสัญญา
};

export const STATUS_WORDS = ['ระหว่างดำเนินการ', 'สิ้นสุดสัญญา'];

const THAI_MONTHS = {
  'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6,
  'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12,
};

const KINDS = { ซื้อ: 'buy', จ้าง: 'hire', เช่า: 'rent' };

const text = (value) => String(value ?? '').trim();

/** "9 เม.ย. 68", Buddhist era, as "2025-04-09"; null when it isn't one. */
export function parseThaiShortDate(value) {
  // The whole Thai block: months have vowels too (เม.ย., มิ.ย.)
  const match = text(value).match(/^(\d{1,2})\s*([ก-๙.]+)\s*(\d{2}|\d{4})$/);
  const month = match && THAI_MONTHS[match[2]];
  if (!month) return null;
  const year = match[3].length === 2 ? 2500 + Number(match[3]) - 543 : Number(match[3]) - (Number(match[3]) > 2400 ? 543 : 0);
  const day = Number(match[1]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/** An amount in baht, or null for an empty, zero or unreadable one. */
export function parseAmount(value) {
  const amount = Number(text(value).replace(/,/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

/** A contract number, or null for the placeholders and broken text the file holds ("-", "*", "���"). */
export function cleanContractNo(value) {
  const number = text(value);
  if (!/[0-9๐-๙A-Za-zก-ฮ]/.test(number) || number.includes('�')) return null;
  return number;
}

/** Why a row can't be read by position, or null when it can. */
export function checkRow(values) {
  if (!Array.isArray(values) || values.length !== VALUES_PER_ROW) {
    return `${values?.length ?? 0} values, not ${VALUES_PER_ROW}`;
  }
  if (!STATUS_WORDS.includes(text(values[AT.projectStatus]))) {
    return `no status word at position ${AT.projectStatus + 1}: "${text(values[AT.projectStatus]).slice(0, 30)}"`;
  }
  if (!/^\d{11}$/.test(text(values[AT.projectId]))) return `no 11-digit project ID: "${text(values[AT.projectId])}"`;
  return null;
}

/** A row's values, read by position and cleaned (checkRow first). */
export function readRow(values) {
  const fiscalYear = Number.parseInt(text(values[AT.fiscalYear]), 10);
  return {
    projectId: text(values[AT.projectId]),
    title: text(values[AT.title]),
    kind: KINDS[text(values[AT.kind])] ?? null,
    agency: text(values[AT.agency]),
    subAgency: text(values[AT.subAgency]),
    method: text(values[AT.method]),
    announcedOn: parseThaiShortDate(values[AT.announcedOn]),
    budgetTHB: parseAmount(values[AT.budget]),
    referencePriceTHB: parseAmount(values[AT.referencePrice]),
    agreedPriceTHB: parseAmount(values[AT.agreedPrice]),
    fiscalYear: Number.isInteger(fiscalYear) ? fiscalYear : null,
    province: text(values[AT.province]),
    district: text(values[AT.district]),
    projectStatus: text(values[AT.projectStatus]),
    winnerTaxId: text(values[AT.winnerTaxId]) || null,
    winnerName: text(values[AT.winnerName]) || null,
    contractNo: cleanContractNo(values[AT.contractNo]),
    signedOn: parseThaiShortDate(values[AT.signedOn]),
    endsOn: parseThaiShortDate(values[AT.endsOn]),
    contractAmountTHB: parseAmount(values[AT.contractAmount]),
    contractStatus: text(values[AT.contractStatus]),
  };
}

/**
 * One project from its rows. The file has a row per contract, and a project
 * awarded to several winners has several (1.7% of the IT ones): the same
 * project values on each, a winner, number and amount of its own. The amounts
 * add up to the agreed price. The first row's winner stays the project's
 * winner; every winner is kept in `winners`, and the amount is the total.
 *
 * @param {object[]} rows - readRow results, all for one project, in file order
 */
export function mergeContracts(rows) {
  const [first] = rows;
  const winners = rows.map((row) => ({
    name: row.winnerName,
    taxId: row.winnerTaxId,
    contractNo: row.contractNo,
    signDate: row.signedOn,
    endDate: row.endsOn,
    amountTHB: row.contractAmountTHB,
    contractStatus: row.contractStatus,
  }));
  const amounts = rows.map((row) => row.contractAmountTHB).filter((amount) => amount > 0);
  return {
    ...first,
    contractAmountTHB: amounts.length ? amounts.reduce((sum, amount) => sum + amount, 0) : null,
    winners,
  };
}

/**
 * Whether a project was announced publicly, so e-GP has its documents. A
 * direct purchase (เฉพาะเจาะจง, 76% of rows) never had a public TOR, and an
 * e-market buy is from a catalogue.
 */
export function isPubliclyAnnounced(method) {
  const name = text(method);
  return Boolean(name) && !/เฉพาะเจาะจง|ตลาดอิเล็กทรอนิกส์|e-market/i.test(name);
}

// Loose on purpose: the title screen decides after this, and an IT project
// with an oddly worded title shouldn't be lost before it gets there
const IT_WORDS = [
  'คอมพิวเตอร์', 'ซอฟต์แวร์', 'ซอฟแวร์', 'โปรแกรม', 'สารสนเทศ', 'เทคโนโลยี', 'ดิจิทัล', 'ดิจิตอล',
  'เว็บ', 'แอปพลิเคชัน', 'แอพพลิเคชั่น', 'แอปพลิเคชั่น', 'ฐานข้อมูล', 'ศูนย์ข้อมูล', 'เครือข่าย',
  'อินเทอร์เน็ต', 'อินเตอร์เน็ต', 'เซิร์ฟเวอร์', 'แม่ข่าย', 'คลาวด์', 'ลิขสิทธิ์', 'ไลเซนส์', 'ระบบงาน',
  'ระบบบริหาร', 'ระบบจัดการ', 'ระบบติดตาม', 'ระบบสาร', 'ระบบข้อมูล', 'ระบบออนไลน์', 'ออนไลน์',
  'อิเล็กทรอนิกส์', 'ปัญญาประดิษฐ์', 'ไซเบอร์', 'ความมั่นคงปลอดภัย', 'กล้องวงจรปิด', 'แพลตฟอร์ม',
  'สมาร์ท', 'อัจฉริยะ', 'ไวไฟ', 'ระบบประชุม', 'ระบบสื่อสาร', 'ระบบคิว', 'ระบบสแกน',
];
const IT_PATTERNS = [
  /\b(software|database|network|internet|server|cloud|license|platform|online|digital|website|web|application|app|apps|data|cyber|security|cctv|iot|smart|erp|crm|gis|ai|it|ict|mis|vpn|wifi|wi-fi|lan|wan|firewall|microsoft|windows|oracle|sap|vmware|adobe|zoom)\b/i,
];

/** The title without its "ด้วยวิธี…" ending, which names the method ("…อิเล็กทรอนิกส์ (e-bidding)"). */
export const titleWithoutMethod = (title) => text(title).replace(/\s*(ด้วยวิธี|โดยวิธี).*$/s, '');

/** Whether a title has any word that IT work usually has. */
export function looksIt(title) {
  const words = titleWithoutMethod(title);
  return IT_WORDS.some((word) => words.includes(word)) || IT_PATTERNS.some((pattern) => pattern.test(words));
}

/**
 * The dataset's CSV files, in their published order (part 1 first).
 *
 * @returns {Promise<{ part: number, id: string, name: string, url: string, sizeBytes: number|null }[]>}
 */
export async function listParts({ fetchImpl = fetch, pace = paceRequest } = {}) {
  const url = `${API}/package_show?id=${DATASET}`;
  await pace(url);
  const response = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60_000) });
  const body = await response.json();
  if (!body.success) throw new Error(`data.go.th: ${JSON.stringify(body.error).slice(0, 200)}`);
  return body.result.resources
    .filter((resource) => /csv/i.test(resource.format ?? ''))
    .map((resource, index) => ({ part: index + 1, id: resource.id, name: resource.name, url: resource.url, sizeBytes: resource.size ?? null }));
}

/**
 * Reads one CSV file's rows as arrays of values, header first. Accepts a
 * stream, so tests can hand it text.
 *
 * @param {import('node:stream').Readable} stream
 * @param {(values: string[], line: number) => Promise<void>|void} onRow - every row after the header
 * @returns {Promise<{ header: string[] }>}
 */
export async function readCsv(stream, onRow) {
  const parser = stream.pipe(parse({ bom: true, relax_column_count: true, relax_quotes: true, skip_empty_lines: true }));
  let header = null;
  let line = 0;
  for await (const values of parser) {
    line++;
    if (!header) {
      header = values.map((value) => text(value));
      if (!HEADINGS.includes(header.length) || header[AT.projectId] !== 'รหัสโครงการ') {
        throw new Error(`Unexpected header: ${header.length} columns, position 2 is "${header[AT.projectId]}"`);
      }
      continue;
    }
    await onRow(values, line);
  }
  return { header };
}

/** Opens one CSV file from data.go.th as a stream. */
export async function openPart(part, { fetchImpl = fetch, pace = paceRequest } = {}) {
  await pace(part.url);
  const response = await fetchImpl(part.url, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok || !response.body) throw new Error(`Part ${part.part}: HTTP ${response.status}`);
  return Readable.fromWeb(response.body);
}
