# 0028 · Past projects from data.go.th, as ordinary projects

Status: proposed · 2026-10-15 · amended by [0030](0030-run-the-night-in-priority-waves.md): past projects are read in the night's last wave, between two comparison runs

## Context

FR-19 compares a TOR's price with similar past projects. The feed brings few
of those: an agency may post one or two IT tenders a month in a category, and
a median of one or two means nothing.

data.go.th has one row per signed contract for fiscal year 2568, 4.69
million in all ([data_go_th.md](../data-sources/data_go_th.md)). Reading it
takes care:
- **Its API holds 74% of the rows;** the CSV files hold them all.
- **Its headings are wrong** from the 16th value on, so rows are read by
  position. Part 1's header even has a different length (26, not 31); the
  values are the same.
- **Three quarters are direct purchases** (เฉพาะเจาะจง), which never had a
  public TOR.

e-GP still serves the documents of a publicly announced past project, by
the project ID data.go.th gives (tested on one from April 2025). So a past
project can be read like a current one, later.

The team agreed (2026-10-15):
- no "past project" concept: a past project is a project, the same records;
- a loose title screen first;
- detailed comparisons against fully extracted projects only;
- benchmarks include past projects;
- extraction of past projects lazily, a fixed number a night (a later
  change).

The old data.go.th reader got all of this wrong and was removed first
(#251).

## Decision

**1. Past contracts are ordinary `Tor` records,** with status Awarded,
`source: 'datago'` and their `contract`. They're upserted by project ID: a
project we already have keeps every value it has and gains its contract.
Nothing is ever moved between collections, because a project the feed
follows becomes past the same way. The file has a row per contract: a
project split between winners (1.7% of the IT ones) is merged into one
project, its amount the total and every winner kept in `contract.winners`.

**2. Only what's useful is imported** (`npm run history:import`, no
Gemini):
- read from the CSV files, by position, each file checked first;
- publicly announced only, so no direct purchases or e-market buys;
- titles that look like IT, by a loose keyword list in code, with the method
  phrase ("ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์") taken off first;
- `--dry-run` counts what each filter keeps and estimates the title
  screen's tokens.

**3. The title screen decides what is IT, when asked**
(`npm run screen -- --past`). It now also names the category (`screen-v2`).
It is never part of the scheduled jobs: thousands of titles are a spending
decision.

**4. A title-level TorInsight record (`metadata.titleOnly`)** for each past
project found `it`:
- `identification`: title, agency, department, category, status Awarded;
- `facts`: budget, ราคากลาง, the agreed price (new, `facts.agreedPriceTHB`),
  method, posted date and links;
- every other section empty, nothing quoted, no score.

It is built in code, with no Gemini call beyond the screen. It is never
written over a full extraction or a not-IT verdict. Full extraction replaces
it: the documents make a different fingerprint, so extraction treats it as a
changed source.

**A past project found `unsure` gets no record** until its documents are
read, so it counts nowhere. The full screen (2026-10-16) found 2,689 of
them, mostly hardware the title couldn't rule out: computer equipment
(ครุภัณฑ์คอมพิวเตอร์), servers, LED signs, CCTV. If it were counted, it would
skew benchmarks towards hardware prices. It can still be chosen to be read
in full, after the IT ones (7). A title-level record whose project is later
screened `unsure` or `not_it` is removed.

**5. Who reads title-level records:**

| Reader | Uses them? |
|---|---|
| Benchmarks and `/watchdog` totals; choosing what to extract next | Yes: category and prices are all they need |
| The site (visibility filter), the watchlist | No: there's no summary to show |
| Detailed comparisons (`FULL_EXTRACTION`) | No, and records waiting for their full text are left out too |
| Ingestion's "already extracted" list | No |
| The review queue, when it's built | No |

**6. A signed contract means Awarded:** a winner's name, a contract number
or a price (`hasSignedContract`). data.go.th leaves the name blank on 8,029
signed contracts.

**7. Past projects are read in full a few a night** (`ingest --step
history`, in the 22:00 `process` job). It chooses up to `HISTORY_PER_NIGHT`
(20) past projects:
- **For the open IT TORs, soonest deadline first.** Each one gets past
  projects until it has `HISTORY_ENOUGH_RELATED` (5) related ones. Only then
  does the next TOR's turn come: a TOR closing tomorrow matters more than an
  even spread. 5 is a step, not a limit. Once every open TOR has 5, the
  soonest goes on to 10, then the next, and so on.
- **Related** means a project already read in full that the TOR's comparison
  would list: the same category, 0.3× to 3× its price. It can be past or
  new, since what matters is relevance, not age. A past project already
  chosen for that TOR and not read yet counts too, so a TOR isn't given more
  while its picks wait. One found not IT once read, or one that gave up,
  stops counting, and the TOR's turn comes again.
- **Candidates are ranked by the comparison's own score, then by the closest
  price.** A past project not read yet has only a title and prices, and the
  score weighs what a full read finds, such as technologies, so many
  candidates tie on it. Those found `it` come first, and `unsure` ones only
  after every `it` one in the band.
- **Only e-bidding projects are candidates.** Selection (คัดเลือก) and
  consultant projects were announced publicly too, but e-GP keeps no
  announcement package for them. On the first real night (2026-10-18), all 7
  of those chosen had none, and all 13 e-bidding ones had one. That's 1,225
  of the 6,642 imported.
- **The newest,** IT first, only on a night when no open TOR has a candidate
  left.

A chosen project is marked `Tor.historyRequestedAt`, and
`Tor.historyRequestedFor` names the open TOR it was chosen for. Download takes it
although it's awarded and skips the title screen, which has already passed
it. OCR previews it like any scan, and classify reads the preview. This
matters because the screen let through 2,689 past projects as `unsure`, most
of them hardware: a computer purchase (ครุภัณฑ์คอมพิวเตอร์), servers, LED
signs. Classify drops one of those after 6 pages, where reading the whole
scan would take up to 10 minutes. One found IT is read whole and extracted
the same night, since the job runs OCR and extraction twice. Either way, the
result replaces the title-level record. Projects chosen earlier and
not downloaded yet count against the night's number. A past project e-GP has
no package for gives up at once: an awarded project won't get one later.

The same job refreshes the comparisons (`find-comparable --all --save`)
right before choosing, and again once tonight's past projects are read
([0030](0030-run-the-night-in-priority-waves.md)). Past projects are the
night's last wave: new TORs and changes go first.

## Changes to the records

| Model | Change |
|---|---|
| `Tor.contract` | `amountTHB` (งบสัญญา, the total), `fiscalYear`, `contractStatus`, `winners` |
| `Tor` | `historyRequestedAt` (Date, default null, indexed): chosen to be read in full; `historyRequestedFor` (String, default null): the open TOR it was chosen for |
| `TorInsight.metadata` | `titleOnly` (Boolean, default false, indexed) |
| `TorInsight.facts` | `agreedPriceTHB`: kept by full extraction too, from `Tor.contract` |
| `TitleScreen` | `category` |

## Consequences

- **FY2568 gives a real baseline, at little cost.** The dry run (2026-10-15)
  read all 4,687,437 rows in about 8 minutes, none unreadable. 120,560 were
  publicly announced (2.6%), and 6,833 of those have IT-looking titles.
  Screening them is about 171 Gemini calls, 0.75 million input and 0.41
  million output tokens: about the input of 14 large TOR extractions.
- **The real run (2026-10-16)** imported 6,642 projects. The screen took 165
  calls, 0.65 million input and 0.39 million output tokens. It found 2,239
  `it`, 2,689 `unsure` and 1,708 `not_it`.
- **The keyword list loses little.** A random 400 of the 107,523 public
  projects it rejected were screened: none came back `it`, and 13 came back
  `unsure`, all equipment. So, at 95% confidence, it misses under 0.75% of
  them, about 800 at most, against 2,239 found.
- **Reading them all takes months, and isn't the aim.** At 20 a night, the IT
  ones alone take about 110 nights. A pick found not IT still uses a place. Nights count only when the 22:00 job runs: with no
  hosting yet, only when someone's `npm run schedule` is running then. The
  aim is related past projects for the TORs open now.
- **TORs closing later wait.** On 2026-10-16 there were 76 open IT TORs to
  choose for, and 20 places a night. The soonest take every place until they
  have 5 related projects, or close, so a TOR closing in two weeks may close
  before its turn. A TOR in a busy category may already have 5 from other
  projects read in full, and then gives its turn away at once.
- **The catalog starts with Draft and Open,** what can still be bid on. Past
  projects read in full appear under Awarded, one click away under Status.
  On 2026-10-23: 140 TORs in all, 68 Draft or Open, and all 32 Awarded ones
  from data.go.th.
- **data.go.th is cited at the one fact only it gives:** a signed contract.
  The badge "ลงนามสัญญาแล้ว" says where that comes from. A record-level
  "from data.go.th" tag was left out: the dataset copies e-GP's own records,
  and the page already links e-GP, which stays the authority.
- **The agreed price of a project we follow from the feed** needs its winner
  page (`W0`), not read yet; data.go.th gives it only for FY2568.
- **Whether price-based comparables are fair** (a school's system against a
  ministry's) is to be checked once real comparisons exist.
