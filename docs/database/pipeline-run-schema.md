# Data Dictionary & Schema Specification: pipeline runs

**Files:** `server/src/models/pipeline-lock.model.js`, `server/src/models/pipeline-failure.model.js`, `server/src/models/pipeline-run.model.js`, `server/src/models/feed-poll.model.js`, `server/src/models/ingestion-log.model.js`, `server/src/models/request-streak.model.js`
**Model Names:** `PipelineLock`, `PipelineFailure`, `PipelineRun`, `FeedPoll`, `IngestionLog`, `RequestStreak`
**Collection Names:** `pipelinelocks`, `pipelinefailures`, `pipelineruns`, `feedpolls`, `ingestionlogs`, `requeststreaks`
**Related Documents:** [0016 · Pipeline runs are safe to repeat](../decisions/0016-pipeline-runs-are-safe-to-repeat.md), [0017 · Read the e-GP feed as e-GP defines it](../decisions/0017-read-the-egp-feed-as-egp-defines-it.md), [0027 · Run the pipeline on a schedule](../decisions/0027-run-the-pipeline-on-a-schedule.md), [Pipeline commands](../pipeline.md)
**Status:** Active

---

## 1. Overview

Bookkeeping for pipeline runs, not TOR data. Both pipelines write the first two collections: they let the pipelines run on a schedule without overlapping and without retrying a broken TOR for ever. The scheduled jobs write the third, so a day of runs can be read back.

The last three record how the sources behave. `feedpolls` and `ingestionlogs` both record each time the e-GP feed was asked: the first in detail, for `npm run report`, the second as a health outcome, for the admin dashboard (FR-22). Which of the two to keep is issue #323. `requeststreaks` holds how many requests in a row e-GP has had, so the pacer pauses before e-GP refuses (NFR-03).

---

## 2. `pipelinelocks`

One document per pipeline while a run of it is going. A second run that finds a live lock does nothing.

| Field | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `_id` | `String` | The pipeline: `'ingestion'` or `'extraction'` | `"ingestion"` |
| `owner` | `String` | The run that holds it: host, process id and a random part | `"LAPTOP-1 pid 29108 98109df0"` |
| `acquiredAt` | `Date` | When the run took the lock | `"2026-10-07T05:38:15.000Z"` |
| `expiresAt` | `Date` | The holder renews this every minute. A run that crashed stops renewing, and its lock is free once this time passes (five minutes after the last renewal). | `"2026-10-07T05:43:15.000Z"` |

The document is deleted when the run ends, including on Ctrl+C.

---

## 3. `pipelinefailures`

One document per TOR and step that is failing. It is deleted when the step succeeds for that TOR, so the collection lists exactly the TORs that are stuck.

| Field | Type | Required | Default | Description | Example |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `projectId` | `String` | Yes | — | The TOR's e-GP project ID | `"68019139367"` |
| `step` | `String` | Yes | — | `'download'`, `'ocr'` or `'extract'` | `"download"` |
| `inputKey` | `String` | No | `null` | What the step worked from: the PDF's hash for OCR; source fingerprint, prompt version and model for extraction. A failure on a different input starts the count again. | `"9f2c…|extract-v3|gemini-3.7-flash"` |
| `attempts` | `Number` | No | `0` | Failures that were this TOR's own. At `PIPELINE_MAX_ATTEMPTS` (3) the step leaves the TOR out until `--retry-failed`. | `2` |
| `lastError` | `String` | No | `""` | The last error, cut to 1,000 characters | `"No online attachment archive found in e-GP backend for project 68019139367."` |
| `lastTransient` | `Boolean` | No | `false` | `true` when the last failure was an outage (no answer, 5xx, 429), which isn't counted | `false` |
| `firstFailedAt` | `Date` | Yes | — | First failure on this input | `"2026-10-07T05:38:16.000Z"` |
| `lastFailedAt` | `Date` | Yes | — | Latest failure | `"2026-10-07T07:38:16.000Z"` |

**Indexes:** `{ projectId, step }` unique; `{ step, attempts }` for finding the TORs a step gave up on.

---

## 4. `pipelineruns`

One document per scheduled job (`poll`, `sweep` or `process`), written by `pipeline/jobs/run-job.js`: which steps ran, how each ended, and how the database moved. It's created when the job starts and finished when it ends. Read by the admin dashboard (FR-22) and `npm run report`.

| Field | Type | Required | Default | Description | Example |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `job` | `String` | Yes | — | `'poll'`, `'sweep'` or `'process'` | `"process"` |
| `host` | `String` | No | `""` | The machine that ran it | `"LAPTOP-1"` |
| `startedAt` | `Date` | Yes | — | When the job started. Indexed | `"2026-11-11T15:00:00.000Z"` |
| `finishedAt` | `Date` | No | `null` | When it ended; `null` while running, or if the process died | `"2026-11-11T19:42:10.000Z"` |
| `until` | `Date` | No | `null` | The time box: no new step starts after it. Five minutes before the next job's slot (`schedule.js`) | `"2026-11-12T00:55:00.000Z"` |
| `outcome` | `String` | No | `'running'` | `done`: every step ran. `timed-out`: time was up first. `skipped`: another job held the lock too long. `failed`: the runner itself broke | `"done"` |
| `steps` | `Array` | No | `[]` | One entry per step: `name`, `exitCode` (`null`: not run, time was up), `startedAt`, `ms` | `[{ "name": "screen", "exitCode": 0, … }]` |
| `before`, `after` | `Mixed` | No | `null` | Counts at the start and end: `stages` (projects by `pipelineStatus`), `screens` (title-screen verdicts), `insights` (extracted, excluded, awaiting full text). Kept when empty: no projects at a stage is a count too | `{ "stages": { "ocr_done": 812, … }, … }` |
| `logFile` | `String` | No | `""` | Where the job's output was written: `server/data/logs/<day>/<HHMM>-<job>.log`, or under `LOGS_DIR` when set | `".../data/logs/2026-11-11/2200-process.log"` |
| `error` | `String` | No | `""` | Why the runner failed, for `outcome: 'failed'` | `""` |

**Indexes:** `{ startedAt }`.

---

## 5. `feedpolls`

One document per time the e-GP feed was asked: the national feed once per fetch, one agency in a sweep, or one agency's single day when the sweep asks a full list again day by day ([0027](../decisions/0027-run-the-pipeline-on-a-schedule.md)). This is the polling health FR-22 asks for: whether the feed answers, when, and how much it gives.

- **Written by** `recordPoll` in `pipeline/ingestion/ingest.js`, from the fetch step and the sweep. A record that can't be saved never stops the run.
- **Read by** `npm run report` (`scripts/pipeline-report.js`). The admin dashboard doesn't read it; it reads `ingestionlogs`.

| Field | Type | Required | Default | Description | Example |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `source` | `String` | Yes | — | Always `'process3'`, the e-GP feed | `"process3"` |
| `deptId` | `String` | No | `""` | The agency asked, by its e-GP code; `""` for the national feed | `"000021500"` |
| `announceDate` | `String` | No | `null` | One day only (`YYYYMMDD`, Gregorian), when the sweep asks a full list again day by day | `"20261116"` |
| `startedAt` | `Date` | Yes | — | When the asking started. Indexed | `"2026-11-16T11:00:04.000Z"` |
| `finishedAt` | `Date` | Yes | — | When it ended | `"2026-11-16T11:00:13.000Z"` |
| `closed` | `Boolean` | No | `false` | Nothing was sent: the feed's closed hours ([0017](../decisions/0017-read-the-egp-feed-as-egp-defines-it.md)) | `false` |
| `rateLimited` | `Boolean` | No | `false` | e-GP refused (HTTP 429), and the rest went unasked | `false` |
| `requested` | `Number` | No | `0` | Requests sent, one per announcement code | `7` |
| `answered` | `Number` | No | `0` | Of those, how many got any answer | `7` |
| `itemsByType` | `Map` of `Number` | No | `{}` | Items returned, by announcement code. An agency's list stops at 20, so a 20 may mean some were cut off | `{ "D0": 20, "W0": 4 }` |
| `countByType` | `Map` of `Number` | No | `{}` | e-GP's own count of that day's announcements, by code (`countbyday`). More than the items means the list was cut off | `{ "D0": 23, "W0": 4 }` |
| `discovered` | `Number` | No | `0` | New projects added | `3` |
| `updated` | `Number` | No | `0` | Followed projects seen again | `11` |
| `problems` | `[String]` | No | `[]` | The first five errors the feed reported | `[]` |

**Indexes:** `{ startedAt }`.

---

## 6. `ingestionlogs`

One document per run of the fetch step, or per source health check, with an outcome the admin dashboard shows (FR-22). `feedpolls` records the same fetches in more detail (issue #323).

- **Written by:**
  - `runFetchStep` in `pipeline/ingestion/ingest.js`: the fetch step (`npm run ingest:fetch`, with or without `--dept`, and the `poll` job) and the admin dashboard's fetch (`POST /api/admin/ingest`). Always `source: 'process3'`. The sweep doesn't write here.
  - The admin dashboard's source check (`POST /api/admin/health-check`): one document per source it tries, with `metadata.type: 'health_check'`.
- **Read by** the admin dashboard: per source, its last 14 documents give the health, the uptime (`ok` and `degraded` count as up) and the 14-run history strip. The latest 10 across sources are listed as recent runs.

| Field | Type | Required | Default | Description | Example |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `source` | `String` | Yes | — | `'process3'` (the e-GP feed) or `'datago'` (data.go.th, health checks only). Indexed | `"process3"` |
| `status` | `String` | Yes | — | `ok`, `degraded` or `failed`. A fetch is `failed` when the feed didn't answer, or reported errors and returned nothing, and `degraded` when it reported errors but returned items. A health check is `degraded` when the answer was slow: over 8 s for e-GP, 3 s for data.go.th. Indexed | `"ok"` |
| `startedAt` | `Date` | Yes | now | When it started. Indexed | `"2026-11-16T01:00:02.000Z"` |
| `finishedAt` | `Date` | No | `null` | When it ended | `"2026-11-16T01:00:41.000Z"` |
| `durationMs` | `Number` | No | `0` | How long it took; for a health check, the response time | `39120` |
| `itemsDiscovered` | `Number` | No | `0` | New projects the fetch added; `0` for a health check | `3` |
| `itemsIngested` | `Number` | No | `0` | Projects the fetch recorded: new ones and followed ones seen again; `0` for a health check | `14` |
| `error` | `String` | No | `null` | What went wrong: `"e-GP RSS did not answer"`, the feed's errors joined by `"; "`, or the health check's error | `null` |
| `metadata` | `Mixed` | No | `{}` | A fetch: `{ query, limit }`. A health check: `{ type: 'health_check' }` | `{ "query": null, "limit": null }` |
| `createdAt`, `updatedAt` | `Date` | — | — | Mongoose timestamps | |

**Indexes:** `{ source }`, `{ status }` and `{ startedAt }`, each on its own.

---

## 7. `requeststreaks`

One document per site with a limit on requests in a row. Today that's only e-GP: `gprocurement.go.th`, whose hosts all count as one site. e-GP refuses the 240th request in a row (HTTP 429), so after `EGP_FEED_BURST` (230 by default) the pacer rests 10 minutes ([0027](../decisions/0027-run-the-pipeline-on-a-schedule.md)). Each step of a job runs as its own process, but e-GP counts their requests as one run, so the count lives here rather than in memory.

- **Written by** `pipeline/shared/request-pacer.js`, before each request to the site. A quiet spell of 10 minutes starts a new run, and so does the pacer's own pause. With no database connection, the pacer counts in memory instead.
- **Read by** the same file, and by the admin dashboard, which shows e-GP's count against the limit and the cooldown left.

| Field | Type | Required | Default | Description | Example |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `_id` | `String` | Yes | — | The site: a hostname's last three labels under `.th`, its last two elsewhere | `"gprocurement.go.th"` |
| `inARow` | `Number` | Yes | — | Requests in a row since the last quiet spell or pause | `117` |
| `lastAt` | `Date` | Yes | — | When the last one went out | `"2026-11-16T11:41:52.000Z"` |

**Indexes:** none beyond `_id`.
