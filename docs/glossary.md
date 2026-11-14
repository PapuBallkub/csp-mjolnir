# Glossary

The words the docs and the code lean on: Thai procurement terms, e-GP's
codes, and the words GIPDP made up for itself. Each entry links to where it's
explained in full.

The pipeline guide keeps its own short list for its readers
([Words you'll meet](pipeline-guide.md#words-youll-meet)); the entries here
agree with it.

## Thai procurement

| Term | Meaning |
| :--- | :--- |
| **TOR** (ขอบเขตของงาน, terms of reference) | The document saying what the agency wants: scope, deliverables, technical requirements. Often a scan |
| **Bidding document** (เอกสารประกวดราคา) | The legal terms: who may bid, bonds, payment, penalties, how the winner is chosen. Usually text, not a scan |
| **Announcement** (ประกาศ) | e-GP's notice for one stage of a project. Its PDF (`annoudoc_*.pdf`) states the agency, ราคากลาง and bid window |
| **ราคากลาง** (reference price) | The agency's own estimate of a fair price, set by a committee. The price GIPDP compares ([0014](decisions/0014-price-names-and-insight-data-rules.md)) |
| **งบประมาณ, วงเงินงบประมาณ** (budget) | The money set aside. GIPDP reads it from the price form, and uses it only when there's no ราคากลาง |
| **Price form** (แบบ บก.06, แบบ บก.05) | The form stating the budget and ราคากลาง: บก.06 for goods and services, บก.05 for hiring software development, which also splits the price into hardware, software and development. Usually a scan, in the price package ([0023](decisions/0023-read-the-budget-from-the-price-form.md)) |
| **Procurement method** (วิธีจัดซื้อจัดจ้าง) | How the agency buys: e-bidding (ประกวดราคาอิเล็กทรอนิกส์), price inquiry (สอบราคา) and others. Stored as the agency writes it |
| **Procurement kind** | Hire (จ้าง), buy (ซื้อ) or rent (เช่า), read from the project's title. Lock-spec's MAF rule reads it |
| **Agency** (หน่วยงาน) | The government body buying. e-GP gives each one a code, `deptId` |
| **Project ID** (เลขที่โครงการ) | e-GP's 11-digit number for a project, such as `68049205582`. The first two digits are the Buddhist-era year (68 → 2568). Every collection links by it ([data-model.md](overview/data-model.md)) |
| **นิติบุคคล** (juristic person) | A registered company or partnership. When a TOR admits only these, a freelancer can't bid: the API marks it `companiesOnly` |
| **ผลงาน** (past work) | A past contract of the same kind. TORs often require one of at least a stated value |
| **MAF** (หนังสือแต่งตั้งตัวแทนจำหน่าย) | A manufacturer authorization: a letter from the maker naming the bidder as its reseller or partner |
| **หรือเทียบเท่า** ("or equivalent") | The words a TOR must add when it names a brand or model, so other products can compete |
| **ว 214** | The Comptroller General's circular on writing specifications that don't restrict competition. The source of lock-spec's three rules ([lock-spec-risk-detection.md](features/lock-spec-risk-detection.md)) |
| **พ.ร.บ. การจัดซื้อจัดจ้างฯ 2560** | The Public Procurement Act B.E. 2560. Section 9 is about specifications |
| **กรมบัญชีกลาง** (Comptroller General's Department) | Runs e-GP and writes the procurement rules |
| **Lock-spec** (ล็อกสเปก) | Requirements written so that only one vendor can meet them. GIPDP flags the signs and never claims intent |
| **Penalty** (ค่าปรับ) | What the winner pays for lateness, often a share of the price per day, such as 0.20% |
| **Draft TOR** (ร่าง TOR) | A TOR published for public comment before bids open |

## e-GP announcement codes

The feed labels each item with a code
([0017](decisions/0017-read-the-egp-feed-as-egp-defines-it.md)). The table
is `server/src/pipeline/shared/announcement-codes.js`.

| Code | Thai name, shortened | Means | Status it sets |
| :--- | :--- | :--- | :--- |
| `15` | ประกาศราคากลาง | The reference price is published | None: information only |
| `B0` | ร่างเอกสารประกวดราคา | Draft TOR, out for comment | Draft |
| `D0` | ประกาศเชิญชวน | Invitation to bid | Open |
| `D2` | เปลี่ยนแปลงประกาศเชิญชวน | The invitation changed | Open, and the Amended flag |
| `D1` | ยกเลิกประกาศเชิญชวน | The invitation was cancelled | Cancelled |
| `W0` | ประกาศรายชื่อผู้ชนะ | Winner announced | Awarded |
| `W2` | เปลี่ยนแปลงประกาศรายชื่อผู้ชนะ | Winner changed | Awarded |
| `W1` | ยกเลิกประกาศรายชื่อผู้ชนะ | Winner announcement cancelled | Cancelled |
| `P0` | แผนการจัดซื้อจัดจ้าง | A procurement plan. **Not fetched**: a plan isn't a project yet | — |

`D1` cancels; it doesn't amend. Only `D2` sets the Amended flag.

## Statuses

| Status | Comes from |
| :--- | :--- |
| **Draft** | `B0` |
| **Open** | `D0` or `D2` |
| **Awarded** | `W0` or `W2`, or a signed contract on data.go.th |
| **Cancelled** | `D1` or `W1` |
| **Closed** | **Worked out by GIPDP**, never stored: Open and past its deadline, with no word from the agency |
| **Amended** (a flag, not a status) | `D2`. It sits on top of the status, since a TOR can change many times while it stays Open |

How they're shown: [0019](decisions/0019-stage-badges-and-deadlines-that-say-what-for.md).

## Sites and files

| Term | Meaning |
| :--- | :--- |
| **e-GP** | The Thai government's electronic procurement system |
| **process3** | e-GP's RSS feed (`process3.gprocurement.go.th`): new and changed announcements. Answers only 17:01–08:29 ([process3_gprocurement.md](data-sources/process3_gprocurement.md)) |
| **process5** | e-GP's file services: each project's documents ([process5_gprocurement.md](data-sources/process5_gprocurement.md)) |
| **data.go.th** | The open-data portal: e-GP's agency codes, and past IT contracts ([data_go_th.md](data-sources/data_go_th.md)) |
| **Turnstile** | Cloudflare's bot check on e-GP's website. GIPDP never gets around it, so what sits only behind it (a draft's comment deadline) is out of reach |
| **Package** | The set of files e-GP publishes for one stage of a project, identified by its `zipId` ([0020](decisions/0020-read-the-whole-egp-package.md)) |

## GIPDP's own words

### Data

| Term | Meaning |
| :--- | :--- |
| **Tor** | A project as ingestion knows it: from the feed, the documents, and OCR. One per project ID |
| **Summary**, **insight** (`TorInsight`) | The normalized summary extraction writes. The public reads these ([data-model.md](overview/data-model.md)) |
| **Version** (`TorInsightVersion`) | A summary as it was before a change replaced it, kept so an admin can roll back (NFR-07, [0031](decisions/0031-keep-the-summary-a-change-replaces.md)) |
| **Change**, **amendment** | A difference GIPDP found in a TOR: announced by the feed (`D2`, source `feed`) or found by comparing files (source `package`) ([0032](decisions/0032-record-what-changed-in-a-tor.md)) |
| **Re-read pending** | A change the summary doesn't reflect yet |
| **Rollback** | An admin putting back an earlier version of a summary |
| **Canonical technology name** | The one name every spelling maps to ("Postgres", "PostgreSQL 14" → PostgreSQL), with the others kept as aliases |

### The pipeline

The pipeline guide explains its own words: package, sweep, title screen,
excluded, score ([Words you'll meet](pipeline-guide.md#words-youll-meet)).
These are the others:

| Term | Meaning |
| :--- | :--- |
| **Ingestion** | The pipeline that finds projects, downloads their files and reads them with OCR. Writes `Tor` |
| **Extraction** | The pipeline that screens titles, decides whether a project is IT, and writes the summary with Gemini. Writes `TorInsight` ([0013](decisions/0013-split-ingestion-and-ai-extraction.md)) |
| **Poll** | One look at the national feed |
| **Job** | A set of steps run together at a set time: `poll`, `sweep` or `process` ([system-overview.md](overview/system-overview.md#a-day-of-the-pipeline)) |
| **Wave** | One part of the night's `process` job. The waves run in the order a day's delay costs most ([0030](decisions/0030-run-the-night-in-priority-waves.md)) |
| **Time box**, `--until` | The time after which a step takes no new work. A job stops 5 minutes before the next one starts |
| **Queue** | One kind of work: `new`, `changed` or `past` |
| **Workable** | Worth the work: Draft or Open, announced by the feed, with no winner |
| **Preview** | OCR on the first 6 pages only, enough to decide whether a scan is IT ([0018](decisions/0018-preview-ocr-before-classify.md)) |
| **IT check** | Gemini classifying a preview as IT or not |
| **Full read** | OCR on the rest of the document, once the preview says IT |
| **Awaiting full text** | Classified as IT from a preview; not extracted yet. Hidden from the public |
| **Recheck** | Asking e-GP whether a draft or open TOR's files changed, without the feed saying so |
| **Past project** | A concluded project, mostly from data.go.th, kept to compare prices with ([0028](decisions/0028-past-projects-from-data-go-th.md)) |
| **Title only** | A past project known only from its title and its data.go.th row. Not compared, not shown |
| **Related project** | A past project chosen to be read in full for a particular open TOR (`Tor.historyRequestedFor`) |
| **Request pacer** | At most one request a second per government site, counted across processes (NFR-03) |
| **Run lock** | One run of each pipeline at a time |
| **Failure** | A step that couldn't finish for one project. Tried 3 times, then left for an admin |

### Analysis

How these fit together: [analysis-overview.md](overview/analysis-overview.md).

| Term | Meaning |
| :--- | :--- |
| **Price check**, **price reality check** | This TOR's ราคากลาง against the median of similar past projects (FR-19) |
| **Similar project**, **comparable project** | A concluded past project close to this TOR in what's being built. Up to 5 per TOR |
| **Category** | One of 7 kinds of IT project, such as `software-development` or `network-and-security`. A TOR has up to 3, main one first ([0034](decisions/0034-a-tor-can-have-several-categories.md)) |
| **System archetype** | What's being built: a web portal, an ERP, a mobile app and so on |
| **Complexity tier** | `basic`, `standard` or `enterprise` |
| **Similarity score** | 0 to 1: archetype 35%, complexity 30%, technologies 20%, categories 15%. Never price |
| **Median** (ค่ามัธยฐาน), **average** | Of the similar projects' prices. The verdict uses the median |
| **Reliability** | `none`, `low` (1 or 2 similar projects) or `sufficient` (3 or more) |
| **Finding** | One lock-spec rule a TOR breaks, with the clause, the rule and the page |
| **Risk score** | Lock-spec's 0 to 100: 35 points a finding. 70 or more is high risk |

### Review and visibility

What these decide: [what-the-public-sees.md](overview/what-the-public-sees.md).

| Term | Meaning |
| :--- | :--- |
| **Confidence score** | 0 to 100, from how well a summary's facts match its documents. Admin-only on screen |
| **Review status** | `pending`, `approved` or `rejected`, set by an admin. Every new summary starts `pending` |
| **Pilot mode** | `SHOW_UNREVIEWED_INSIGHTS`: shows unreviewed summaries and demo data, labelled ([0015](decisions/0015-pilot-mode-and-demo-data.md)) |
| **Demo data** | Made-up summaries from the seed, for building the UI. Marked `origin: 'demo'` |
| **Excluded** | Checked and found not IT. Kept, never shown |

### Accounts

| Term | Meaning |
| :--- | :--- |
| **Capability profile** | What a user can take on: skills, certificates, budget range, company or individual, the kinds of system they build, their largest past contract (FR-12) |
| **Match score** | How well a TOR fits a profile, worked out in the browser (FR-13, [0033](decisions/0033-capability-profile-and-match-scoring.md)) |
| **Watchlist** | TORs a user saved, each with when (`savedAt`), so the page can show what changed since (FR-17) |
| **Role** | `user` or `admin`. Only `npm run role` makes an admin |
