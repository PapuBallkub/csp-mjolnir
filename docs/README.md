# GIPDP docs

Everything written about how GIPDP works and why. The overviews explain from
above in plain words and link down; the reference pages hold the detail. If
you're new, read the first four pages below in order, then look things up as
you need them.

## Start here

1. [system-overview.md](system-overview.md): the parts, how a TOR travels
   through them, the day's schedule, what isn't built yet.
2. [server-features.md](server-features.md): how the server is laid out by
   feature, which parts depend on which, and what they share.
3. [data-model.md](data-model.md): the 12 collections and how they connect.
4. [pipeline-guide.md](pipeline-guide.md): the pipeline in plain words, and
   how to run it.

Keep [glossary.md](glossary.md) open beside them: ราคากลาง, ว 214, `D2` and
the platform's own words are all there.

## Find your way

| I want to… | Read |
| :--- | :--- |
| Know what the product has to do | [requirements.md](requirements.md) |
| Find a file, or what a file does | [project-map.md](project-map.md) |
| Add a feature or a route to the server | [server-features.md](server-features.md#adding-a-feature) |
| Know why a TOR is or isn't on the public site | [what-the-public-sees.md](what-the-public-sees.md) |
| Understand a price verdict or a lock-spec flag | [analysis-overview.md](analysis-overview.md) |
| Run the pipeline, or check last night's run | [pipeline-guide.md](pipeline-guide.md) |
| Look up a pipeline command or setting | [pipeline.md](pipeline.md) |
| Know where a fact comes from on e-GP | [data-sources/data_flow_architecture.md](data-sources/data_flow_architecture.md) |
| Look up a field | [database/](#reference-pages) |
| Build the TOR detail page | [features/tor-detail-page.md](features/tor-detail-page.md) |
| Deploy | [deployment-checklist.md](deployment-checklist.md) |
| Know why something is built the way it is | [decisions/](#decisions) |

## Every page

### Overviews

| Page | What it covers |
| :--- | :--- |
| [system-overview.md](system-overview.md) | GIPDP on one page |
| [server-features.md](server-features.md) | The server's features, how they relate, and the shared parts |
| [data-model.md](data-model.md) | The collections, with an ER diagram, and who writes each |
| [what-the-public-sees.md](what-the-public-sees.md) | The gate between the database and the public |
| [analysis-overview.md](analysis-overview.md) | How the price check and lock-spec reach their verdicts |
| [pipeline-guide.md](pipeline-guide.md) | The pipeline in plain words |
| [glossary.md](glossary.md) | Thai procurement terms, e-GP codes, the platform's own words |

### Requirements, design and operations

| Page | What it covers |
| :--- | :--- |
| [requirements.md](requirements.md) | The public summary of the SRS: every requirement by the ID the code cites |
| [design-document.md](design-document.md) | The software design document. Living: being brought up to date as v1.1 |
| [deployment-checklist.md](deployment-checklist.md) | What to decide, set and check before a production deploy |
| [pipeline.md](pipeline.md) | Every pipeline command, option and setting |
| [project-map.md](project-map.md) | Every file in the repository, one line each, and the decision index |

### Reference pages

**Where the data comes from** (`data-sources/`):

| Page | What it covers |
| :--- | :--- |
| [data_flow_architecture.md](data-sources/data_flow_architecture.md) | How the three government sources fit together, and which file states each fact |
| [process3_gprocurement.md](data-sources/process3_gprocurement.md) | e-GP's RSS feed |
| [process5_gprocurement.md](data-sources/process5_gprocurement.md) | e-GP's documents |
| [data_go_th.md](data-sources/data_go_th.md) | The open-data portal: agency codes and past contracts |

**Every field** (`database/`):

| Page | Collection |
| :--- | :--- |
| [tor-schema.md](database/tor-schema.md) | `Tor`: a project as ingestion knows it |
| [tor-insight-schema.md](database/tor-insight-schema.md) | `TorInsight` and `TorInsightVersion`: the summary, and the versions it replaced |
| [user-schema.md](database/user-schema.md) | `User`: the account, the profile, the watchlist |
| [technology-schema.md](database/technology-schema.md) | `Technology`: the technology vocabulary |
| [pipeline-run-schema.md](database/pipeline-run-schema.md) | `PipelineLock` and `PipelineRun`: the pipeline's bookkeeping |

`FeedPoll`, `RequestStreak`, `IngestionLog` and `TitleScreen` have no page
yet; their model files in `server/src/models/` are the reference.

**Features** (`features/`). Some were written to build from, some describe
what's built; the last column says which:

| Page | What it covers | Kind |
| :--- | :--- | :--- |
| [tor-detail-page.md](features/tor-detail-page.md) | The detail page's sections and content | UI spec |
| [reality-check-and-benchmarking.md](features/reality-check-and-benchmarking.md) | The analysis feature as a whole | Spec, mostly built (FR-20's comparison with past projects isn't) |
| [comparable-projects-matching.md](features/comparable-projects-matching.md) | How similar past projects are found and ranked | Guide to what's built |
| [price-benchmark-calculations.md](features/price-benchmark-calculations.md) | The price check's arithmetic | Spec, built |
| [lock-spec-risk-detection.md](features/lock-spec-risk-detection.md) | The lock-spec rules and scoring | Spec, built |
| [pipeline-administration.md](features/pipeline-administration.md) | Admin monitoring, failures and recovery | Spec, built |
| [watchlist-changes.md](features/watchlist-changes.md) | "Changed since you saved" on the watchlist | Handoff: the data and API are ready; the UI isn't |

### Decisions

[decisions/](decisions/) holds 35 decision records (ADRs), one per file,
numbered in the order they were made. Each says what was decided, why, and
what it costs. [project-map.md](project-map.md) lists them all with a line
each. Lock-spec's record was 0030 until 2026-11-13 and is now 0035, so an
older comment citing "ADR 0030" for lock-spec means 0035.

## Writing docs here

- **One home per fact.** An overview explains and links to the page that
  holds the detail. When two pages need a fact, one states it and the other
  links.
- **Check every claim against the code**, not against another doc. Copies of
  copies are where these docs went wrong.
- **Diagrams in Mermaid**, so they live in the text and change with it.
- **English, with Thai terms inline** where the documents use them: ราคากลาง,
  not "median price estimate".
- **Cite requirements by ID** (`FR-19`, `NFR-17`) from
  [requirements.md](requirements.md). The full SRS stays out of the
  repository: don't quote it or link to it.
- **A decision takes the next free number**, never one already used.
- **A spec for something not built yet says so** in its status line.
- **Add a new file to [project-map.md](project-map.md)**, and to this page if
  it's a doc.

Commit conventions and the rest: [CONTRIBUTING.md](../CONTRIBUTING.md).
