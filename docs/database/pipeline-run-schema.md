# Data Dictionary & Schema Specification: pipeline runs

**Files:** `server/src/models/pipeline-lock.model.js`, `server/src/models/pipeline-failure.model.js`, `server/src/models/pipeline-run.model.js`
**Model Names:** `PipelineLock`, `PipelineFailure`, `PipelineRun`
**Collection Names:** `pipelinelocks`, `pipelinefailures`, `pipelineruns`
**Related Documents:** [0016 · Pipeline runs are safe to repeat](../decisions/0016-pipeline-runs-are-safe-to-repeat.md), [0027 · Run the pipeline on a schedule](../decisions/0027-run-the-pipeline-on-a-schedule.md), [Pipeline commands](../pipeline.md)
**Status:** Active

---

## 1. Overview

Bookkeeping for pipeline runs, not TOR data. Both pipelines write the first two collections: they let the pipelines run on a schedule without overlapping and without retrying a broken TOR for ever. The scheduled jobs write the third, so a day of runs can be read back.

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
