# data.go.th: the government's open-data portal

What data.go.th offers for procurement, checked against the portal itself
(2026-10-13 to 2026-10-15). Facts marked **Seen** were tested live.

## What the pipeline uses it for

- **e-GP's agency codes,** from the dataset `egpdepartment`, for the feed
  sweep: `npm run agencies:fetch` writes
  `ingestion/data/egp-agencies.json` ([0027](../decisions/0027-run-the-pipeline-on-a-schedule.md)).
- **Past contracts, for price comparisons:** `npm run history:import` reads
  `egp-contact-2568`'s CSV files by position and keeps the publicly announced
  ones whose titles look like IT, as ordinary projects with status Awarded
  ([0028](../decisions/0028-past-projects-from-data-go-th.md)).
- An older reader (`--source datago`) searched the contracts for a few rows
  each run, read their columns wrongly (below) and stored finished contracts
  as Open. It was removed on 2026-10-15.

data.go.th has **past contracts only, never open projects.** Open projects
come from the e-GP feed ([process3_gprocurement.md](process3_gprocurement.md)).

## The portal

| Fact | Status |
|---|---|
| CKAN, at `https://data.go.th/api/3/action/<action>`. Every answer is JSON, `{ success, result }`. | Seen |
| No key, account or captcha. | Seen |
| It answers the pipeline's own User-Agent (`pipeline/shared/user-agent.js`). | Seen 2026-10-13 |
| `package_show?id=<dataset>` lists a dataset's files, each a `resource`. | Seen |
| `datastore_search?resource_id=…` queries a file loaded into CKAN's database. | Seen |
| **`datastore_search_sql` is switched off for the public:** HTTP 403. | Seen 2026-10-13 |
| A query answers in 0.2–5 s: a sort over 500,000 rows takes seconds. | Seen 2026-10-13 |
| It answered at every hour we tried: evening, night and day. No limit hit at one request a second. | Seen 2026-10-13 to 15 |

`datastore_search` parameters:

| Parameter | What it does | Trust it? |
|---|---|---|
| `limit`, `offset` | Paging | Yes |
| `filters` | Exact match, e.g. `{"กลุ่มวิธีจัดซื้อฯ": "คัดเลือก"}`, counted over the whole file | Yes |
| `fields`, `distinct` | Chosen columns; every distinct value of a column | Yes |
| `sort` | Server-side sort, e.g. `"ลำดับ" desc` | Yes |
| `q` | Keyword search over the whole row | **No, not for Thai** (below) |

## The e-GP datasets

All published by the organisation `dga`, sourced from THAILAND GOVERNMENT
SPENDING (govspending.data.go.th, whose own API needs a registered key).

| Dataset | What it holds | Rows |
|---|---|---|
| `egp-contact-2568` | One row per contract, fiscal year 2568 | 4,687,437 in 10 CSV files |
| `egpdepartment` | Purchasing units and their codes (`รหัสหน่วยงาน`) | 64,134 |
| `egpsubdepartment` | Sub-units, with addresses | 25,500 |
| `egpwinner` | Company tax ID and name, nothing else | over 2 million (5 files) |
| `summary_cgdcontract` | Per unit and year (FY2558–2568): number of projects and total budget | 119,220 in each year checked |
| `cgd_egp_01`–`06` | Which agencies used e-GP each year | small |

There is **no** `egp-contact-2567` or `egp-contact-2569` (Seen 2026-10-15):
FY2568 is the only year with one row per contract.

## `egp-contact-2568`

**A one-off snapshot.** The dataset page says it isn't updated after
collection ("ไม่มีการปรับปรุงหลังจากการจัดเก็บข้อมูล"). It covers fiscal
year 2568, October 2024 to September 2025.

### Every row is a signed contract (Seen 2026-10-13)

Over all 3,484,583 rows the API holds:
- The project status takes two values only, and they add up to the total:
  ระหว่างดำเนินการ (the contract's work is under way) 3,328,086, and
  สิ้นสุดสัญญา (the contract has ended) 156,497. "ระหว่างดำเนินการ" doesn't
  mean bidding is open.
- Every row checked has a contract number, a signing date and an amount.
  8,029 rows (0.2%) have a blank winner name, but still the winner's tax ID.

So on our scale every row is **Awarded**, never Open.

### The API holds only 74% of it (Seen 2026-10-13)

Six of the ten files stopped loading into CKAN partway. Row numbers
(`ลำดับ`) run on from file to file, so the first and last of each tell:

| Part | `resource_id` | Rows in the CSV | Rows in the API |
|---|---|---|---|
| 1 | `e4eaa1b4-eb1a-4534-b227-988ee25b898d` | 511,606 | all |
| 2 | `9ae119c4-73b9-4bb6-9b71-7b355269bc00` | 504,888 | 365,500 (72%) |
| 3 | `1c1a90af-2d47-4bfb-ae87-e479b2582257` | 502,877 | 334,750 (67%) |
| 4 | `c2385bd6-7e2a-40c2-94d8-6a65824c9415` | 502,210 | 75,750 (15%) |
| 5 | `bb538ac1-3455-446d-b975-d709d6439e72` | 501,872 | all |
| 6 | `5b98d6ba-0f66-4bb1-b8db-9b9aae928171` | 501,722 | 378,000 (75%) |
| 7 | `037adcca-b349-44f6-9686-9fd1e9182227` | 501,301 | 207,000 (41%) |
| 8 | `26316135-a95f-40e3-b2e8-1c912046c0ed` | 501,124 | all |
| 9 | `882332c4-1f60-4db7-9962-9062eb08f6c4` | 500,981 | all |
| 10 | `35961821-d945-4fc0-8ce1-a96b4cd46bd6` | 158,856 | 108,000 (68%) |

To read every row, read the CSV files (about 5 GB together), not the API.

### The columns are mislabelled, in the CSV itself (Seen 2026-10-13)

Every row has 28 values, in the same order in every file. The header names
31 columns in parts 2–10 and 26 in part 1, which also leaves out the district
headings (Seen 2026-10-15). Either way the values don't line up with their
headings: in parts 2–10, the three English location columns are missing
from the data, so from the 16th value on each sits under the wrong heading,
and the last three headings are always empty. Read by position:

| Position | Heading | What it really holds |
|---|---|---|
| 1–15 | ลำดับ … จังหวัด | What the heading says |
| 16 | จังหวัด (Eng) | District (เขต/อำเภอ), in Thai |
| 17 | เขต/อำเภอ | Subdistrict (แขวง/ตำบล), in Thai |
| **18** | เขต/อำเภอ (Eng) | **Project status:** ระหว่างดำเนินการ or สิ้นสุดสัญญา |
| 19 | แขวง/ตำบล | Coordinates, `POINT(lon lat)`, often empty |
| 20 | แขวง/ตำบล (Eng) | Latitude |
| 21 | สถานะโครงการ | Longitude |
| 22 | พิกัดของโครงการ | Winner's tax ID (masked for a person: `110140173xxxx`) |
| 23 | ละติจูดโครงการ | Winner's name |
| 24 | ลองจิจูดโครงการ | Contract number |
| 25 | เลขนิติบุคคล | Signing date |
| 26 | ชื่อผู้ชนะ | End date |
| 27 | เลขที่สัญญา | Contract amount |
| 28 | วันที่ลงนามสัญญา | Contract status |
| 29–31 | วันที่สิ้นสุดสัญญา, งบสัญญา(บาท), สถานะสัญญา | Empty |

- Position 7, `วิธีจัดซื้อฯ`, holds the same text in every row ("วิธีการจัดหา
  ประกาศเชิญชวนทั่วไป คัดเลือก เฉพาะเจาะจง"). The method is position 8,
  `กลุ่มวิธีจัดซื้อฯ`.
- Headings vary in spacing between files: `จังหวัด (Eng)` in most,
  `จังหวัด(Eng)` in one. Another reason to read by position.
- A reader can check it's reading right: position 18 must hold one of the two
  status words.

### One row per contract (Seen 2026-10-15)

A project awarded to several winners has a row for each contract: the same
project values (title, ราคากลาง, agreed price) on every row, and a winner,
contract number and amount of its own. The amounts add up to the agreed
price. Among the publicly announced IT-looking rows, 111 of 6,593 projects
(1.7%) have several, e.g. a digital-radio project split three ways
(218.4 + 460.6 + 363.6 million = 1,042.6 million agreed).

### Values to clean

- Dates are short and Buddhist-era: `9 เม.ย. 68` is 2025-04-09.
- A person's ID is masked: `110140173xxxx`.
- Contract numbers include junk: `-`, `*`, broken characters.

### What it's made of (Seen 2026-10-15, part 1)

| Method (`กลุ่มวิธีจัดซื้อฯ`) | Share |
|---|---|
| เฉพาะเจาะจง (direct purchase) | 76.4% |
| ประกวดราคาอิเล็กทรอนิกส์ (e-bidding) | 19.6% |
| คัดเลือก (selection) | 3.6% |
| Consultants, design, e-market | 0.4% |

Across all ten files (Seen 2026-10-15), only 120,560 rows (2.6%) were
publicly announced, and 119,806 of them are in part 1: the files are
grouped by method, and parts 2–10 are almost all direct purchases.

A direct purchase has no public announcement or TOR on e-GP. Projects that
were announced publicly do: by the project ID in this dataset, e-GP still
serves their document package and price form (tested on 67099725090,
announced April 2025). How far back e-GP keeps them isn't known yet.

### Keyword search (`q`) can't be trusted with Thai (Seen 2026-10-13)

In part 1, `q=ครุภัณฑ์คอมพิวเตอร์` finds 22 rows and
`q=ซื้อครุภัณฑ์คอมพิวเตอร์` finds 1,205: a longer phrase, 55 times more
rows. The search splits text into words at spaces, and Thai doesn't put
spaces between words. Use `filters`, or read the rows and match in code.

## `egpdepartment`

64,134 purchasing units, in groups (`สังกัด`):

| Group | Units | Code format |
|---|---|---|
| ส่วนราชการประเภทสถานศึกษา (schools) | 41,095 | `E15090407` |
| ส่วนราชการประเภทสถานพยาบาล (hospitals) | 12,265 | `001245800` |
| องค์การบริหารส่วนตำบล | 6,711 | `E15083400` |
| เทศบาลตำบล, เทศบาลเมือง, เทศบาลนคร | 3,324 | `E15084602` |
| ส่วนราชการทั่วไป (central government) | 286 | `0307`, also 2- and 12-digit codes |
| รัฐวิสาหกิจ (state enterprises) | 150 | `S546` |
| หน่วยงานอื่นของรัฐที่จัดตั้งโดยกฎหมายเฉพาะ | 131 | `70200` |
| องค์การบริหารส่วนจังหวัด | 84 | `2810101` |
| องค์การมหาชน | 51 | `1914`, `11012` |
| Other groups | 37 | |

The feed takes these codes as `deptId`, whatever the format. Which ones the
sweep uses, and why, is in [process3_gprocurement.md](process3_gprocurement.md).

## Corrections to the previous version of this page

The earlier version said several things that turned out to be wrong:
- **"Historical and ongoing" data, synced weekly or monthly.** It's one
  fiscal year, collected once and never updated.
- **The data dictionary** listed headings with values that are actually
  under other headings: in the CSV and the API, `ชื่อผู้ชนะ` holds the end
  date, `เลขนิติบุคคล` the signing date and `เลขที่สัญญา` the amount.
- **Ten partitions, all queryable:** the API holds 74% of the rows.
- **Full-text search matches Thai keywords:** it doesn't, reliably.
- **`egp-contact-2567` exists:** it doesn't.
- **Latency of 150–400 ms:** queries take 0.2–5 s.
- **Code examples sent a browser's User-Agent** (`Mozilla/5.0`). The
  pipeline names itself honestly, and data.go.th answers it.
