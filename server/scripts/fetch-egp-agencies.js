/**
 * server/scripts/fetch-egp-agencies.js
 *
 * Refreshes the list of agencies the nightly sweep asks the e-GP feed about
 * (ADR 0027), from e-GP's own list of purchasing units on data.go.th
 * (`egpdepartment`, published by THAILAND GOVERNMENT SPENDING).
 *
 * Central government only, for now: the four groups below, about 270 units.
 * The feed takes their codes as `deptId` whatever the format, `0307`,
 * `11012` or `A004` (seen 2026-10-13). Left out:
 * - 2-digit codes, which name a ministry or a group: the feed returns nothing
 *   for them (`03`), so there's no asking a whole ministry at once.
 * - 12-digit codes, offices under a department (สำนักงานคลังจังหวัด…), which
 *   returned nothing either.
 * Local government, schools, hospitals and state enterprises are other groups
 * (ADR 0027).
 *
 * Usage:
 *   npm run agencies:fetch
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { paceRequest } from '#pipeline/shared/request-pacer.js';
import { USER_AGENT } from '#pipeline/shared/user-agent.js';

const API = 'https://data.go.th/api/3/action';
const DATASET = 'egpdepartment';
const OUTPUT = path.resolve(import.meta.dirname, '../src/pipeline/ingestion/data/egp-agencies.json');

// Central government, as `สังกัด` names its groups
const GROUPS = [
  'ส่วนราชการทั่วไป',
  'องค์การมหาชน',
  'องค์กรอิสระตามรัฐธรรมนูญ',
  'หน่วยงานของรัฐที่ไม่สังกัดสำนักนายกรัฐมนตรี กระทรวงหรือทบวง',
];

async function call(action, params) {
  const url = new URL(`${API}/${action}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  await paceRequest(url.toString());
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60_000) });
  const body = await response.json();
  if (!body.success) throw new Error(`data.go.th ${action}: ${JSON.stringify(body.error).slice(0, 200)}`);
  return body.result;
}

async function main() {
  const dataset = await call('package_show', { id: DATASET });
  const resource = dataset.resources.find((r) => r.datastore_active);
  if (!resource) throw new Error(`${DATASET} has no queryable table on data.go.th`);

  const agencies = [];
  const skipped = [];
  for (const group of GROUPS) {
    const { records, total } = await call('datastore_search', {
      resource_id: resource.id,
      filters: { 'สังกัด': group },
      limit: 1000,
    });
    if (records.length < total) throw new Error(`${group}: got ${records.length} of ${total} rows`);
    for (const row of records) {
      const code = String(row['รหัสหน่วยงาน'] ?? '').trim();
      const name = String(row['ชื่อหน่วยงาน'] ?? '').trim();
      if (code && !/^\d{1,2}$|^\d{12}$/.test(code)) agencies.push({ code, name, group });
      else skipped.push(`${code} ${name}`);
    }
    console.log(`${group}: ${records.length}`);
  }

  agencies.sort((a, b) => a.code.localeCompare(b.code));
  const duplicates = agencies.filter((a, i) => i > 0 && a.code === agencies[i - 1].code);
  if (duplicates.length) throw new Error(`Duplicate codes: ${duplicates.map((a) => a.code).join(', ')}`);

  const list = {
    source: `https://data.go.th/dataset/${DATASET}`,
    sourceModified: resource.last_modified ?? dataset.metadata_modified ?? null,
    fetchedAt: new Date().toISOString(),
    groups: GROUPS,
    agencies,
  };
  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, `${JSON.stringify(list, null, 2)}\n`);
  console.log(`\n${agencies.length} agencies written to ${path.relative(process.cwd(), OUTPUT)}`);
  if (skipped.length) console.log(`Left out (a ministry, a group or an office): ${skipped.length}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
