# Pipeline commands

New to the pipeline? Start with [the plain-words guide](pipeline-guide.md):
what it does, the journey of a project, and how to run and check it.

How TORs get into the database, and the commands that move them along. The
reasoning behind the design is in [0008](decisions/0008-tor-ingestion-pipeline.md)
and [0013](decisions/0013-split-ingestion-and-ai-extraction.md).

Every command is safe to run again, by hand or on a schedule. See
[Running a command again](#running-a-command-again).

There are two pipelines, and they meet only in the database:

```
INGESTION                                    AI EXTRACTION
fetch ─► download ─► OCR ─► Tor              Tor ─► classify ─► extract ─► check ─► TorInsight
```

- **Ingestion** finds TORs, downloads their PDFs, and turns them into text.
- **Extraction** reads that text with Gemini and writes the normalized summary.
  Sese [AI extraction](#ai-extraction).

Run every command from `server/`. The database named in `server/.env` must be
reachable.

## Where a TOR is in ingestion

Each `Tor` record has a `pipelineStatus`. Each step picks up the records the
previous step left behind:

| `pipelineStatus` | Meaning | Picked up by |
|---|---|---|
| `fetched` | Found in a source; no PDF yet | `npm run screen`, then `ingest:download` if the title screen lets it through ([0026](decisions/0026-screen-titles-before-downloading.md)) |
| `downloaded` | PDF saved to `server/data/documents/` | `ingest:ocr` (preview) |
| `ocr_preview` | The first 6 pages of a scan, read so classify can decide whether it's IT | AI extraction (classify only); then `ingest:ocr` reads the rest if it's IT |
| `ocr_done` | The whole text in `ocr.rawText` | AI extraction |

Only **workable** TORs are downloaded and OCR'd: Draft or Open, announced by the
e-GP feed at least once, and with no contract winner
([0018](decisions/0018-preview-ocr-before-classify.md)).

## Getting open IT projects: `npm run pipeline`

One command takes new projects from the e-GP feed all the way to the catalog:

```
npm run pipeline
```

It runs these steps in order:
1. `ingest:fetch -- --source process3`: fetch every opening item from the
   national feed (no keyword).
2. `screen`: Gemini reads the new titles in batches. Only a project that is
   clearly not IT stops here ([0026](decisions/0026-screen-titles-before-downloading.md)).
3. `ingest:download`, `ingest:ocr`: download what passed and read a 6-page
   preview.
4. `extract`: classify each preview. Not IT stops there; IT waits for its full
   text.
5. `ingest:ocr`: read the IT previews whole.
6. `extract`: extract them. They then appear in `/search`.

Run it during the feed's open hours (17:01–08:29, Bangkok time);
outside them it still processes what's waiting. Each run costs a screen call
per 40 new titles, one classify call per project that passed, and one
extraction per IT one.

## Running on a schedule

The pipeline runs as three **jobs** on a fixed schedule
([0027](decisions/0027-run-the-pipeline-on-a-schedule.md)), in Bangkok time:

| Time | Job | What it does |
|---|---|---|
| 08:00, 17:05 | `poll` | The national feed, then new TORs, then changed ones |
| 18:00 | `sweep` | Every agency in `ingestion/data/egp-agencies.json` (267), then the same |
| 22:00 | `process` | The night, in four waves (below), until 07:55 |

**Each job works in waves,** one kind of work at a time, so that when its time
runs out, what's left is what can wait
([0030](decisions/0030-run-the-night-in-priority-waves.md)):

| Wave | Steps | Queue |
|---|---|---|
| 1. Check | Ask e-GP whether draft and open IT TORs' packages changed (`recheck`), then download the changed ones and record what changed | `changed` |
| 2. New TORs | Screen the new titles, download what passed, preview, classify, read the IT ones whole, extract | `new` |
| 3. Changes | Read and extract the changed ones | `changed` |
| 4. Price | Refresh the comparisons, choose tonight's past projects, read them, refresh the comparisons again | `past` |

The night runs all four; `poll` and `sweep` run waves 2 and 3, for what the
feed brought. Within each step, the soonest bid deadline goes first.

Each job takes no new work after its time box, 5 minutes before the next job,
and leaves a `PipelineRun` record and a log file in
`server/data/logs/<date>/`. Each step's name says its queue, e.g.
`ingest download (new)`, so a record shows which wave a short night stopped
in. Each time the feed is asked leaves a `FeedPoll` record.

**One job by hand,** with its time box worked out from the schedule, or given:

```
npm run job -- poll
npm run job -- sweep
npm run job -- process --until 2026-10-14T07:55:00+07:00
```

**A day of jobs on your own machine:**

```
npm run schedule
npm run schedule -- --now process    # start with this job right away
```

It waits for each time and starts that job. Keep the window open, the machine
awake (plugged in, sleep off) and MongoDB running. Ctrl+C stops it. A machine
that slept through a job's time starts it late when it wakes, and skips any
other times it missed.

**Reading a day back:** each job's log is in `server/data/logs/<date>/`, and
in MongoDB:
- `pipelineruns`: each job's steps, their exit codes, and the counts before
  and after.
- `feedpolls`: each request batch to the feed, with items per code. 20 items
  means an agency's list may have been cut off.
- `titlescreens`: each verdict. An `audit: true` project that classify then
  found IT is one the screen got wrong.

## Commands

### `npm run ingest`
Runs **fetch, download and OCR in one go**. Use it for a normal run. The
summary at the end counts the records in each status.

```
npm run ingest -- --query "ซอฟต์แวร์" --limit 3
npm run ingest -- --skip-ocr          # fetch and download only; OCR later
```

### `npm run ingest:fetch`
**Finds new TORs** in the e-GP RSS feed (`process3`), and saves them as
`fetched`. Nothing is downloaded.

- The feed is the only source of **open** projects. data.go.th has past
  contracts only, and its old reader (`--source datago`) was removed: it read
  the columns wrongly ([data_go_th.md](data-sources/data_go_th.md)).
- **The e-GP feed is open 17:01–08:29 only, Bangkok time.** At other times
  fetch sends no request and says so.
- Each request returns only the 20 latest items of one announcement type
  ([0017](decisions/0017-read-the-egp-feed-as-egp-defines-it.md)).
- `--query` and `--limit` choose **new** projects. A project already in the
  database always gets its updates (changed, cancelled, winner announced),
  whatever its title says.
- If a source fails, fetch prints its errors and fetches nothing from it.
  `e-GP RSS DID NOT ANSWER` means every request to the feed failed. There is
  no fallback to another source.

```
npm run ingest:fetch -- --limit 3
npm run ingest:fetch -- --source process3 --query "ซอฟต์แวร์" --limit 2
npm run ingest:fetch -- --dept 0307    # one agency
```

### `npm run ingest -- --step sweep`
**Asks the feed about every agency in the list,** one after another
([0027](decisions/0027-run-the-pipeline-on-a-schedule.md)). An agency's list
reaches back several days, up to 20 items per code, so the sweep finds what
the national feed's latest 20 dropped. It asks every code but `15`, so it also
brings the cancellations, winners and amendments of projects we follow.

- About 1,870 requests for 267 agencies at one a second, with a 10-minute
  pause after every 230: about 100 minutes. e-GP refuses the 240th request in
  a row (HTTP 429), whatever the pace.
- When e-GP refuses anyway, it pauses 10 minutes and asks again, up to 3
  times in a row.
- **A list that comes back full (20) is asked again day by day**
  (`announceDate`), for the days it may have cut short since the last sweep.
  e-GP's own count (`countbyday`) says whether anything is still missing.
  `--days N` looks N days back instead of 1, after a missed sweep.
- Stops at the time box (`--until`), when the feed closes, when 2 agencies
  in a row get no answer, or after 3 refusals in a row.
- `--agencies 0307,A004` sweeps just those. **In PowerShell, quote a list
  that starts with 0:** `--agencies "0201,0703"`. Unquoted, PowerShell reads
  it as numbers and drops the zeros; the sweep then reads `201` as `0201`
  and says so, and warns about any code that isn't in the list.

```
npm run ingest -- --step sweep
npm run ingest -- --step sweep --agencies 0307,0304,11012
npm run ingest -- --step sweep --days 3    # after two days without a sweep
```

### `npm run agencies:fetch`
**Refreshes the agency list** the sweep uses, `ingestion/data/egp-agencies.json`,
from e-GP's list of purchasing units on data.go.th (`egpdepartment`). It keeps
central government only, about 270 agencies, and leaves out ministry codes
(`03`), for which the feed returns nothing.

### `npm run history:import`
**Imports past contracts from data.go.th** ([0028](decisions/0028-past-projects-from-data-go-th.md)):
fiscal year 2568, signed contracts only, never open projects. It keeps only
what is useful for price comparisons:

1. **Publicly announced projects.** Direct purchases (เฉพาะเจาะจง), three
   quarters of the rows, never had a public TOR.
2. **Titles that look like IT,** by a loose keyword list in code. The title
   screen decides properly afterwards.

Each kept project becomes an ordinary `Tor` record with status Awarded and
its contract (`source: 'datago'`). A project awarded as several contracts has
a row for each; they're merged, the amount added up and every winner kept. A project we already have keeps its own
values and gains the contract. No Gemini is used.

- It reads the 10 CSV files as they download (about 5 GB), not data.go.th's
  API, which holds only 74% of the rows. Values are read by position: the
  files' headings are wrong ([data_go_th.md](data-sources/data_go_th.md)).
- `--dry-run` counts what each filter keeps and estimates the title screen's
  tokens, and saves nothing. `--parts 1,4` reads only those files; `--limit N`
  stops after N kept rows.
- Every write is an upsert by project ID, so an interrupted import can run
  again.

```
npm run history:import -- --dry-run
npm run history:import -- --parts 10 --limit 50
npm run history:import
```

Then `npm run screen -- --past` screens their titles, and the night's
`process` job reads a few of them in full (next).

### `npm run ingest -- --step history`
**Chooses tonight's past projects to read in full**
([0028](decisions/0028-past-projects-from-data-go-th.md)), up to
`HISTORY_PER_NIGHT` (20), from the past projects not read yet:
1. **What the open TORs need, soonest deadline first.** Each open IT TOR
   gets the past projects its comparison would rank highest (the same
   category, 0.3× to 3× its price, then the comparison's own score, then the
   closest price, since many projects not read yet tie on the score) until it
   has `HISTORY_ENOUGH_RELATED` (5) related ones. Then the next TOR's turn
   comes. Once every open TOR has 5, the soonest goes on to 10, and so on.
   Related: any project read in full that is in its comparison, past or new,
   or a past one chosen for it and not read yet.
2. **The newest,** only when no open TOR has a candidate left.

Past projects the title screen found `it` come first. `Unsure` ones, mostly
hardware, come only after every `it` one that fits. Only e-bidding projects
are chosen: e-GP keeps no documents for selection (คัดเลือก) or consultant
projects.

It only marks them: `Tor.historyRequestedAt`, and `Tor.historyRequestedFor`
for the TOR it was chosen for. Download, OCR and extraction then take them
like any project, and the result replaces the title-level record. Projects
chosen earlier and not downloaded yet count against the 20, so a night that
couldn't download doesn't pile up. The `process` job runs it, so nothing is
chosen on a night the 22:00 job doesn't run.

```
npm run ingest -- --step history --dry-run    # show tonight's choice, change nothing
npm run ingest -- --step history
```

### `npm run ingest -- --step recheck`
**Asks e-GP whether the packages of draft and open IT TORs have changed**
([0032](decisions/0032-record-what-changed-in-a-tor.md)). The feed has never
announced a changed invitation (`D2`), so nothing else would tell us. It
takes the TORs read in full and found IT, with a package downloaded: drafts,
and open ones whose bids haven't closed. For each, it asks e-GP's
announcement and price services which package is current (one small JSON
request each, no download):
- **one we don't have:** it flags the TOR (`packageCheckNeeded`), and the
  download after it takes the package;
- **nothing new:** it records when it looked (`packagesCheckedAt`), so a
  change found later is dated as after it.

What e-GP's amendment service (`infoProcureDocAnnounZipAdj`) answers is only
logged. The `process` job runs it first, about 3 requests per TOR (67 TORs
took 3½ minutes). It stops at the time box, or when 3 TORs in a row get no
answer. `--dry-run` only says what it finds.

```
npm run ingest -- --step recheck
npm run ingest -- --step recheck --dry-run    # say what's new, change nothing
```

**Download decides whether a new package is a change.** It reads each
package's own announcement, which says "ร่าง" on a draft, not the feed, which
can lag by days:
- **a draft becoming an invitation** is the next stage, and not recorded;
- **an invitation replaced by another, or a draft by another,** with a
  different TOR file or facts, is a change;
- **a price form with a different budget or ราคากลาง** is a change too.

A change goes into `Tor.amendments`, from the feed (a `D2`: the agency said
so) or a package (we found it), with both packages, and what changed: the
facts at download, and the summary's own dates, numbers, technologies and
standard conditions once it's extracted again. Free text gets no rows, since
two extractions word it differently. The log says `CHANGED`, `Next stage`,
or that a package's stage couldn't be read (not counted).

### `npm run ingest:download`
**Downloads each workable TOR's e-GP package** ([0020](decisions/0020-read-the-whole-egp-package.md)),
or one TOR's with `--id`. It takes:
- a new project (`fetched`) that the title screen let through: `it`,
  `unsure`, or a `not_it` in the audit sample
  ([0026](decisions/0026-screen-titles-before-downloading.md)). One not
  screened yet waits; `--skip-screen` downloads it anyway;
- a project the feed has announced at a new stage (`packageCheckNeeded`);
- a project downloaded before packages were kept;
- a past project chosen to be read in full (`--step history`), although it's
  awarded. If e-GP has no package for it, it gives up at once: an awarded
  project won't get one later.

What it does with a package:
- **Keeps the project files** in `server/data/documents/<projectId>/<package>/`:
  the announcement, the bidding document, the TOR (in one file or several),
  and any extra file. e-GP's blank forms are left out.
- **Reads the agency, ราคากลาง and bid window** from the announcement and the
  bidding document, in code, and keeps them on the `Tor`. The run prints them.
- **Reads the budget from the price form,** in the separate price package:
  one OCR'd page, its amount taken from the words
  ([0023](decisions/0023-read-the-budget-from-the-price-form.md)). It's asked
  for once per project, and again at each new stage.
- **Never downloads a package twice.** e-GP's `zipId` tells; one look at e-GP
  and nothing else.
- **Sends the TOR back to OCR only if it changed.** A new package whose TOR is
  the same updates the facts and nothing else.

```
npm run ingest:download
npm run ingest:download -- --id 69109028093
```

`--id` works on a project already in the database. For one that isn't, use
`ingest:add`.

### `npm run ingest:add`
**Adds a project found by hand,** one the feed never showed us, from e-GP's
own documents:
- **From its announcement:** its title, agency and posting date. A "ร่าง"
  heading marks it a draft; otherwise it's an invitation. The feed corrects the
  stage if it later shows the project.
- **Its packages:** downloaded like any other project's, with ราคากลาง, the
  bid window and the budget read from them.

It's left at `downloaded`, so `ingest:ocr` and `extract` (or `npm run
pipeline`) pick it up next. A project already in the database is refused.

```
npm run ingest:add -- --id 69109028093
```

### `npm run ingest:ocr`
**Extracts the text**, in two passes over workable TORs and the past
projects chosen to be read in full (`--step history`):
1. **Preview:** each `downloaded` scan is read for its first 6 pages
   (`ocr_preview`). A digital PDF, or a scan of 6 pages or fewer, is read whole
   (`ocr_done`).
2. **Full:** each preview that classify found to be IT is read whole
   (`ocr_done`). So is a TOR already extracted as IT whose file changed: a
   preview would hide its page until extraction caught up.

A past project is previewed like any other, because its title can hide
hardware that classify drops after the preview
([0028](decisions/0028-past-projects-from-data-go-th.md)).

A digital PDF is read in seconds; a scan goes through Tesseract OCR at about
4 s a page. A text layer that isn't Thai (an old non-Unicode font) is OCR'd
like a scan. A TOR in several files is read as one document, in order; a
preview's 6 pages are spent across them.

With `--id`, it reads that TOR whole, whatever its status. Use that after
changing an OCR setting.

```
npm run ingest:ocr
npm run ingest:ocr -- --id 69109028093
```

## Options

| Option | Used by | Default | Meaning |
|---|---|---|---|
| `--id <projectId>` | download, ocr, add | all waiting records | Work on one TOR only. Download and OCR take one already in the database; add, one that isn't. |
| `--dept <code>` | fetch | none | e-GP feed only: one agency's announcements, e.g. `0307`, `11012` or `A004` (codes in `ingestion/data/egp-agencies.json`). An agency's list reaches back several days, up to 20 items per code; the national feed shows only the same day's latest 20 of each type, and can be empty. |
| `--agencies <codes>` | sweep | every agency in the list | Sweep only these, e.g. `0307,A004` |
| `--days <n>` | sweep | `1` | How many days back a full list is asked again, day by day: 0 to 7 |
| `--types <codes>` | fetch, sweep | fetch: every type; sweep: every type but `15` | e-GP feed only: only these announcement codes, e.g. `D0,B0` |
| `--until <time>` | sweep, recheck, download, ocr | none | The time box: no new work after this time, e.g. `2026-10-14T07:55:00+07:00`. The project in hand finishes. Jobs set it for you; `screen` and `extract` take it too. |
| `--skip-screen` | download | off | Download new projects without waiting for the title screen |
| `--queue <queues>` | download, ocr | all | Only these kinds of work, e.g. `new` or `new,changed` ([0030](decisions/0030-run-the-night-in-priority-waves.md)): `new` (not read yet), `changed` (a new stage, or a replaced document), `past` (past projects asked for). The jobs run them one at a time; `extract` takes it too. |
| `--dry-run` | history, recheck | off | History: show tonight's past projects, ask for none. Recheck: say what's new, flag nothing. |
| `--query`, `-q` | fetch | none | Keep only new projects whose title has this text. None by default: the title screen and classify decide what is IT |
| `--limit`, `-l` | fetch | none | At most this many **new** projects; updates to projects already in the database are never limited |
| `--source` | fetch | `process3` | The e-GP feed, the only source now (`all` means the same). `datago` was removed. |
| `--skip-ocr` | `ingest` | off | Stop after download |
| `--step`, `-s` | `ingest` | `all` | `fetch`, `sweep`, `history`, `recheck`, `download`, `ocr`, `add` or `all` (fetch, download and OCR). The `ingest:*` scripts set this for you. |
| `--retry-failed` | download, ocr | off | Also try the TORs that gave up after repeated failures |

## Settings

These are optional, in `server/.env`:

| Variable | Default | Meaning |
|---|---|---|
| `DOCUMENTS_DIR` | `server/data/documents` | Where PDFs are saved |
| `OCR_MAX_PAGES` | `150` | Scanned pages to OCR per document |
| `OCR_SECONDS_PER_PAGE` | `10` | OCR time budget per page. A document gets pages × this. |
| `PIPELINE_MAX_ATTEMPTS` | `3` | Failures before a step leaves a TOR out. Ingestion and extraction both use it. |
| `EGP_FEED_BURST` | `230` | Requests to e-GP in a row before a 10-minute pause. e-GP refuses the 240th in a row ([0027](decisions/0027-run-the-pipeline-on-a-schedule.md)). The count is kept in the database (`RequestStreak`), so the steps of a job, each its own process, count as one run, as e-GP sees them; 10 quiet minutes start it again. The sweep also pauses on its own at the same count, to stop at its time box instead of pausing past it. Any other step may run past its time box by one pause. |
| `EGP_PACKAGE_MAX_MB` | `200` | The largest e-GP package downloaded. e-GP sends no size first, so a bigger one is found by downloading up to the limit, and the project then gives up at once. To fetch one by hand, raise this and run `ingest:download -- --id <projectId> --retry-failed`. |
| `EXTRACTIONS_DIR` | `server/data/extractions` | Where Gemini's answers are saved, for `extract --recheck` |
| `HISTORY_PER_NIGHT` | `20` | Past projects chosen each night to be read in full ([0028](decisions/0028-past-projects-from-data-go-th.md)). Those chosen earlier and not downloaded yet count against it; `0` turns it off. |
| `HISTORY_ENOUGH_RELATED` | `5` | Related projects an open TOR gets before the next TOR's turn comes, and the step it goes up by once every open TOR has that many. The comparison lists 5. |
| `LOGS_DIR` | `server/data/logs` | Where each job writes its log |
| `SCREEN_AUDIT_RATE` | `0.1` | The share of `not_it` projects that go the whole way anyway ([0026](decisions/0026-screen-titles-before-downloading.md)) |

When OCR stops before the end of a document (page limit, time budget, or pages
that failed), the log line says `TRUNCATED` and `Tor.ocr.truncated` is `true`.
On a slow machine, raise the two limits and run `ingest:ocr -- --id` again.

## Running a command again

Every command can run again, by hand or on a schedule, without undoing work or
paying for it twice ([0016](decisions/0016-pipeline-runs-are-safe-to-repeat.md)):

- **One run at a time.** Start `npm run ingest` (or `npm run extract`) while
  another is going, and it prints who holds the lock and exits without doing
  anything. A run that crashed frees its lock by itself within five minutes.
- **Fetching again never undoes work.** A TOR that is already downloaded or
  OCR'd keeps its PDF, its text and its stage. A feed item seen again isn't
  recorded twice.
- **At most one request a second** to e-GP, and one to data.go.th, across
  fetch and download (NFR-03).
- **A TOR that keeps failing is left out.** After 3 failures of its own, a step
  skips the TOR and says so at the end of the run. A source that doesn't
  answer doesn't count. The failures are in the `pipelinefailures` collection.
  To try again:

  ```
  npm run ingest -- --retry-failed
  npm run extract -- --retry-failed
  npm run extract -- --id 68049205582    # one TOR
  ```

## AI extraction

Extraction reads each TOR at `ocr_done` with Gemini, and saves a `TorInsight`.
For each TOR it runs:
1. **Classify** (the first pages): is this IT? A non-IT TOR is saved as
   `excluded` and stops here.
2. **Extract** (the whole text, and the bidding document when the TOR's package has one:
   [0025](decisions/0025-extraction-reads-the-bidding-document.md)).
3. **Check:** every value against its quote, the feed and common sense.
4. **Save.**

Every result starts as `pending` review. A score below 80 means a person must
look before the public sees it.

### Setup, once per person

1. Ask in the team chat for the project ID, and for the `aiplatform.user` role
   on it.
2. Sign in with your own Google account. No API key is needed, and none should
   be added:
   ```
   gcloud auth login
   gcloud config set project <project ID>
   gcloud auth application-default login
   ```
3. In `server/.env`, set:

   | Variable | Value |
   |---|---|
   | `GOOGLE_CLOUD_PROJECT` | the project ID |
   | `GOOGLE_CLOUD_LOCATION` | `global`. `gemini-3.7-flash` isn't served in `asia-southeast1`. |
   | `GEMINI_MODEL` | `gemini-3.7-flash` |

### `npm run gemini:check`

**Checks the setup end to end:** your sign-in, the project, the region and the
model. It does two things:

1. **Sends one tiny request** (a fraction of a baht) and prints the reply.
2. **Counts the tokens** in the longest TOR text in your database, or in one TOR
   with `--id`. Counting is free, and shows how much one extraction will read.

```
npm run gemini:check
npm run gemini:check -- --id 67079184063
```

If it fails, the message says which part is wrong:
- a missing setting
- a permission error (`403`): ask for the role
- a model not found (`404`): check `GEMINI_MODEL` and `GOOGLE_CLOUD_LOCATION`

### `npm run technologies:seed`

**Loads the starter list of technologies**, so that "Postgres", "PostgreSQL 14"
and "PostgreSQL" all count as one. Run it once per database before the first
extraction. It's safe to run again.

Names a TOR uses that aren't in the list are added as `new`, for a person to
merge or confirm.

### `npm run screen`

**Screens the titles of new projects** before anything is downloaded
([0026](decisions/0026-screen-titles-before-downloading.md)). One Gemini call
reads 40 titles and gives each a verdict:
- `it`: clearly software or IT services. Downloaded.
- `unsure`: can't tell from the title, hardware included. Downloaded, and
  classify decides from the document.
- `not_it`: clearly nothing to do with IT. Not downloaded, except a tenth of
  them, chosen by project ID (`audit`), which go the whole way so we can see
  what the screen gets wrong.

Each verdict also names the kind of IT project the title points to, one of
the seven categories, or none (`screen-v2`).

A project is screened again only if its title or the screen's prompt version
(`screen-v2`) changes.

**Past projects from `history:import` are screened only with `--past`.**
There can be thousands, so it's a decision, and the scheduled jobs never do
it. Those found `it` get a **title-level TorInsight record**: title,
agency, prices and category, every other section empty and nothing quoted.
It counts in benchmarks; the site, the review queue and detailed comparisons
leave it out. Full extraction replaces it once the project's documents are
read ([0028](decisions/0028-past-projects-from-data-go-th.md)).
Those found `unsure`, mostly hardware, get none and count nowhere until
they're read.

```
npm run screen
npm run screen -- --limit 40 --dry-run    # see the verdicts, save nothing
npm run screen -- --past --limit 200      # past projects, 200 at a time
```

### `npm run extract`

**Extracts every TOR that needs it:** TORs that have no insight yet, and TORs
whose PDF or OCR text has changed since. For an IT TOR, a new bidding document
counts as a change too; a non-IT one isn't classified again for one.

```
npm run extract                        # what needs doing
npm run extract -- --id 68049205582    # one TOR, whatever its state
npm run extract -- --limit 3           # at most 3 this run (cost control)
npm run extract -- --dry-run           # save nothing; review files only
npm run extract -- --outdated          # also redo results from an older prompt
npm run extract -- --force             # redo everything, reviewed results too
npm run extract -- --recheck           # rebuild from saved answers: no Gemini call
npm run extract -- --retry-failed      # also try TORs that gave up after failing
npm run extract -- --queue new         # one kind of work only: new, changed or past
```

The soonest bid deadline goes first.

| Option | When to use it |
|---|---|
| `--outdated` | After changing the prompt or schema. Old results are only redone when you ask, because it costs money. |
| `--recheck` | After changing the checks or the assembly code. It's free: it reuses Gemini's saved answers. |
| `--force` | Redoes results a person has already reviewed. It warns, because their review is lost. |
| `--retry-failed` | After fixing what made TORs fail. They're skipped after 3 failures on the same source, prompt and model, because each try can cost money. |

Each run prints a score and the failed checks for every TOR, plus the tokens
used. A TOR that fails saves nothing, and is picked up again by the next run,
up to 3 times (see [Running a command again](#running-a-command-again)).

**Review files:** every TOR also gets
`server/data/extractions/<projectId>.json`. It holds Gemini's own answers,
with the quote and page behind every value. Check these against the PDF.
`--recheck` rebuilds from them too.

### Versions, and `npm run rollback`
**A summary a change replaces is kept,** in `TorInsightVersion`
([0031](decisions/0031-keep-the-summary-a-change-replaces.md)). That happens
when download applies a new TOR file, OCR reads changed text, extraction makes
a summary again (`--outdated`, `--force`, `--recheck`), or an admin corrects
it in the review queue. Each is kept once, with the reason, the TOR's file
and facts it went with, and its OCR text, so it can be brought back.
`metadata.version` counts them. A title-level record, a preview and a record
found not IT keep none.

```
npm run rollback -- --id 69099707497                     # its versions
npm run rollback -- --id 69099707497 --to 2 --dry-run    # what bringing version 2 back would do
npm run rollback -- --id 69099707497 --to 2              # bring it back
```

A rollback keeps the current summary first, then puts version N back, with
the TOR's file, OCR text and facts it went with. Its source matches again, so
the next extraction leaves it alone. With a pipeline run going, it does
nothing and says so. Admins can do the same from the API:
`GET /api/admin/review/:projectId/versions` and
`POST /api/admin/review/:projectId/rollback` with `{ "version": 2 }`.
