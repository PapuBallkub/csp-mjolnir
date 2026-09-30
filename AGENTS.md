# AGENTS.md — Frontend Design Guide

This file guides any AI coding agent (Claude Code, Cursor, etc.) working on **frontend UI design** for this project. Read this before generating pages, components, or design tokens. It does not cover backend, ingestion, or OCR/LLM pipeline work — frontend work only.

## 1. Project in one paragraph

We are building **GIPDP — the Government IT Procurement Discovery Platform**: a web platform that collects Thai government software/IT procurement notices, reads the TOR documents behind them, and normalizes them into plain-language summaries. The source documents are otherwise scattered across e-GP and agency sites as scanned PDFs in dense Thai bureaucratic language. The platform surfaces relevant opportunities to small Thai tech companies and freelance developers who currently have no realistic way to find them. It also flags risk signals that a first-time bidder wouldn't otherwise catch: price outliers, "lock-spec" bid-tailoring, and silent amendments. Coverage is any Thai government agency's IT procurement, not only Bangkok. It works alongside the official systems and never replaces them. It is a **discovery tool, not a bidding/application assistant**: never design flows that draft, submit, or manage a bid, and never flows that offer legal advice.

**Requirements:** [`docs/requirements.md`](docs/requirements.md) is the public summary of the team's SRS (v0.3). It covers scope, user classes, interfaces, and every requirement by ID (`FR-01`–`FR-23`, `NFR-01`–`NFR-17`). Cite those IDs in new code and docs. Older code cites the proposal's numbering (`FR07`, `US11`), which does **not** line up with the SRS; translate it with the crosswalk at the bottom of that file.

**Local context:** if `context/` exists in your checkout, it holds the full SRS and working notes. It is gitignored on purpose. Read it for ground truth, but never copy its text into committed files, link to it, or stage it.

"Mjölnir" was the proposal's working name. It still appears in the shell and in a few identifiers (`mjolnir-theme`, `mjolnir_test`).

## 2. Tech stack

- **Frontend:** Next.js (React). Pages live under `client/app/(app)/` (shell-wrapped routes), with `client/app/(app)/(private)/` for signed-in-only routes, and `client/app/` for standalone pages (auth, the introduction page).
- **Styling:** Tailwind CSS utility classes.
- **Shared components:** `client/app/_components/`: shared UI, verdict badges, shell, and preference toggles.
- **API client:** `client/app/_lib/api.ts`. Auth and the admin dashboard already run against the real API.
- **Fixture data:** `client/app/_data/`: typed fixtures mirroring the normalized TOR schema (see §5). TOR screens still read from here until their endpoints land. Replace fixtures endpoint by endpoint rather than in one sweep. Don't grow a fixture field the pipeline won't produce.

## 3. Audience and tone

The SRS defines three **access classes**, and the design has to respect them:

- **Anyone, signed out:** the catalog, every TOR detail page, and the historical/price analysis. These must be fully useful without an account. Never gate reading behind sign-in.
- **Signed in:** adds a capability profile, match scores and recommendations, a watchlist, and alerts. Where a signed-out user meets one of these, say what signing in adds instead of showing a dead end.
- **Admin:** team members only, with operational tools. There is no self-service path to admin, so don't design one.

Within the public and signed-in classes, very different people read the same data, so design each surface for who's actually reading it:

| Audience | What they need from the UI | Tone |
|---|---|---|
| SME owners / agency sales | Fast scanning, budget & deadline up front, bid-worthiness signals | Efficient, businesslike |
| Freelance developers | Clear "is this realistically for me" signal (job size, lock-spec risk) | Plain, reassuring, no jargon |
| Watchdogs / journalists | Historical price data, amendment diffs, evidence trail | Neutral, precise, citable |
| Platform admins | Feed health, confidence scores, review queue, correction tools | Operational, dense-OK |

Users range widely in technical proficiency, and every one of them must be able to check what they see against the original government document.

Overall design personality: **the opposite of the bureaucratic PDF it replaces.** Where the source documents are dense, scanned, and jargon-heavy, this product should feel legible, fast, and honest. Avoid corporate-SaaS-dashboard blandness on one side and government-form starchiness on the other. This is a tool built *for* the underdog applicant, so it should feel like it's on their side: clear verdicts, not just raw data dumps.

**Thai first (NFR-15).** Thai is the primary locale for the whole interface, including navigation, labels, notifications, and AI summaries, not just document content. English is a complete secondary locale behind the language toggle. The current shell keeps its navigation in English; treat that as a gap to close, not a pattern to copy. Thai text will often run alongside English tech terms (e.g. "NGINX Plus," "Windows Server 2019"), so set type scale, line height, and truncation rules for Thai script with Latin mixed in, never for Latin-only strings.

## 4. Core screens

These map to the interfaces the SRS names (see the route table in `docs/requirements.md`). Each is traced to its requirement.

1. **Introduction page** (`/`): what the platform is, who it's for, and a direct way into the catalog without signing in. It carries the third-party disclaimer (§6).
2. **TOR catalog / search** (`/search`): list view with search and filters by tech stack, budget range, submission deadline, and agency (FR-10, FR-11). The status badge is visible at a glance (FR-15). Signed-in users can switch between search + filter and a **match** view ranked by their profile (FR-13); signed-out users see that option explained, not hidden. Must work on a phone (NFR-13).
3. **TOR detail** (`/tor/[id]`): the core "never open the PDF" screen (FR-10). It covers title, agency, budget, deadline, tech stack, and penalty clauses, plus the risk modules surfaced inline, not buried: **Price Reality Check** (FR-19), **Lock-spec Risk** (FR-20, FR-21), and **Amendment history/diff** (FR-16). For signed-in users it adds **Profile Match** (FR-13). The information architecture is specified in [`docs/features/tor-detail-page.md`](docs/features/tor-detail-page.md). This is the highest-value screen, so spend the most design effort here.
4. **Profile & matchmaker** (`/profile`): the user saves technical skills, budget capacity, and preferred job size (FR-12); these drive the match score (FR-13). Must work on a phone (NFR-13). *SME Advantage* eligibility, which the current UI shows, is not in the SRS, so don't design new surfaces around it.
5. **Watchlist** (`/watchlist`): saved TORs, with what changed since the user saved them (FR-17, FR-18).
6. **Notifications** (`/notifications`): in-app alerts for watchlisted TORs that changed status or were amended (FR-18), plus email preferences. Email for matches (FR-14) and for watchlist changes needs explicit consent: off by default, easy to withdraw (PDPA).
7. **Auth** (`/auth`): email/password and "Sign in with Google" (FR-08, FR-09). Keep it minimal; this is a utility screen, not a design showcase.
8. **Historical procurement dashboard & analysis** (`/watchdog`): historical median and average prices for similar past projects (FR-19) and the amendment diff viewer (FR-16). It is public. Build it for scanning evidence, not persuasion.
9. **Admin** (`/admin`): the administration dashboard shows ingestion uptime, polling health, and feed request failures per source (FR-22). The data management side, not yet built, covers:
   - a **review queue** for extractions under 80% confidence, which stay hidden from the public until an admin clears them (NFR-17)
   - editing extracted fields and reclassifying misclassified TORs (FR-23)
   - rolling a TOR back to a previous version when an amendment was processed wrongly (NFR-07)

   Design it as an operational tool: dense tables, clear failure states, not a marketing surface.

Do not design: bid drafting/submission forms, proposal builders, e-signing flows, or anything that reads as legal advice. All of these are explicitly out of scope.

## 5. Data fields to design around

Every TOR card/detail should be built against the normalized shape, not the raw document. The core fields are the ones the LLM extracts (FR-07) plus what the platform derives:

```
Project Title · Agency Name · Budget (งบประมาณ) · Reference Price (ราคากลาง) · Submission Deadline ·
Required Tech Stack (list) · Penalty Clause (e.g. "0.20%/day delay") ·
Status (Draft / Open / Awarded / Closed / Cancelled, plus a separate Amended flag) ·
Lock-spec Risk (flag + reasons) · Price Comparison (vs. historical median and average) ·
Source (original document, portal, e-GP reference) · OCR/LLM Confidence (admin-only)
```

The detail page carries more than this (deliverables, eligibility, contract conditions, and so on). The full set is defined in decision [0010](docs/decisions/0010-normalized-tor-detail-Information.md) and laid out in `docs/features/tor-detail-page.md`.

**Status** comes from the e-GP feed where the feed says it (FR-02, FR-15):

| Badge | Source |
|---|---|
| Draft | e-GP code `B0`: draft TOR out for public hearing |
| Open | e-GP code `D0`: invitation to bid |
| Awarded / Cancelled | e-GP, when the agency reports it |
| Closed | **Inferred** by the platform: past the deadline with no update from the agency |
| *Amended* (flag) | e-GP codes `D1`/`D2`. Overlaid on whichever status applies, because a TOR can be amended repeatedly while it stays Open. |

The server model already enforces these five statuses plus `isAmended`. The client fixture still uses a three-value status, so bring it up to the server's shape rather than the reverse.

**Confidence never reaches public UI.** Anything under 80% is withheld (NFR-17), so public screens can assume every TOR they show has passed review. Confidence scores are admin-only.

Use realistic content (NGINX Plus permission requirements, Windows Server 2019, the 0.20% daily delay penalty, ราคากลาง) rather than Lorem Ipsum or placeholder SaaS copy. Real content keeps layouts honest about density and Thai/English mixing.

## 6. Design direction

Follow the studio approach in the frontend-design skill (distinctive, non-templated visual identity) with these project-specific anchors:

- **Signature element candidate:** the risk/verdict layer (lock-spec flag, price-outlier flag, amendment diff) is what makes this product different from a plain listing site. Consider making that visual treatment the memorable, consistent thread across screens, rather than a generic dashboard chrome.
- **Source vs. analysis:** what the TOR states (budget, requirements, deadlines) and what GIPDP concludes (match, lock-spec, price verdicts) must look different. Never present an analytical result as though the agency said it.
- **Traceable to the original:** important extracted facts link back to their place in the source document (page and section where available), and every TOR offers the original document and its e-GP listing. The original stays the authority.
- **Missing is not invented:** when the TOR doesn't state something, say "Not specified in the TOR" or omit the section. Never show a plausible default.
- **Avoid:** cream-background/serif-display/terracotta-accent template look, and generic "govtech portal" starchiness (heavy blue, gradient banners, stock photos of handshakes).
- **Status and risk states need a real visual system**, not just colored text. The five lifecycle badges (Draft, Open, Awarded, Closed, Cancelled), the Amended overlay flag, and the lock-spec risk levels should all be instantly scannable in a dense list, since "don't waste time on a dead or unwinnable listing" is the product's core value proposition. Don't rely on color alone. Treat *Closed* as visually distinct and muted from the other badges: it's the platform's inferred state (past deadline, no agency update yet), not an agency-confirmed one.
- **Data density:** primary users are scanning many listings quickly (like a job board), so the catalog view should prioritize scan-speed over decorative whitespace. The detail view can afford more breathing room since it's a considered read.
- **Content hierarchy and section boundaries:** dense content must still be visually modular. Related information should read as distinct sections or groups rather than one continuous sheet of text. Use spacing, subtle background changes, borders, containers, or other low-noise treatments to make section boundaries immediately recognizable.
- **Detail-page readability:** the main content column should have stronger hierarchy than the current implementation. Section headings, summaries, requirements, risk findings, quotations, and supporting metadata should be visually differentiated through typography, spacing, indentation, and surface treatment. Avoid relying on thin horizontal rules alone.
- **Risk findings should be modular:** each individual finding should read as a self-contained unit with a clear number/status, title, supporting evidence, and explanation. Users should be able to scan the titles first and inspect details second.
- **Contrast surfaces intentionally:** use subtle surface/color differences to group content without turning every section into a heavy card. Prefer restrained neutral variations and selective emphasis rather than excessive boxes.
- **Spacing should communicate structure:** use tighter spacing within a logical group and noticeably larger spacing between groups. Avoid uniform vertical spacing that makes every element appear equally related.
- **Preserve density without compression:** improve readability through hierarchy and grouping before increasing whitespace globally. The goal is a compact interface with obvious structure, not a sparse dashboard.
- **Disclaimer:** the site must prominently state that it is a third-party discovery tool and that all official bidding happens on e-GP. Put it in the site-wide footer, and beside the "open on e-GP" action on the detail page. Make it plain and visible but not alarming; it's a fact, not a warning.
- **Mobile is a requirement (NFR-13):** the catalog and the matchmaker must be fully usable on a phone, and no screen should be desktop-only.
- **Fast by default (NFR-01):** pages load in under 2 seconds. No decorative imagery or heavy hero media. Subset web fonts, Thai included. Prefer skeletons shaped like the real content over spinners.
- When an existing implementation conflicts with these design principles, treat these principles as the intended target and refactor the existing UI rather than preserving its current spacing or component structure.

## 7. Copy guidelines

- Plain language over bureaucratic register. This product's entire value is un-burying meaning from ภาษาราชการ, so the copy should model that: state the verdict, then the evidence. For example, "High lock-spec risk — requires 10 years' experience with a system that's existed for 3" beats "Qualification Anomaly Detected". Write the Thai the way people speak it, not in the register of the source document.
- Describe, don't accuse. A flag says what is unusual and shows the comparison. It never claims intent: no "rigged", "corrupt", or "favors vendor X". The platform shows evidence; it doesn't draw legal or investigative conclusions.
- Active voice, name things by what the user recognizes ("Save to watchlist," not "Bookmark entity").
- Empty and error states say what happened and what to do next, in the product's own voice, not a generic "No results found." That includes a source feed being down: say the data may be stale and since when, never show blank data.

## 8. Working notes

- This is a student capstone project (Kasetsart University, Software Engineering, course 01219346). Team: Amornrit Sirikham, Sivapon Channual, Pannawit Mahacharoensiri.
- The SRS (v0.3) is the ground truth for what the product does. `docs/requirements.md` mirrors it publicly, and this file covers how it should look and read.
- The mockup is graduating to production. Design at production fidelity: real loading, empty, and error states; keyboard and screen-reader access; both themes; and data paths that will survive the switch from fixtures to the API.
