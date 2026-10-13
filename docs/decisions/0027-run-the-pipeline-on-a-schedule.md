# 0027 · Run the pipeline on a schedule

Status: proposed · 2026-10-13

## Context

FR-01 asks for the feed to be polled automatically. The pipeline was built to
be scheduled ([0016](0016-pipeline-runs-are-safe-to-repeat.md)): every step
is safe to repeat, a lease in MongoDB keeps two runs apart, and failing TORs
stop after 3 tries. What was missing was the schedule itself, and coverage.

What the e-GP feed allows ([process3_gprocurement.md](../data-sources/process3_gprocurement.md)):
- **It's closed 09:00–12:00 and 13:00–17:00.** Agencies post during office
  hours, so most posts happen while it's closed.
- **The national feed shows only the same day's latest 20 items per code.**
  Polling it more often doesn't add coverage, and on a quiet day it's empty.
- **One agency's list (`deptId`) reaches back several days, up to 20 items
  per code.** That's where coverage has to come from.
- The agency codes are published on data.go.th (`egpdepartment`), and the feed
  accepts them whatever their format: `0307`, `11012`, `A004`.

Downloads, OCR and Gemini don't depend on the feed's hours.

## Decision

**Three jobs, on a fixed schedule in Bangkok time.**

| Time | Job | What it does |
|---|---|---|
| 08:00 | poll | National feed, then process |
| 12:05 | poll | National feed, then process |
| 17:05 | poll | National feed, then process |
| 18:00 | sweep | Every agency in the list, then process |
| 22:00 | process | Whatever is still waiting, through the night |

- **Process** screens new titles ([0026](0026-screen-titles-before-downloading.md)),
  downloads what passed, previews it, classifies it, reads the IT ones whole and
  extracts them: `npm run pipeline`'s order.
- **Poll and sweep ask for every code but `15`,** which has timed out on every
  request so far. Asking every code also brings cancellations, winners and
  amendments of the projects we follow.
- **The sweep asks 267 central-government agencies,** about 1,870 requests at
  one a second (NFR-03). The list is `ingestion/data/egp-agencies.json`,
  refreshed by `npm run agencies:fetch`. Local government, schools, hospitals
  and state enterprises come later, if the first runs justify them.

**Each job is a command, `npm run job -- <name>`.** It runs its steps one
after another, each in its own process, as the same commands run by hand.
Whatever starts it, it behaves the same: the local scheduler for a test
(`npm run schedule`), cron on a VM, or Cloud Scheduler.

**Time boxes, not overlaps.**
- A job takes no new work after its time box, by default 5 minutes before the
  next job. Every step honours `--until`: the project in hand finishes, and
  the rest waits for the next run.
- One job at a time, by a `job` lock. A job that finds another running waits
  up to 20 minutes, then gives up and records that it was skipped.
- The steps keep their own locks, so a job and a run by hand never work on
  the same TORs.

**A feed that stops answering stops being asked.**
- Within one request batch, after 2 requests in a row get no answer.
- In a sweep, after 2 agencies in a row get no answer at all.
- Otherwise a dead feed would cost every remaining request its 20-second
  timeout, about 10 hours for a sweep.

**Every run leaves records.**
- `FeedPoll`: each time the feed was asked, nationally or for one agency:
  requests, answers, items per code and new projects. A count of 20 means an
  agency's list may have been cut off. This is the polling health of FR-22.
- `PipelineRun`: each job, with its steps, their exit codes and times, and
  the counts before and after (projects by stage, screen verdicts, insights).
- A log file per job under `data/logs/<date>/`.

## Consequences

- **Coverage goes from the day's latest 20 to every central-government
  agency's recent list.** A busy agency can still post more than 20 a code
  between two sweeps; the `FeedPoll` records show which, and those can be
  swept more often.
- **Weekend hours are learned, not guessed.** The schedule runs every day: a
  quick, empty answer is a quiet day, and a timeout during open hours is the
  feed down.
- **The admin dashboard can read real records.** FR-22 still shows fixture
  data; wiring it to `FeedPoll` and `PipelineRun` is the next step.
- **Backfill isn't scheduled yet.** Past data for analytics, such as winner
  pages and data.go.th's FY2568 contracts, gets the quiet hours once it
  exists.
- **Hosting is still open.** The jobs need a disk that outlives a run
  (`DOCUMENTS_DIR`, `EXTRACTIONS_DIR`) and a host e-GP answers. A first test
  runs on a laptop for a day.
