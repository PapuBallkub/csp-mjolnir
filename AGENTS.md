# AGENTS.md — Web Mockup Design Guide

This file guides any AI coding agent (Claude Code, Cursor, etc.) working on **web mockups / UI design** for this project. Read this before generating pages, components, or design tokens. It does not cover backend, scraping, or OCR/LLM pipeline work — mockup work only.

## 1. Project in one paragraph

We are building a web platform that discovers, reads, and normalizes Bangkok Metropolitan Administration (BMA) government IT procurement documents (TORs), which are otherwise scattered across scanned PDFs and dozens of agency sites in dense Thai bureaucratic language. The platform surfaces relevant, plain-language project summaries to small Thai tech companies and freelance developers who currently have no realistic way to find these opportunities — and flags risk signals (price outliers, "lock-spec" bid-tailoring, silent amendments) that a first-time bidder wouldn't otherwise catch. It is a **discovery tool, not a bidding/application assistant** — never design flows that draft, submit, or manage a bid.

Reference doc: `CSP_Proposal.md` in this repo for full user stories (US1–US17) and functional requirements (FR01–FR15).

## 2. Tech stack for mockups

- **Frontend:** Next.js (React) — build mockups as real Next.js pages/components, not static HTML, so they can graduate into the real app.
- **Styling:** Tailwind CSS utility classes.
- **Backend/DB for mockups:** none — use mock/fixture JSON that mirrors the normalized TOR schema (see §5). Do not wire up MongoDB or scrapers for mockup work.
- Keep mockups in a clearly separated route/folder (e.g. `/mockups` or a `design/` branch) until a page is approved, so exploratory work doesn't get mistaken for production code.

## 3. Audience and tone

Three very different audiences will look at the same data — design each surface for who's actually reading it:

| Audience | What they need from the UI | Tone |
|---|---|---|
| SME owners / agency sales | Fast scanning, budget & deadline up front, bid-worthiness signals | Efficient, businesslike |
| Freelance developers | Clear "is this realistically for me" signal (scope size, lock-spec risk) | Plain, reassuring, no jargon |
| Watchdogs / journalists | Historical price data, amendment diffs, evidence trail | Neutral, precise, citable |
| Procurement officers / admins | Confidence scores, scraper health, correction tools | Operational, dense-OK |

Overall design personality: **the opposite of the bureaucratic PDF it replaces.** Where the source documents are dense, scanned, and jargon-heavy, this product should feel legible, fast, and honest. Avoid corporate-SaaS-dashboard blandness on one side and government-form starchiness on the other — this is a tool built *for* the underdog applicant, so it should feel like it's on their side: clear verdicts, not just raw data dumps.

Bilingual reality: source content is Thai; primary users may work in Thai, English, or mixed. Design copy and layouts assuming Thai text will often run alongside English tech terms (e.g. "NGINX Plus," "Windows Server 2019") — don't assume Latin-only strings when setting type scale or truncation rules.

## 4. Core screens to mock up

Derived from the user stories — build these as the primary set, each traced to its FR/US:

1. **TOR catalog / browse** — list view with search + filter by tech stack, budget range, deadline, agency (US1, US6, FR06). Status badge (Draft, Open, Awarded, Closed, or Cancelled — with a separate Amended flag overlaid when revised) visible at a glance (US9, FR09). User can select either search + filter or matchmaker (best fit for the user based on their profile setup).
2. **TOR detail (normalized summary)** — the core "never open the PDF" screen: title, agency, budget, deadline, tech stack, penalty clauses, plus three risk modules surfaced inline, not buried: **Price Reality Check** (US7, FR12), **Lock-spec Risk flag** (US8, FR13), **Amendment history/diff** (US13, FR10). This is the highest-value screen — spend the most design effort here.
3. **Matchmaker / profile setup** — user enters skills + budget range; shows match score and "SME Advantage" eligibility (US3, FR07). Users enter their data on the profile page.
4. **Watchlist** — saved TORs with amendment/status alerts (US10, US11, FR11).
5. **Notification preferences** — consent-based email alerts (US4, FR08).
6. **Auth** — email/password and "Sign in with Google" (US4, US5) — keep minimal, this is a utility screen, not a design showcase.
7. **Watchdog/journalist view** — historical price norms across similar projects, amendment diff viewer, built for scanning evidence, not persuasion (US12, US13).
8. **Admin dashboard** — scraper uptime/failures per source (US15, FR14), OCR/LLM confidence scores with manual correct/reclassify actions (US16, US17, FR15). Design as an operational tool: dense tables, clear failure states, not a marketing surface.

Do not design: bid drafting/submission forms, proposal builders, or e-signing flows — explicitly out of scope.

## 5. Data fields to design around

Every TOR card/detail should be built against this normalized shape (per FR05), not the raw document:

```
Project Title · Agency Name · Maximum Budget (ราคากลาง) · Submission Deadline ·
Required Tech Stack (list) · Penalty Clause (e.g. "0.20%/day delay") ·
Status (Draft / Open / Awarded / Closed / Cancelled, plus a separate Amended flag) · Lock-spec Risk (flag + reason) ·
Price Comparison (vs. historical median) · OCR/LLM Confidence (admin-only)
```

Use realistic mock content drawn from the proposal's own examples (NGINX Plus permission requirements, Windows Server 2019, 0.20% daily delay penalty, ราคากลาง) rather than generic Lorem Ipsum or placeholder SaaS copy — it keeps mockups honest about real content density and Thai/English mixing.

## 6. Design direction

Follow the studio approach in the frontend-design skill (distinctive, non-templated visual identity) with these project-specific anchors:

- **Signature element candidate:** the risk/verdict layer (lock-spec flag, price-outlier flag, amendment diff) is what makes this product different from a plain listing site — consider making that visual treatment the memorable, consistent thread across screens, rather than a generic dashboard chrome.
- **Avoid:** cream-background/serif-display/terracotta-accent template look, and generic "govtech portal" starchiness (heavy blue, gradient banners, stock photos of handshakes).
- **Status and risk states need a real visual system**, not just colored text: the five lifecycle badges (Draft, Open, Awarded, Closed, Cancelled), the Amended overlay flag, and Lock-spec-risk levels should all be instantly scannable in a dense list, since "don't waste time on a dead or unwinnable listing" is the product's core value proposition. Treat *Closed* as visually distinct/muted from the other badges — it's the platform's inferred state (past deadline, no agency update yet), not an agency-confirmed one.
- **Data density:** primary users are scanning many listings quickly (like a job board), so the catalog view should prioritize scan-speed over decorative whitespace; the detail view can afford more breathing room since it's a considered read.
- **Content hierarchy and section boundaries:** dense content must still be visually modular. Related information should read as distinct sections or groups rather than one continuous sheet of text. Use spacing, subtle background changes, borders, containers, or other low-noise treatments to make section boundaries immediately recognizable.
- **Detail-page readability:** the main content column should have stronger hierarchy than the current implementation. Section headings, summaries, requirements, risk findings, quotations, and supporting metadata should be visually differentiated through typography, spacing, indentation, and surface treatment. Avoid relying on thin horizontal rules alone.
- **Risk findings should be modular:** each individual finding should read as a self-contained unit with a clear number/status, title, supporting evidence, and explanation. Users should be able to scan the titles first and inspect details second.
- **Contrast surfaces intentionally:** use subtle surface/color differences to group content without turning every section into a heavy card. Prefer restrained neutral variations and selective emphasis rather than excessive boxes.
- **Spacing should communicate structure:** use tighter spacing within a logical group and noticeably larger spacing between groups. Avoid uniform vertical spacing that makes every element appear equally related.
- **Preserve density without compression:** improve readability through hierarchy and grouping before increasing whitespace globally. The goal is a compact interface with obvious structure, not a sparse dashboard.
- Mobile-responsive: SME owners and freelancers plausibly check this on the go — don't design desktop-only.
- When an existing implementation conflicts with these design principles,
  treat these principles as the intended target and refactor the existing UI
  rather than preserving its current spacing or component structure.

## 7. Copy guidelines

- Plain language over bureaucratic register — this product's entire value is un-burying meaning from ภาษาราชการ, so mockup copy should model that: state the verdict, then the evidence (e.g. "High lock-spec risk — requires 10 years' experience with a system that's existed for 3" beats "Qualification Anomaly Detected").
- Active voice, name things by what the user recognizes ("Save to watchlist," not "Bookmark entity").
- Empty/error states should say what happened and what to do next, in-product voice, not generic "No results found."

## 8. Working notes

- This is a student capstone project (Kasetsart University, Software Engineering, course 01219346). Team: Amornrit Sirikham, Sivapon Channual, Pannawit Mahacharoensiri.
- Timeline context: UI/UX design sits in Phase 1 (Weeks 0–2) and mockups feed the Week 7–9 build phase — keep mockups fast to iterate on rather than pixel-perfect until direction is agreed.