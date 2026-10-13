# Data Dictionary & Schema Specification: pipeline runs

**Files:** `server/src/models/pipeline-lock.model.js`, `server/src/models/pipeline-failure.model.js`
**Model Names:** `PipelineLock`, `PipelineFailure`
**Collection Names:** `pipelinelocks`, `pipelinefailures`
**Related Documents:** [0016 · Pipeline runs are safe to repeat](../decisions/0016-pipeline-runs-are-safe-to-repeat.md), [Pipeline commands](../pipeline.md)
**Status:** Active

---

## 1. Overview

Bookkeeping for pipeline runs, not TOR data. Both pipelines write these two collections. They let the pipelines run on a schedule without overlapping and without retrying a broken TOR for ever.

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
