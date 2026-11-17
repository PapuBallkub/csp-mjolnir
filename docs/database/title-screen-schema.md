# Data Dictionary & Schema Specification: `TitleScreen`

**File:** `server/src/models/title-screen.model.js`
**Model Name:** `TitleScreen`
**Collection Name:** `titlescreens`
**Related Documents:** [0026 · Screen titles before downloading](../decisions/0026-screen-titles-before-downloading.md), [0028 · Past projects from data.go.th](../decisions/0028-past-projects-from-data-go-th.md), [Tor Schema](./tor-schema.md), [TorInsight Schema](./tor-insight-schema.md)
**Status:** Active

---

## 1. Overview

What Gemini made of a project's title (ชื่อโครงการ) before anything was downloaded: one document per project. A project found clearly not IT (`not_it`) stops here and is never downloaded. One found `it` or `unsure` goes on to download, preview OCR and classify, which judges it from the document ([0026](../decisions/0026-screen-titles-before-downloading.md)).

A wrong `not_it` loses a project for good, while a wrong `unsure` only costs a download, so the prompt sends doubt to `unsure`. Computers and other hardware (ครุภัณฑ์คอมพิวเตอร์) are `unsure`: the title can't tell whether software comes with them.

The verdict is kept apart from `TorInsight`. Ingestion reads it to decide what to download, the way it reads `TorInsight` to decide what to read whole ([0013](../decisions/0013-split-ingestion-and-ai-extraction.md)).

### Who writes it

- **`pipeline/extraction/screen.js`**, one Gemini call per 40 titles: `npm run screen`, which the scheduled jobs also run before they download new projects. Each save replaces the project's earlier document. A project still waiting to be downloaded is screened again when its title changes, or when the screen prompt's version does.
- **The same file, for past projects**, with `npm run screen -- --past`. It runs only by hand, since thousands of titles are a spending decision ([0028](../decisions/0028-past-projects-from-data-go-th.md)). A past project found `it` also gets a title-level `TorInsight` record.
- **The review workspace** (`features/admin/admin.service.js`) overwrites `verdict` and `reason` when an admin approves, confirms or reclassifies a TOR. It writes `pass` and `fail`, which aren't in the enum: an update skips Mongoose's enum check, and the readers below don't recognise either value.
- **`scripts/remove-datago-records.js`** deletes the documents of the past projects it removes.

### Who reads it

| Reader | What for |
| :--- | :--- |
| Download (`pipeline/ingestion/ingest.js`) | Which new projects to download: `it`, `unsure`, and the `not_it` ones in the audit sample. `--skip-screen` downloads without waiting for a verdict |
| History picks (`pipeline/ingestion/lib/past-requests.js`) | Past projects found `unsure`, with their category: chosen only after every `it` one in the price band ([0028](../decisions/0028-past-projects-from-data-go-th.md)) |
| `pipeline/jobs/run-job.js` | Verdict counts before and after each job (`PipelineRun.before.screens`) |
| `npm run report` | The period's verdicts, and the `unsure` past projects |
| The admin review workspace | Why a TOR was classified the way it was |

---

## 2. Fields

| Field | Type | Required / Indexed | Default | Description | Example |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `projectId` | `String` | Required, Unique | — | The project's e-GP ID | `"69019107849"` |
| `title` | `String` | Required | — | The title as screened. A different title later means screening again | `"ประกวดราคาจ้างพัฒนาระบบบริหารจัดการข้อมูลผู้ป่วย ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)"` |
| `verdict` | `String` | Required, Indexed | — | `it`: clearly software or IT services. `not_it`: clearly nothing to do with IT, such as construction, vehicles, food or cleaning. `unsure`: everything else, hardware included | `"it"` |
| `reason` | `String` | No | `""` | One short sentence, in Thai | `"จ้างพัฒนาระบบสารสนเทศ เป็นงานซอฟต์แวร์โดยตรง"` |
| `category` | `String` | No | `null` | The kind of IT project, from the title alone (`screen-v2`, [0028](../decisions/0028-past-projects-from-data-go-th.md)): one of the seven keys in `models/project-categories.js`, or `null` when the title can't tell. Always `null` for `not_it` | `"software-development"` |
| `audit` | `Boolean` | Indexed | `false` | A `not_it` project sent the whole way anyway, so the team can measure what the screen misses. About 1 in 10 (`SCREEN_AUDIT_RATE`), chosen by project ID, so screening again never re-rolls it. New projects only | `false` |
| `modelName` | `String` | Required | — | The Gemini model that answered (`GEMINI_MODEL`) | `"gemini-3.7-flash"` |
| `promptVersion` | `String` | Required | — | The screen prompt's version | `"screen-v2"` |
| `screenedAt` | `Date` | Required | — | When it was screened | `"2026-11-16T10:05:12.000Z"` |

**Indexes:** `{ projectId }` unique, `{ verdict }`, `{ audit }`.

---

## 3. Example Document (JSON)

```json
{
  "_id": "6738a9f0c2e4b1a5d8f30e21",
  "projectId": "69019107849",
  "title": "ประกวดราคาจ้างพัฒนาระบบบริหารจัดการข้อมูลผู้ป่วย ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์ (e-bidding)",
  "verdict": "it",
  "reason": "จ้างพัฒนาระบบสารสนเทศ เป็นงานซอฟต์แวร์โดยตรง",
  "category": "software-development",
  "audit": false,
  "modelName": "gemini-3.7-flash",
  "promptVersion": "screen-v2",
  "screenedAt": "2026-11-16T10:05:12.000Z"
}
```
