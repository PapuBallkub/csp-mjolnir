# Pipeline commands

How TORs get into the database, and the commands that move them along. The
reasoning behind the design is in [0008](decisions/0008-tor-ingestion-pipeline.md)
and [0013](decisions/0013-split-ingestion-and-ai-extraction.md).

There are two pipelines, and they meet only in the database:

```
INGESTION                                    AI EXTRACTION (coming next)
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
| `downloaded` | PDF saved to `server/data/documents/` | `ingest:ocr` |
| `ocr_done` | Text extracted into `ocr.rawText` | AI extraction |

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

```
npm run ingest:fetch -- --limit 3
npm run ingest:fetch -- --source process3 --query "ซอฟต์แวร์" --limit 2
```

### `npm run ingest:download`
**Downloads the PDF** for every `fetched` TOR, or for one TOR with `--id`. A
file that is already on disk is reused, not downloaded again.

```
npm run ingest:download
npm run ingest:download -- --id 68039469567
```

### `npm run ingest:ocr`
**Extracts the text** of every `downloaded` TOR, or of one TOR with `--id`.
- A digital PDF is read directly, in seconds.
- A scanned PDF goes through Tesseract OCR, which takes minutes for a long
  document.

With `--id`, it re-runs on that TOR whatever its status. Use that after
changing an OCR setting.

```
npm run ingest:ocr
npm run ingest:ocr -- --id 67059626749
```

## Options

| Option | Used by | Default | Meaning |
|---|---|---|---|
| `--id <projectId>` | download, ocr | all waiting records | Work on one TOR only |
| `--query`, `-q` | fetch | `คอมพิวเตอร์` | Search keyword sent to the sources |
| `--limit`, `-l` | fetch | `5` | How many TORs to fetch **per source** |
| `--source` | fetch | `all` | `process3`, `datago` or `all` |
| `--skip-ocr` | `ingest` | off | Stop after download |
| `--step`, `-s` | `ingest` | `all` | `fetch`, `download`, `ocr` or `all`. The `ingest:*` scripts set this for you. |

## Settings

These are optional, in `server/.env`:

| Variable | Default | Meaning |
|---|---|---|
| `DOCUMENTS_DIR` | `server/data/documents` | Where PDFs are saved |
| `OCR_MAX_PAGES` | `150` | Scanned pages to OCR per document |
| `OCR_SECONDS_PER_PAGE` | `10` | OCR time budget per page. A document gets pages × this. |

When OCR stops before the end of a document (page limit, time budget, or pages
that failed), the log line says `TRUNCATED` and `Tor.ocr.truncated` is `true`.
On a slow machine, raise the two limits and run `ingest:ocr -- --id` again.

## AI extraction

Extraction calls Gemini through the team's Google Cloud project. It's still
being built. For now, there's one command, to check the setup.

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
