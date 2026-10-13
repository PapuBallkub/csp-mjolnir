# Requirements

What GIPDP has to do, condensed from the team's Software Requirements
Specification (SRS v0.3, 30 Sep 2026). The full SRS is kept out of this
repository on purpose; this file is the public stand-in, detailed enough to
build against and to cite from code. **Where the two disagree, the SRS wins** —
ask the team, then fix this file.

Requirement IDs match the SRS exactly (`FR-07`, `NFR-17`, …), so a citation in
code means the same thing here and there. IDs from the earlier proposal
(`FR07`, `US11`) are a different numbering — see
[IDs from the proposal](#ids-from-the-proposal) before reading one.

## The product

The **Government IT Procurement Discovery Platform (GIPDP)** collects Thai
government software/IT procurement notices, reads the TOR documents behind them
— often scanned, dense Thai PDFs — and presents each one as a normalized,
plain-language summary, alongside price and qualification context a first-time
bidder would not otherwise have.

It works *alongside* the official procurement systems and never replaces them.
It is a **discovery tool, not a bidding assistant**: it does not draft, prepare
or submit bids, and it does not give legal advice.

Why it needs to exist:

- **Fragmented sources.** Opportunities are spread across the national e-GP
  system and many agency sites, each with its own layout and schedule.
- **Unreadable documents.** A TOR is typically a 30–50 page scanned PDF; the
  tech stack, reference price (ราคากลาง) and penalty clause are buried in it.
- **Silent amendments.** Agencies revise TORs without a clear changelog, and
  listings go stale after a project closes or is awarded.
- **Lock-spec.** Some requirements are written so narrowly that only one vendor
  can meet them, which shuts out SMEs and freelancers.
- **No price reference.** A newcomer has no way to tell whether a stated budget
  is reasonable for the scope.

## Scope

| In scope | Out of scope |
| :--- | :--- |
| Software/IT TORs from Thai government agencies — development, systems integration, digital services | Non-IT procurement (construction, hardware-only, civil works) unless an IT component is explicitly in scope |
| Discovery, reading, normalization, price benchmarking, lock-spec flagging, amendment tracking and notification | Drafting, preparing or submitting bids, or any procurement action on a user's behalf |
| Data from public government sources: e-GP RSS and data.go.th | Legal advice on qualification disputes or procurement law |
| A maintained mapping of government departments to their procurement data identifiers | TORs from outside Thailand |

The proposal limited coverage to Bangkok (BMA). The SRS does not: any Thai
agency's IT procurement is in scope.

## Users and access

| Class | Can do |
| :--- | :--- |
| **Unauthenticated** | Search the catalog, read any TOR's normalized detail, explore historical prices and analyses |
| **Authenticated** | Everything above, plus a capability profile, personalized match scores and recommendations, a watchlist, and alerts |
| **Admin** | Monitor ingestion and AI processing, review low-confidence extractions, correct or reclassify TORs |

The people behind those classes: **SME owners and sales staff** and
**freelance developers** looking for work they can win, and **watchdogs and
journalists** examining pricing and amendments. Watchdogs are not a separate
role — they use the same public views, and `NFR-10` groups them with applicants
as standard users. Admins are team members; the role is never self-service.

Users vary widely in technical skill and must always be able to check what
they see against the original government document.

## Interfaces

What the SRS says each class gets, and where it lives today.

| Interface | Class | Route |
| :--- | :--- | :--- |
| Introduction page | public | `/` |
| Procurement discovery (catalog, search, filter) | public | `/search` |
| Procurement detail | public | `/tor/[id]` |
| Historical procurement dashboard | public | `/watchdog` |
| Procurement analysis | public | `/watchdog`, and the risk modules on `/tor/[id]` |
| Authentication | public | `/auth` |
| Profile and preferences | authenticated | `/profile` |
| Saved opportunities | authenticated | `/watchlist` |
| Notifications | authenticated | `/notifications` |
| Administration dashboard | admin | `/admin` |
| Data management (edit, reclassify, review, roll back) | admin | `/admin` — not yet built |

## External systems

| System | Used for |
| :--- | :--- |
| **e-GP RSS** | Live announcements, polled as XML |
| **data.go.th** | Historical contracts (`CGDContract`) and agency codes (`EGPDepartment`), fetched in batches |
| **Vertex AI** | OCR and LLM extraction, classification and summarization (Gemini models) |
| **Google OAuth 2.0** | Sign-in |
| **MongoDB Atlas** | TORs, extracted metadata, user accounts and profiles |

The stack is Next.js on the front, Node.js with Express on the back.

## Functional requirements

### Ingestion — 4.1

- **FR-01** Poll the e-GP RSS feed for new TOR announcements automatically.
- **FR-02** Parse the announcement codes that matter: draft TOR (`B0`),
  invitation to bid (`D0`), amendment (`D1`/`D2`), reference price (`15`).
  *Correction pending in the SRS:* e-GP defines `D1` as a cancelled
  invitation and `D2` as a changed one, and adds the winner codes
  `W0`/`W1`/`W2`. The system follows e-GP's definitions
  ([0017](decisions/0017-read-the-egp-feed-as-egp-defines-it.md)).
- **FR-03** Batch-fetch historical procurement data and agency codes from
  data.go.th.
- **FR-04** Normalize everything ingested — XML, JSON, PDF — into one internal
  schema.

### AI processing — 4.2

- **FR-05** OCR downloaded PDFs and images, tuned for Thai.
- **FR-06** Classify documents and keep only software/IT projects.
- **FR-07** Extract structured fields with an LLM: project title, agency,
  maximum budget, submission deadline, required tech stack, penalty clauses.

### Accounts — 4.3

- **FR-08** Sign up with email and password.
- **FR-09** Sign in with Google.

### Search and discovery — 4.4

- **FR-10** A catalog that shows each TOR's normalized details, so a user can
  evaluate it without opening the PDF.
- **FR-11** Search and filter by tech stack, budget range, submission deadline
  and agency.

### Matchmaker — 4.5

- **FR-12** Users save their technical skills, budget capacity and preferred
  job size to their profile.
- **FR-13** Score each newly posted TOR against a user's profile.
- **FR-14** Email highly matched TORs to users who consented.

### Amendments and status — 4.6

- **FR-15** Track and show each TOR's current status as the e-GP feeds report
  it (e.g. open, amended, closed/awarded).
- **FR-16** Hash each TOR file; when an amendment arrives, diff it and
  summarize exactly which clauses changed.
- **FR-17** Users save TORs to a personal watchlist.
- **FR-18** Alert users, in-app or by email, when a watchlisted TOR changes
  status or is amended.

### Price and lock-spec — 4.7

- **FR-19** Show the historical median and average price of similar past IT
  projects, from data.go.th.
- **FR-20** Compare a TOR's technical and qualification requirements against
  normalized historical baselines.
- **FR-21** Visibly flag "high lock-spec risk" on TORs with statistically
  unusual or hyper-specific requirements.

### Admin — 4.8

- **FR-22** A dashboard of ingestion uptime, polling health and feed request
  failures.
- **FR-23** Admins can edit extracted data and reclassify misclassified TORs.

## Non-functional requirements

One sequence, `NFR-01`–`NFR-17`, grouped the way the SRS groups them.

### Performance — 5.1

- **NFR-01** User-facing pages load in under 2 seconds at normal load.
- **NFR-02** A 50-page PDF is fully processed within 5 minutes of download.
- **NFR-03** At most 1 request per second to e-GP and data.go.th.
- **NFR-04** At least 500 concurrent sessions without degradation.

### Safety — 5.2

- **NFR-05** Daily encrypted database backups.
- **NFR-06** A source outage never corrupts or deletes existing records.
- **NFR-07** A TOR can be rolled back to a previous version if an amendment
  was processed wrongly.

### Security — 5.3

- **NFR-08** TLS 1.2+ for all traffic.
- **NFR-09** Passwords hashed and salted.
- **NFR-10** Role-based access: standard users and admins are strictly
  separated.
- **NFR-11** Sessions are JWTs that expire within 24 hours.

### Quality — 5.4

- **NFR-12** 99.9% uptime for the web app, excluding planned maintenance.
- **NFR-13** Fully responsive; the catalog and matchmaker in particular must
  work on mobile.
- **NFR-14** The AI pipeline is separate from the web backend, so each can be
  updated and scaled alone.
- **NFR-15** Thai is the primary locale — UI, notifications and AI summaries.

### Business rules — 5.5

- **NFR-16** Anything not categorized as IT/software is discarded at ingestion.
- **NFR-17** A summary whose OCR/LLM confidence is below **80%** is hidden from
  the public and queued for admin review.

### Legal

- **PDPA** Account data (emails, tokens, profiles) is handled under Thailand's
  Personal Data Protection Act.
- **Disclaimer** The site prominently states that it is a third-party discovery
  tool and that all official bidding happens on e-GP.

## Assumptions

- Users treat the platform as discovery only and check the original TOR before
  acting; they report their own skills and budget honestly.
- Watchdog users can interpret diffs and price flags themselves — the platform
  shows evidence and does not draw legal or investigative conclusions.
- Thai OCR and LLM extraction are good enough for an MVP but not perfect; the
  admin tools exist to catch what they miss.
- The e-GP and data.go.th endpoints stay publicly reachable without credentials.

## Glossary

| Term | Meaning |
| :--- | :--- |
| **e-GP** | Electronic Government Procurement — the Comptroller General's Department's official procurement system |
| **TOR** | Terms of Reference (ร่างขอบเขตของงาน) — the document defining a project's scope, requirements and conditions |
| **Reference price** | ราคากลาง — the official benchmark price set for a procurement, used to evaluate bids |
| **Lock-spec** | Bid tailoring: requirements written so narrowly they favour one pre-selected vendor |
| **SME** | Small and medium-sized enterprise |
| **PDPA** | Thailand's Personal Data Protection Act |

## IDs from the proposal

The code and the decision records written before the SRS cite the proposal's
numbering — `FR01`–`FR15` and user stories `US1`–`US17`. **Those numbers do
not line up with the SRS**: the proposal's `FR07` is match scoring, while the
SRS's `FR-07` is field extraction. Translate before looking one up.

| Proposal | SRS | About |
| :--- | :--- | :--- |
| FR01 | FR-01, FR-03 | Ingestion — scrapers became RSS and API polling |
| FR02 | FR-04 | One normalized schema |
| FR03 | FR-05 | Thai OCR |
| FR04 | FR-06, NFR-16 | IT-only classification — the Bangkok filter is gone |
| FR05 | FR-07 | Field extraction |
| FR06 | FR-11 | Search and filter |
| FR07 | FR-12, FR-13 | Profile and match score |
| FR08 | FR-14, FR-18 | Consent-based email |
| FR09 | FR-15 | Lifecycle status |
| FR10 | FR-16 | Hash and diff |
| FR11 | FR-17, FR-18 | Watchlist and alerts |
| FR12 | FR-19 | Historical price |
| FR13 | FR-20, FR-21 | Lock-spec flag |
| FR14 | FR-22 | Ingestion health dashboard |
| FR15 | FR-23, NFR-17 | Confidence review, correction, reclassification |

| Story | SRS | About |
| :--- | :--- | :--- |
| US1, US2 | FR-10 | Catalog and normalized detail |
| US3 | FR-13, FR-14 | Match notifications |
| US4 | FR-08 | Email and password |
| US5 | FR-09 | Google sign-in |
| US6 | FR-11 | Search and filter |
| US7, US12 | FR-19 | Price history |
| US8 | FR-20, FR-21 | Lock-spec flag |
| US9 | FR-15 | Status |
| US10 | FR-17, FR-18 | Watchlist alerts |
| US11 | FR-12 | Small-job preference — now a profile field, not a catalog filter |
| US13 | FR-16 | Amendment diff |
| US14 | — | Procurement officers are no longer a user class |
| US15 | FR-22 | Ingestion health |
| US16 | NFR-17, FR-23 | Confidence review |
| US17 | FR-23 | Reclassification |

Also dropped from the proposal: **SME Advantage** eligibility, which the SRS
never mentions.
