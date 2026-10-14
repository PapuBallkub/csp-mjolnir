# 0028 · Past projects from data.go.th, as ordinary projects

Status: proposed · 2026-10-15

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
project found `it` or `unsure`:
- `identification`: title, agency, department, category, status Awarded;
- `facts`: budget, ราคากลาง, the agreed price (new, `facts.agreedPriceTHB`),
  method, posted date and links;
- every other section empty, nothing quoted, no score.

It is built in code, with no Gemini call beyond the screen. It is never
written over a full extraction or a not-IT verdict. Full extraction replaces
it: the documents make a different fingerprint, so extraction treats it as a
changed source.

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

## Changes to the records

| Model | Change |
|---|---|
| `Tor.contract` | `amountTHB` (งบสัญญา, the total), `fiscalYear`, `contractStatus`, `winners` |
| `TorInsight.metadata` | `titleOnly` (Boolean, default false, indexed) |
| `TorInsight.facts` | `agreedPriceTHB` |
| `TitleScreen` | `category` |

## Consequences

- **FY2568 gives a real baseline, at little cost.** The dry run (2026-10-15)
  read all 4,687,437 rows in about 8 minutes, none unreadable. 120,560 were
  publicly announced (2.6%), and 6,833 of those have IT-looking titles.
  Screening them is about 171 Gemini calls, 0.75 million input and 0.41
  million output tokens: about the input of 14 large TOR extractions.
- **Detailed comparisons see past projects only once they're extracted,**
  which the nightly lazy extraction adds next.
- **The catalog shows every status by default,** so extracted past projects
  would appear under Awarded. Defaulting `/search` to Draft and Open is a
  frontend change.
- **The agreed price of a project we follow from the feed** needs its winner
  page (`W0`), not read yet; data.go.th gives it only for FY2568.
- **Whether price-based comparables are fair** (a school's system against a
  ministry's) is to be checked once real comparisons exist.
