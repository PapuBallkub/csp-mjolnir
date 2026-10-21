# 0030 · Run the night in priority waves

Status: proposed · 2026-10-21 · amends [0027](0027-run-the-pipeline-on-a-schedule.md) and [0028](0028-past-projects-from-data-go-th.md)

## Context

The pipeline does three kinds of work, and a day's delay costs each very
differently:

| Work | What a day's delay costs |
|---|---|
| **New TORs** | A day of a short bid window, for everyone who would have found it |
| **Changes to TORs we follow** (a new stage, a changed package) | People deciding whether to bid act on an old deadline or old terms |
| **Past projects** for the price comparison ([0028](0028-past-projects-from-data-go-th.md)) | Almost nothing: the FY2568 pool doesn't change |

Until now they shared every queue. `history` marked tonight's past projects,
and then download, OCR and extract took everything waiting together: download
and OCR in database order, extract by the least recently updated.

That's fine while nothing runs out, but a night can run out of several things:
- **OCR time:** 3.8 s per scanned page on the team's laptop. A changed TOR is
  read whole, so an 83-page amendment is about 5 minutes.
- **Gemini:** on 2026-10-21, classify calls that usually take 3 seconds took
  5–9 minutes each for part of the night, and the first extract pass took
  174 minutes.
- **The night itself:** the pipeline runs on a laptop, which may be needed by
  07:30. The 22:00 job ran on 3 of the 7 nights to 2026-10-21.

When a night is cut short, what's left undone should be the work that can
wait.

## Decision

**Three queues, by state.** `download`, `ocr` and `extract` take
`--queue new|changed|past` (several allowed, comma-separated). Without it they
take every TOR, as before. Which queue a TOR is in follows from the database,
not from a record of how it got there:

| Queue | Download takes | OCR and extract take |
|---|---|---|
| `past` | a past project asked for (`historyRequestedAt`) and not workable | the same |
| `changed` | a workable TOR with `packageCheckNeeded`: e-GP announced a new stage ([0020](0020-read-the-whole-egp-package.md)) | a workable TOR whose document was replaced: `document.version` above 1 |
| `new` | every other | every other |

Within a step, the soonest bid deadline goes first, and those without one go
last.

**The jobs run them as waves:**

```
poll, sweep   fetch or sweep → [new] → [changed]
process       1 check        recheck → download (changed)
              2 new TORs     screen → download → ocr → extract → ocr → extract     (new)
              3 changes      ocr → extract → ocr → extract                         (changed)
              4 price        comparisons → history → download → ocr → extract
                             → ocr → extract (past) → comparisons
```

- **The check comes first,** although changes rank after new TORs. It's
  requests only: a few minutes. Once download has applied a new package, the
  API shows the new deadline, ราคากลาง, budget and agency the next morning (it
  reads them live from the `Tor`, [0020](0020-read-the-whole-egp-package.md)),
  however the night ends. Only the expensive part, reading, waits for new
  TORs.
- **The recheck still only watches.** It logs the packages it finds and
  changes nothing, until a week of it shows where e-GP keeps an amendment.
  Until then, wave 1's download takes the TORs whose new stage the feed
  announced.
- **The comparisons run twice** (amends [0028](0028-past-projects-from-data-go-th.md),
  which ran them first). Before `history`, because `history` counts each
  open TOR's related projects from them; without a fresh run, tonight's new
  TORs would look like they have none and get extra picks. And at the end,
  so tonight's reads are in the lists by morning.
- **`poll` and `sweep` read no past projects,** and their changed queue holds
  only what the feed flagged.

## Consequences

- **A short night cuts the price wave first,** then the changes, and new TORs
  last. Each step's name says its queue (`ingest download (new)`), so
  `PipelineRun` and `npm run report` show which wave a night stopped in.
- **More steps:** the night has 20 instead of 9, and `poll` and `sweep` 12
  instead of 7. A step with nothing to do costs a process start and one query,
  a second or two.
- **The comparisons no longer run first.** A night cut before wave 4 leaves
  them for the next night. They take under a minute and use only the
  database, and the price comparison can wait a night.
- **Past projects can be starved** if waves 1 to 3 fill every night. Not close
  yet: the night of 2026-10-21 finished 48 minutes inside its time box, slow
  Gemini and all. If the run records show wave 4 cut night after night, it
  can get a floor.
- **A TOR whose document changed before its first extraction counts as
  changed,** so it's read in wave 3, not 2. Rare, and still done the same
  night.
- **Download and OCR go by deadline now,** not database order, and extract by
  deadline before least recently updated. Run by hand without `--queue`,
  every step still takes everything.
