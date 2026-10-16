# 0027 · Run the pipeline on a schedule

Status: proposed · 2026-10-13

## Context

FR-01 asks for the feed to be polled automatically. The pipeline was built to
be scheduled ([0016](0016-pipeline-runs-are-safe-to-repeat.md)): every step
is safe to repeat, a lease in MongoDB keeps two runs apart, and failing TORs
stop after 3 tries. What was missing was the schedule itself, and coverage.

What the e-GP feed allows ([process3_gprocurement.md](../data-sources/process3_gprocurement.md)):
- **It's open 17:01–08:29 only** (the manual's newer edition, and every
  observation). Agencies post during office hours, while it's closed.
- **The national feed shows only the same day's latest 20 items per code.**
  Its own count (`countbyday`) says what that misses: 377 invitations on
  2026-10-07, 490 on 2026-10-09. Polling more often doesn't add coverage.
- **One agency's list (`deptId`) reaches back several days, up to 20 items
  per code,** and `announceDate` asks for one day only. One agency on one day
  was complete in every test. That's where coverage has to come from.
- The agency codes are published on data.go.th (`egpdepartment`), and the feed
  accepts them whatever their format: `0307`, `11012`, `A004`.
- **e-GP refuses the 240th request in a row** (HTTP 429), whatever the pace,
  until we stop for a while.

Downloads, OCR and Gemini don't depend on the feed's hours.

## Decision

**Three jobs, on a fixed schedule in Bangkok time.**

| Time | Job | What it does |
|---|---|---|
| 08:00 | poll | National feed, then process, before the feed closes at 08:30 |
| 17:05 | poll | National feed, then process, as soon as it opens |
| 18:00 | sweep | Every agency in the list, then process |
| 22:00 | process | The comparisons and tonight's past projects ([0028](0028-past-projects-from-data-go-th.md)), then whatever is still waiting, through the night |

- **Process** screens new titles ([0026](0026-screen-titles-before-downloading.md)),
  downloads what passed, previews it, classifies it, reads the IT ones whole and
  extracts them: `npm run pipeline`'s order.
- **Poll and sweep ask for every code but `15`,** which has timed out on every
  request so far. Asking every code also brings cancellations, winners and
  amendments of the projects we follow.
- **The sweep asks 267 central-government agencies,** about 1,870 requests.
  The list is `ingestion/data/egp-agencies.json`, refreshed by
  `npm run agencies:fetch`. Local government, schools, hospitals and state
  enterprises come later, if the first runs justify them.
- **The sweep asks at one request a second (NFR-03) and pauses 10 minutes
  after every 230,** before e-GP's limit of 240. A full sweep takes about 100
  minutes, half of it pausing. Slowing down instead doesn't help: at one
  request every 3 seconds, e-GP still refused the 240th, 7 times in a night.
  `EGP_FEED_BURST` changes the 230.
- **When e-GP refuses anyway, the sweep pauses for 10 minutes** and asks the
  same thing again. It stops after 3 refusals in a row, or when a pause would
  run past its time box; the next sweep starts from the top.
- **A full list is asked again day by day.** An agency's list that comes back
  with 20 items may have cut days short: its oldest day, and any day before
  it since the last sweep. Those days are asked again with `announceDate`,
  and e-GP's `countbyday` says whether anything is still missing. Days since
  the last sweep means yesterday and today by default; `--days N` looks
  further back, up to the 7 days a list covers, after a sweep was missed.

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
- Within one request batch, after 2 requests in a row get no answer, or at
  the first refusal (HTTP 429).
- In a sweep, after 2 agencies in a row get no answer at all.
- Otherwise a dead feed would cost every remaining request its 20-second
  timeout, about 10 hours for a sweep.

**Every run leaves records.**
- `FeedPoll`: each time the feed was asked, nationally, for one agency, or
  for one agency's day: requests, answers, refusals, items per code, e-GP's
  count per code and new projects. This is the polling health of FR-22.
- `PipelineRun`: each job, with its steps, their exit codes and times, and
  the counts before and after (projects by stage, screen verdicts, insights).
- A log file per job under `data/logs/<date>/`.

## Consequences

- **Coverage goes from 4–5% of a busy day to every central-government
  agency's announcements,** with e-GP's own count as proof. An agency that
  posts more than 20 of one code in one day is still cut off; the
  `FeedPoll` records show which, and `methodId` or `deptsubId` might split it
  (not tested).
- **The first test day (2026-10-13 22:00 to 2026-10-14 12:05) found 418 new
  projects.** 60 of them were IT and were extracted, 54 with a score of 80 or
  more. The sweep found 394 of the 418, the national polls 24.
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
