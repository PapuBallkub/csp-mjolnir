# The pipeline, in plain words

A guide for admins and developers who are new to the pipeline: what it does,
how a project travels through it, and how to run and check it. Nothing here
needs you to read code. When you need the exact commands and options, see
[pipeline.md](pipeline.md); the reasons behind each design choice are in
[decisions/](decisions/).

## What it's for

Thai government agencies announce what they want to buy on **e-GP**, the
government's procurement system. The details sit in long PDF documents,
often scanned paper, written in formal government Thai. The most important
one is the **TOR** (terms of reference): what the agency wants built or
bought, by when, and on what terms.

The pipeline does the reading for our users:

1. **Finds** new projects on e-GP, every day.
2. **Keeps only IT projects**: software and IT services, not trucks, roads or
   computers bought on their own.
3. **Reads** their documents and writes a plain summary: budget, deadline,
   required technologies, penalties, risks.
4. **Puts the summary on the website**, linked back to the original
   documents, which remain the authority.

It never bids, never contacts an agency, and never changes anything on e-GP.
It only reads what e-GP publishes.

## The big picture

The pipeline has two halves. They never talk to each other directly; they
share one database.

```
  COLLECTING (no AI)                          UNDERSTANDING (AI)
  ──────────────────                          ──────────────────
  find projects on e-GP                       is this title IT?
  download their documents       DATABASE     is this document IT?
  turn scans into text      ───►  (MongoDB) ◄───  write the summary
                                              check it against the document
```

- **Collecting** talks to government websites. It is careful and slow on
  purpose: at most one request a second, and it says honestly who it is.
- **Understanding** uses Google's **Gemini** AI. It's the only part that
  costs money.

The website reads the results from the database.

## Where the data comes from

| Source | What it gives us | Notes |
|---|---|---|
| **The e-GP feed** | New announcements: drafts, invitations to bid, changes, cancellations, winners | The only source of projects that are **open now**. It is **open only from 17:01 to 08:29** (Bangkok time), so the pipeline only asks it then. |
| **e-GP document packages** | Each project's files: the announcement, the bidding document, the TOR, and the price form | Downloaded once per stage of the project. Some are scans, which must be read with OCR (text recognition). |
| **data.go.th** | e-GP's list of agencies and their codes; past contracts from fiscal year 2568 (October 2024 to September 2025) | The agency list feeds the sweep. The past contracts aren't open projects: the IT ones are imported once, for price comparisons (below). |

The feed can be asked in two ways:
- **The national list:** today's latest 20 announcements of each kind. Quick,
  but it misses most of a busy day, and on a holiday it's empty.
- **One agency at a time:** that agency's latest 20 of each kind, reaching
  back several days. Asking all 267 central-government agencies, one after
  another, is called the **sweep**. It's how we find what the national list
  missed. It takes about an hour and a half, with short pauses: e-GP turns
  us away after 240 requests in a row.

## Past projects

Prices only mean something next to what similar projects cost before. The
feed brings few of those, so the pipeline can also import **past contracts
from data.go.th** (fiscal year 2568), once:

- Only projects that were announced publicly, with titles that look like IT,
  are kept. They become ordinary projects with status Awarded.
- Gemini then sorts their titles, when someone runs it by hand. Those that
  are IT get a **title-level summary**: title, agency, prices and the kind of
  project, nothing else. It counts in price statistics, but the site never
  shows it. Those it's unsure about, mostly computer equipment and other
  hardware, get nothing and count nowhere until their documents are read.
- **Every night, 20 of them have their documents read in full,** like any
  project, and then they get a normal summary that detailed comparisons can
  use. The night run looks after the open projects closing soonest first:
  each gets the past projects most like it until it has 5 similar projects
  (past or new), then the next one gets its turn. Once all have 5, the
  soonest look for more. The unsure ones come only after the IT ones.
- **This only happens on nights the 22:00 run runs,** so for now, only when
  someone's computer is running the schedule then. At 20 a night, reading
  all 2,239 IT past projects would take about 110 nights. That isn't the
  aim: the aim is past projects like the ones open now.

## The journey of one project

```
found ─► title screen ─► download ─► preview ─► IT check ─► full read ─► summary ─► website
           │                                       │
           └─ clearly not IT: stops               └─ not IT: stops
```

| Stage | What happens | What can stop it here |
|---|---|---|
| **1. Found** | The feed announces it. We save its title, ID and stage. | Nothing. Drafts, invitations and changes to them add new projects; news of a winner or a cancellation only updates projects we already have. |
| **2. Title screen** | Gemini reads the title alone (40 titles at a time) and answers *IT*, *not IT* or *unsure*. | A title that is clearly not IT, such as a road or a truck. **One in ten of those goes on anyway**, so we can see how often the screen is wrong. |
| **3. Download** | Its document package is downloaded from e-GP. The agency, the reference price (ราคากลาง), the bid deadline and the budget are read from the documents. | e-GP not answering (tried again later), or a package too big to download (over 200 MB). |
| **4. Preview** | The first 6 pages of the TOR are read. | A scan is read by OCR, about 4 seconds a page. |
| **5. IT check** | Gemini reads those first pages and decides: is this software or IT services? | Not IT. It's kept as "excluded", with the reason, and goes no further. |
| **6. Full read** | The whole TOR is read. | |
| **7. Summary** | Gemini reads the TOR and the bidding document, and fills in the summary: every fact with the sentence it came from. | Gemini failing three times on the same document. |
| **8. Checks and score** | The pipeline checks each fact against the document and the feed, and gives the summary a score from 0 to 100. | |
| **9. Website** | The project appears in the catalog. | In production, only summaries a person has approved, with a score of 80 or more. Today, during the pilot, unreviewed ones are shown too, labelled as unreviewed. |

A project keeps moving after that. When e-GP announces a change, a
cancellation or a winner, the pipeline updates its status. When a new stage
brings new documents, it downloads and reads them again.

### What "IT" means here

**In:** building or customizing software, websites or apps; setting up or
integrating IT systems and networks; software licences; running, maintaining
or supporting IT systems.

**Out:** hardware bought on its own (computers, printers, parts), and
everything that isn't IT (construction, vehicles, cleaning, medicine). Our
users are software engineers looking for work, and delivering boxes isn't
that work.

### What a project's status means

| Status | Meaning | Where it comes from |
|---|---|---|
| Draft | The TOR is out for public comment | e-GP |
| Open | Invitation to bid | e-GP |
| Awarded | A winner has been announced | e-GP |
| Cancelled | The agency cancelled it | e-GP |
| Closed | Past the bid deadline, with no news from the agency | **Worked out by us**, not announced |
| Amended (a flag) | The agency changed the invitation, perhaps more than once | e-GP |

## What the AI does, and what it doesn't

Gemini does three jobs, each small and checked:

1. **Title screen:** IT, not IT, or unsure, from the title alone. When in
   doubt, it must say unsure.
2. **IT check:** IT or not, from the first pages of the TOR.
3. **Summary:** the facts of the TOR and its bidding document, each with the
   exact sentence it came from.

What keeps it honest:
- **Every fact must quote the document.** A quote that isn't in the document
  fails a check and lowers the score.
- **Facts read by plain code win over the AI's.** The reference price, budget,
  deadline and status come from the feed and the documents, not from Gemini.
- **Nothing is invented.** When the TOR doesn't state something, the summary
  says so.
- **A person has the last word.** A summary scoring under 80 waits for review
  before the public sees it.

## When it runs

The pipeline runs by itself at fixed times, in Bangkok time:

| Time | Run | What it does | Why then |
|---|---|---|---|
| 08:00 | poll | The national list, then processing | Before the feed closes at 08:30 |
| 17:05 | poll | The national list, then processing | The feed reopens at 17:01 |
| 18:00 | sweep | All 267 agencies, then processing | Catches what the national list missed |
| 22:00 | process | The night: check whether draft and open IT TORs' documents changed, and record what changed, then new projects, then changed ones read again, then the price comparisons and tonight's 20 past projects | Through the night, until 07:55 |

"Processing" is stages 2 to 9 above, done for new projects first, then for
changed ones. **The night goes in that order of what matters most:**
1. **Check:** ask e-GP whether open and draft TORs' documents changed, and
   download the changed ones. A few minutes, so a moved deadline shows by
   morning.
2. **New projects:** a day late is a day of their bid window lost.
3. **Changed projects:** read them again.
4. **Price comparisons:** past projects can wait a night.

So if the laptop has to be unplugged early, what's left undone is what can
wait. Each run stops taking new work 5 minutes before the next one starts,
and only one runs at a time.

## Running it

### Once, before the first run

You need:
- **Docker Desktop**, running. Then, in the project folder:
  ```
  docker compose up -d mongo
  ```
- **Access to Gemini.** Ask the team for the Google Cloud project and the
  `aiplatform.user` role, then follow "Setup, once per person" in
  [pipeline.md](pipeline.md#setup-once-per-person).

**Every pipeline command runs from the `server` folder,** not the project
folder. From the project folder, go there first, then check Gemini works:

```
cd server
npm run gemini:check
```

Run from anywhere else, npm says it "could not read package.json".

### The commands you'll use

| To… | Run |
|---|---|
| Run the pipeline on its schedule, on this computer | `npm run schedule` |
| …and start with the big sweep right away | `npm run schedule -- --now sweep` |
| Run one round by hand | `npm run job -- poll` (or `sweep`, or `process`) |
| See what happened in the last 24 hours | `npm run report` |
| Add one project the feed never showed | `npm run ingest:add -- --id 69109028093` |
| Import past IT contracts from data.go.th, once | `npm run history:import -- --dry-run` to see the counts, then without `--dry-run` |
| Sort those past projects' titles with Gemini | `npm run screen -- --past --limit 200` (costs Gemini; run by hand only) |
| See which past projects tonight's run would read in full | `npm run ingest -- --step history --dry-run` |
| See whether draft and open TORs' documents changed on e-GP | `npm run ingest -- --step recheck --dry-run` (about 3½ minutes; changes nothing). Without `--dry-run` it flags them for the next download. |

**`npm run schedule` keeps running until you stop it.** It waits for the
next time in the table, starts that run, and waits again. A window that seems
to do nothing is waiting, not stuck. Keep the window open and the computer
awake (plugged in, sleep turned off).

**To stop it, press Ctrl+C**, or close the window. That's safe even in the
middle of a run: half-done work is picked up next time, and nothing is
done twice.

## Checking it's healthy

Run `npm run report`. It has five parts:

| Part | What you see | Healthy looks like |
|---|---|---|
| **Jobs** | Each run: when, which, how it ended, how long | `done`, or `timed-out` (it ran out of time and left work for the next run). `skipped` means the run before was still going. |
| **Feed** | Requests sent, the share answered, new projects found | Close to 100% answered outside office hours. |
| **Title screen** | How many titles were IT, unsure or not IT | Most are not IT: about 1 project in 20 is IT. |
| **Classify and extract** | Summaries written, projects excluded, and each summary's score | Scores of 80 or more. |
| **Failures** | Projects a step couldn't finish, and why | A few at most. Each is tried 3 times, then left for a person. |

Each run also writes a log file, in `server/data/logs/<date>/`, with every
step it took.

### What's normal, and what isn't

| You see | It means |
|---|---|
| The national list returns nothing | A quiet day or a holiday. Normal. |
| An agency's list has exactly 20 items | It may hold more; some can be cut off. Normal for busy agencies. |
| "the source did not answer; not counted" | e-GP or Gemini was briefly down. It's tried again next run. |
| "pausing 10 min, before e-GP's limit" | Planned: the sweep rests every 230 requests. Normal. |
| "230 requests in a row to gprocurement.go.th: pausing 10 min" | The same rest, in another step: e-GP counts a whole run's requests together. Normal. |
| "NEW announcement package" in the recheck | e-GP has a newer package for that TOR than the one we read. The download after it fetches the package and decides what it is. Normal. |
| "CHANGED" in a download | A new package changed the TOR: its file, deadline, ราคากลาง or budget. It's recorded, and shows on the TOR's page. |
| "Next stage: the draft became an invitation" | Not a change: drafts become invitations. Normal. |
| "A new package whose stage couldn't be read" | Its announcement had no text to read, so it isn't counted as a change. Rare; tell the team if it keeps happening. |
| "AMENDMENT SERVICE ANSWERED" in the recheck | e-GP's amendment service had something for that TOR, which we've never seen before. Tell the team: it shows where amendments are kept. |
| "e-GP asked us to slow down (HTTP 429)", then a 10-minute pause | e-GP refused us anyway. The sweep waits and carries on. Fine now and then. |
| The sweep stopped after 3 refusals in a row | e-GP is limiting us harder than usual. The next sweep starts again; if it happens every night, lower `EGP_FEED_BURST`. |
| "asked again by day: … cut off" | An agency posted more than 20 of one kind in one day; some of that day is missing. Rare. |
| **NO ANSWER** from the feed outside office hours, run after run | The feed is down or blocking us. Look at the logs. |
| A project at "attempt 3 of 3" | It's skipped from now on. Look at its error. |
| A Gemini call taking over a minute | Gemini is slow at times. Normal. |

## Built-in safety

- **Polite to government websites:** at most one request a second, an honest
  name in every request, nothing done to get around their security, and no
  requests while the feed is closed.
- **Safe to stop and run again:** every step can repeat without redoing
  finished work or paying twice.
- **Gives up instead of hammering:** a project that keeps failing stops after
  3 tries, a feed that stops answering stops being asked, and a file too big
  to download isn't downloaded again.
- **Never rewrites the source:** the original documents and the e-GP page
  stay one click away from every summary, and they are the authority.

## What it costs

Only Gemini costs money; e-GP and data.go.th are free.

| Gemini job | How often | Size |
|---|---|---|
| Title screen | Once per 40 new titles | Very small: 8 titles took about 1,300 tokens |
| IT check | Once per project that passed the screen | Small: the first pages of a TOR |
| Summary | Once per IT project, and again when its documents change | The largest: the whole TOR and bidding document |

Gemini is paid by the **token**, a piece of text a few characters long. There
is no daily spending cap yet. Each run's log shows how many tokens Gemini
read and wrote.

## Common questions

**A project I know about isn't on the site.** It may be:
- still waiting for a run;
- screened out by its title;
- found not IT by the IT check;
- failed, so look under Failures in the report;
- one the feed never listed. Add it with `npm run ingest:add -- --id <its 11-digit e-GP ID>`.

**The computer slept through a run.** That run starts late, when the
computer wakes. Others it slept through are skipped; the next sweep catches
up.

**Can I run it during office hours?** Yes. It simply doesn't ask the feed
then, and works on whatever is waiting.

**Will anything happen twice if I start a run by hand while one is going?**
No. A second `npm run job` waits for the first, up to 20 minutes, then gives
up and says so. A single step, such as `npm run extract`, stops at once and
says who is running.

## Words you'll meet

| Word | Meaning |
|---|---|
| **e-GP** | The Thai government's electronic procurement system |
| **TOR** | Terms of reference: the document saying what the agency wants |
| **Bidding document** (เอกสารประกวดราคา) | The legal terms: who may bid, bonds, payments, penalties |
| **Reference price** (ราคากลาง) | The agency's own estimate of a fair price |
| **Budget** (งบประมาณ) | The money set aside for the project |
| **Package** | The set of files e-GP publishes for one stage of a project |
| **OCR** | Reading text from a scanned image |
| **Sweep** | Asking every agency in the list, one after another |
| **Title screen** | Gemini's first, quick look at a title, before anything is downloaded |
| **Excluded** | Checked and found not IT; kept, but not shown |
| **Score** | 0 to 100, from how well a summary's facts match its documents |
