# Pipeline commands

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
  See [AI extraction](#ai-extraction).

Run every command from `server/`. The database named in `server/.env` must be
reachable.

## Where a TOR is in ingestion

Each `Tor` record has a `pipelineStatus`. Each step picks up the records the
previous step left behind:

| `pipelineStatus` | Meaning | Picked up by |
|---|---|---|
| `fetched` | Found in a source; no PDF yet | `ingest:download` |
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

It runs four steps in order:
1. `ingest -- --source process3`: fetch every opening item (no keyword), download,
   and read a 6-page preview.
2. `extract`: classify each preview. Not IT stops there; IT waits for its full
   text.
3. `ingest:ocr`: read the IT previews whole.
4. `extract`: extract them. They then appear in `/search`.

Run it during the feed's open hours (12:01–12:59 or 17:01–08:59, Bangkok time);
outside them it still processes what's waiting. Each run costs one classify
call per new project and one extraction per IT one. Add `-- --limit N` to the
first step by hand to cap new projects.

## Commands

### `npm run ingest`
Runs **fetch, download and OCR in one go**. Use it for a normal run. The
summary at the end counts the records in each status.

```
npm run ingest -- --query "ซอฟต์แวร์" --limit 3
npm run ingest -- --skip-ocr          # fetch and download only; OCR later
```

### `npm run ingest:fetch`
**Finds new TORs** in e-GP RSS (`process3`) and data.go.th (`datago`), and saves
them as `fetched`. Nothing is downloaded.

- e-GP RSS is the only source of **open** projects; data.go.th has past
  contracts only.
- **The e-GP feed is closed 09:00–12:00 and 13:00–17:00, Bangkok time.**
  Fetch then sends no request and says so. Run it at 12:01–12:59 or after
  17:01.
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
```

### `npm run ingest:download`
**Downloads the PDF** for every workable `fetched` TOR, or for one TOR with
`--id`. A file that is already on disk is reused, not downloaded again.

```
npm run ingest:download
npm run ingest:download -- --id 68039469567
```

### `npm run ingest:ocr`
**Extracts the text**, in two passes over workable TORs:
1. **Preview:** each `downloaded` scan is read for its first 6 pages
   (`ocr_preview`). A digital PDF, or a scan of 6 pages or fewer, is read whole
   (`ocr_done`).
2. **Full:** each preview that classify found to be IT is read whole
   (`ocr_done`).

A digital PDF is read in seconds; a scan goes through Tesseract OCR at about
4 s a page.

With `--id`, it reads that TOR whole, whatever its status. Use that after
changing an OCR setting.

```
npm run ingest:ocr
npm run ingest:ocr -- --id 67059626749
```

## Options

| Option | Used by | Default | Meaning |
|---|---|---|---|
| `--id <projectId>` | download, ocr | all waiting records | Work on one TOR only |
| `--query`, `-q` | fetch | none for e-GP; `คอมพิวเตอร์` for data.go.th | Keep only new projects whose title has this text. e-GP has none by default: classify decides what is IT |
| `--limit`, `-l` | fetch | none for e-GP; `5` for data.go.th | At most this many **new** projects per source; updates to projects already in the database are never limited |
| `--source` | fetch | `all` | `process3`, `datago` or `all` |
| `--skip-ocr` | `ingest` | off | Stop after download |
| `--step`, `-s` | `ingest` | `all` | `fetch`, `download`, `ocr` or `all`. The `ingest:*` scripts set this for you. |
| `--retry-failed` | download, ocr | off | Also try the TORs that gave up after repeated failures |

## Settings

These are optional, in `server/.env`:

| Variable | Default | Meaning |
|---|---|---|
| `DOCUMENTS_DIR` | `server/data/documents` | Where PDFs are saved |
| `OCR_MAX_PAGES` | `150` | Scanned pages to OCR per document |
| `OCR_SECONDS_PER_PAGE` | `10` | OCR time budget per page. A document gets pages × this. |
| `PIPELINE_MAX_ATTEMPTS` | `3` | Failures before a step leaves a TOR out. Ingestion and extraction both use it. |

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
2. **Extract** (the whole text).
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

### `npm run extract`

**Extracts every TOR that needs it:** TORs that have no insight yet, and TORs
whose PDF or OCR text has changed since.

```
npm run extract                        # what needs doing
npm run extract -- --id 68049205582    # one TOR, whatever its state
npm run extract -- --limit 3           # at most 3 this run (cost control)
npm run extract -- --dry-run           # save nothing; review files only
npm run extract -- --outdated          # also redo results from an older prompt
npm run extract -- --force             # redo everything, reviewed results too
npm run extract -- --recheck           # rebuild from saved answers: no Gemini call
npm run extract -- --retry-failed      # also try TORs that gave up after failing
```

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
