---

**Project Proposal**

for

**Mjölnir**  
**AI-powered TOR discovery platform within Bangkok**   
version 1.1

 Prepared by       Amornrit SIRIKHAM                   

Sivapon CHANNUAL

Pannawit MAHACHAROENSIRI

Department of Software Engineering, Kasetsart University

# **Table of Content** {#table-of-content}

[**Table of Content	1**](#table-of-content)

[**Introduction	2**](#introduction)

[**Client Problem / Challenge	3**](#client-problem-/-challenge)

[Stakeholder	4](#stakeholder)

[User Stories	5](#user-stories)

[**Project Scope & Boundaries	7**](#project-scope-&-boundaries)

[**Our Solution	8**](#our-solution)

[Tech stack	8](#tech-stack)

[Core Capabilities	8](#core-capabilities)

[**Project UI Mockups	9**](#project-ui-mockups)

[Functional Requirements	10](#functional-requirements)

[**Timeline & Roadmap	12**](#timeline-&-roadmap)

[**Cost Breakdown	12**](#cost-breakdown)

[**Team & Roles	14**](#team-&-roles)

# 

# 

# 

# 

# 

# 

# 

# 

# 

#  

# **Introduction** {#introduction}

Government procurement in Thailand is heavily tilted toward large corporations, not by design, but through information asymmetry. While the Bangkok Metropolitan Administration (BMA) and the Comptroller General's Department (กรมบัญชีกลาง) publish Terms of Reference (ร่างขอบเขตของงาน หรือ TOR) publicly online via the e-GP (Electronic Government Procurement) system and the BMA Open Contract platform, this data is notoriously difficult to navigate. Documents are buried in scanned PDFs, scattered across departmental sites (example. สำนักยุทธศาสตร์และประเมินผล or สำนักการระบายน้ำ), and obscured by dense Thai bureaucratic legalese (ภาษาราชการ).

This creates a **visibility problem**, not just an access problem: many Small and Medium Enterprises (SMEs) and freelance developers are technically capable of delivering these projects, but they never learn a matching opportunity exists in time to bid, simply because they lack the dedicated administrative staff that large incumbent vendors use to monitor dozens of procurement boards daily. The result is that qualified new entrants are filtered out before they even see the opportunity, not because they can't compete, but because they can't find the project.

This proposal outlines the development of an AI-powered procurement **discovery and visibility platform**. By automating the discovery, reading, normalization, and matching of government TORs, we will surface relevant public-sector IT contracts to small Thai tech companies and independent developers who currently have no realistic way of finding them.

# 

# 

# 

# 

# 

# 

# 

# **Client Problem / Challenge** {#client-problem-/-challenge}

SMEs and freelance developers face critical barriers when attempting to discover and evaluate BMA and e-GP software projects:

* **The Information Fragmentation Problem (Primary):** Finding TORs requires manually checking the central e-GP board, BMA's eGP BMA2 system, and dozens of individual district and department websites, each with its own layout and posting schedule.  
* **The Limited Visibility Problem:** As a direct consequence of the scattered problem, highly skilled and capable SMEs and freelancers routinely miss projects they are qualified for not due to lack of ability, but because no single place surfaces "software-related TORs that match what I can do."  
* **The Lengthy Document Problem:** Thai government TORs are typically 30–50 page scanned PDFs. A user must read the entire document just to find the hidden tech stack (e.g., "Must have permission to use NGINX Plus" or "Must have Windows Server 2019"), the Reference Price (ราคากลาง), or the standard 0.20% daily delay penalty (ค่าปรับร้อยละ 0.20 ต่อวัน).  
* **The Silent Amendment / The Outdated Information Problem Problem:** Government agencies frequently update or amend TORs (ประกาศร่าง TOR ครั้งที่ 2\) without clear changelogs, or the listing itself becomes stale after the project is closed or awarded. Applicants often spend hours reading a full document and contacting the agency, only to learn afterward that the requirements changed or the project was no longer open time that could have been spent on a live opportunity.  
* **The Unrealistic Requirements (Lock-spec) Problem:** It is a well-known issue in Thai government procurement that some agencies set highly unrealistic or hyper-specific technical requirements. This practice, known as "lock-spec" (bid tailoring), is often intentionally designed to favor a pre-selected incumbent vendor and block new faces or SMEs from successfully bidding. Even when corruption isn't the root cause, massive scopes tied to tiny budgets act as an impenetrable barrier to entry for smaller agencies.  
* **The Budget–Scope Mismatch Problem:** Applicants especially freelancers and smaller SMEs without procurement experience have no easy reference point for whether a project's stated Reference Price (ราคากลาง) is reasonable for the scope of work described, making it hard to judge whether a project is worth pursuing at all.  
* **The Format Inconsistency Problem (Engineering Challenge):** TORs are published in inconsistent formats across sources scanned PDF, image, HTML page, or occasionally structured JSON from the e-GP API. Simply linking out to the original file is a poor experience for applicants and would require a developer to manually read and re-summarize every single posting, which does not scale as the number of tracked agencies grows. This is the core reason an AI reading/normalization pipeline, rather than manual curation, is central to the solution.

## **Stakeholder** {#stakeholder}

| Stakeholder | Role / Relationship | Primary Goals & Motivations | Core Pain Points |
| :---- | :---- | :---- | :---- |
| **SME Owners & Agency Sales** | Primary Users | Find profitable BMA IT projects quickly; win bids to grow revenue. | Wasting time reading 50-page PDFs; missing silent TOR changes; "lock-spec" barriers; low visibility into matching opportunities. |
| **Freelance Developers** | Primary Users | Find small-scale or subcontracting government tech jobs suited to an individual. | Government requirements feel too massive; unsure if budgets are realistic; hard to tell which postings are actually within reach. |
| **BMA / Gov Procurement Officers** | Indirect Stakeholders | Get competitive, high-quality bids for their department's IT projects. | Lack of bids from modern tech companies; stuck with legacy enterprise vendors. |
| **Gov Watchdogs & Journalists** | Secondary Users | Monitor government spending for corruption or inefficiency. | Hard to track historical price norms; difficult to prove when a TOR was altered to favor a vendor. |
| **Platform Admin** | Internal / System Maintainer | Maintain high platform uptime; ensure AI/OCR accurately parses Thai text. | e-GP/BMA portal layout changes breaking scrapers; degraded PDF scans lowering OCR confidence; misclassified documents. |

## **User Stories** {#user-stories}

**Primary Users (Applicants) : SME Owners & Freelance Developers**

**US1.** As an applicant, I want to see the list of available TORs, so that I know which projects are available.

**US2.** As an applicant, I want to see the normalized details of a TOR, so that I can decide what project I can do without opening the original PDF.

**US3.** As an applicant, I want to get a notification suggesting projects that I qualify for, so that I don't miss my job opportunity.

**US4.** As an applicant, I want to create an account using email and password, so that I can be notified.

**US5.** As an applicant, I want to sign in using my Google account, so that I can access the app quickly without remembering another password.

**US6.** As an applicant, I want to search and filter TORs by tech stack, budget range, and deadline, so that I can quickly narrow down projects relevant to me.

**US7.** As an applicant, I want to see the price of similar past and present projects, so that I can decide if this project's budget is fair.

**US8.** As an applicant, I want a flagged note on unusual, overly restrictive, or hyper-specific qualification requirements, so that I can quickly recognize likely "lock-spec" projects and avoid wasting time preparing a bid I have little realistic chance of winning.

**US9.** As an applicant, I want to see the current status of a TOR (e.g., Draft/Public Hearing, Open, Awarded, Closed, or Cancelled — with an Amended flag if it's been revised), so that I don't waste time reading or contacting an agency about a project that is no longer active.

**US10.** As an applicant, I want to save or bookmark TORs I'm interested in, so that I automatically get alerted if they are amended.

**US11.** As a freelance developer, I want to filter for small-scale or subcontracting-sized projects, so that I only see postings realistically suited to an individual rather than a firm.

**Secondary Users : Gov Watchdogs & Journalists**

**US12.** As a watchdog/journalist, I want to view historical price norms across similar past projects, so that I can identify pricing anomalies and investigate potential overpricing.

**US13.** As a watchdog/journalist, I want to view the amendment history and diff of a TOR, so that I can determine when and how it was altered and flag potential favoritism toward a specific vendor.

**Indirect Stakeholders : BMA / Gov Procurement Officers**

**US14.** As a procurement officer, I want our published TORs to be accurately represented on the platform, so that our department attracts a wider and more competitive pool of qualified bidders.

**System Maintainer : Platform Admin**

**US15.** As a platform admin, I want a dashboard showing scraper uptime and failures per source, so that I can quickly detect and fix broken scrapers when a portal layout changes.

**US16**. As a platform admin, I want to see OCR/LLM extraction confidence scores per document, so that I can review and correct low-confidence extractions before they reach applicants.

**US17.** As a platform admin, I want to manually reclassify documents the AI misclassified (e.g., non-IT projects marked as IT), so that the dataset stays clean and trustworthy.

# 

# **Project Scope & Boundaries** {#project-scope-&-boundaries}

To keep the project achievable within the timeline and clear for stakeholders, the platform's scope is deliberately bounded:

**In scope**

* TORs that are **software / IT-related** projects only (development, systems integration, digital services, etc.).  
* TORs published **within Bangkok**, under the jurisdiction of the Bangkok Metropolitan Administration (BMA) during Governor Chadchart Sittipunt's administration.  
* Discovery, reading, normalization, price benchmarking, lock-spec flagging, amendment tracking, and notification of these TORs.

**Out of scope**

* The platform does **not** assist with the actual bidding or application process; it does not draft, prepare, or submit e-bidding proposals on behalf of a user.  
* The platform does **not** provide legal advice regarding qualification disputes or procurement law.  
* The platform does **not** cover procurement categories outside software/IT (e.g., pure construction, hardware-only, or civil works TORs), unless a software/IT component is explicitly part of the scope of work.  
* The platform does **not** cover TORs from provinces or national agencies outside BMA jurisdiction.

In short: this software exists solely to improve **visibility and accessibility** of relevant TORs for applicants; it is a discovery tool, not an application/bidding assistant.

# 

# **Our Solution** {#our-solution}

We propose building a web-based, AI-driven aggregation and matching platform tailored specifically for Bangkok software and IT procurement.

## **Tech stack** {#tech-stack}

* **Frontend :** NextJS  
* **Backend :**  NodeJS  
* **Database :**  MongoDB Atlas

## **Core Capabilities** {#core-capabilities}

Each capability lists the Functional Requirements that implement it, see Functional Requirements for the full atomic specification.

1. **Automated Ingestion Engine:** Web scrapers that run daily to pull new TORs from the BMA e-GP board and agency sites, handling multiple source formats (scanned PDF, image, HTML, and structured JSON where available). → *FR01, FR02*

2. **AI Vision & NLP Reader:** An OCR and Large Language Model (LLM) pipeline that reads scanned Thai PDFs, filters out non-IT projects, and normalizes every posting regardless of source format into a single consistent summary schema (Requirements, Tech Stack, Budget, Deadlines), so applicants never have to open the original file to get the overview. → *FR03, FR04, FR05*

3. **Applicant Search & Discovery:** Applicants can browse and filter the normalized TOR catalog by tech stack, budget, deadline, and agency, so they can quickly narrow down relevant projects. → *FR06*

4. **Smart Matchmaker:** Users input their skills and budget range; the system proactively notifies them when a relevant project drops, highlighting (or email notification) if they qualify for the government's "SME Advantage" bidding rules.   
   → *FR07, FR08*

5. **Amendment & Status Watchdog:** The system tracks document hashes and each TOR's public lifecycle status (Draft/Public Hearing, Open, Awarded, Closed, Cancelled) sourced from the origin portal, and uses AI diffing to instantly alert users if a TOR they are tracking has been amended or is no longer active, preventing wasted effort on outdated listings. → *FR09, FR10, FR11*

6. **Reality Check Dashboard:** A statistical tool that flags "Price Outliers," comparing current TOR budgets against historical norms for similar scopes, so applicants and watchdogs can judge whether a stated Reference Price (ราคากลาง) is fair. → *FR12*  
   

7. **Lock-spec Flagging:** The system compares a TOR's stated qualification and experience requirements against normalized baselines for similar past projects and flags postings with unusually restrictive or hyper-specific requirements, so applicants can avoid spending time on bids they realistically cannot win. → FR13

8. **Admin Monitoring Dashboard:** Administrators can monitor data collection and AI processing, identify failed or low-confidence results, to correct or completely remove inaccurate information . → FR14, FR15

# **Project UI Mockups** {#project-ui-mockups}

1. **TOR Catalog** 

**What it does :** shows and organizes the collected TORs, so users can search and filter projects by relevant information such as budget, deadline, agency, and technology.

2. **TOR Summary / Detail**   
   **What it does :** The system uses AI to summarize TORs and extract important information, making it easier for users to understand what each project is about.  
     
3. **Watchdog**  
   **What it does :** Tracks changes to TOR documents and compares project prices with historical data to help users evaluate and monitor projects.

4. **User Profile & Matching Preferences**  
   **What it does :** Users can enter their skills, technologies, budget range, and project size so the system can identify and rank TORs that are suitable for them. 

## **Functional Requirements** {#functional-requirements}

Each FR is atomic traces back to the Core Capability it implements (noted in brackets).

**FR01.** The system must scrape and ingest new TOR postings daily from the BMA e-GP board and agency sites. *\[Automated Ingestion Engine\]*

**FR02.** The ingestion engine must support multiple source formats (PDF, scanned image, HTML, and JSON where the e-GP API exposes it) and normalize them into a single internal schema, regardless of source. *\[Automated Ingestion Engine\]*

**FR03.** The system must perform Optical Character Recognition (OCR) optimized for the Thai language on downloaded PDFs and image files. *\[AI Vision & NLP Reader\]*

**FR04.** The system must classify documents to isolate software/IT projects located within BMA (Bangkok) jurisdiction, filtering out non-IT and non-Bangkok postings. *\[AI Vision & NLP Reader\]*

**FR05.** The system must extract structured metadata fields — *Project Title, Agency Name, Maximum Budget, Submission Deadline, Required Tech Stack, and Penalty Clauses* — from each normalized TOR. *\[AI Vision & NLP Reader\]*

**FR06.** The system must allow users to search and filter TORs by tech stack, budget range, deadline, and agency. *\[Applicant Search & Discovery\]*

**FR07.** The system must calculate a match score between a TOR and a user's stated skills and capability profile. *\[Smart Matchmaker\]*

**FR08.** The system must send email notifications, with user consent, when a matching or watchlisted TOR is posted, amended, or closed. *\[Smart Matchmaker\]*

**FR09.** The system must track and display the current lifecycle status of each TOR — *Draft/Public Hearing, Open, Awarded, Closed,* or *Cancelled* — sourced from the origin portal, and overlay a separate *Amended* flag whenever a revision notice is detected (amendment is treated as an event on top of a status, not a status of its own, since an Open TOR can be amended multiple times without changing its stage). *\[Amendment & Status Watchdog\]*

**TOR Status Values (public badge):**

| Badge (website) | Meaning | Origin portal reference | When it applies |
| :---- | :---- | :---- | :---- |
| **Draft** | TOR published for public hearing/comment; not yet open for bids | ร่าง TOR — อยู่ระหว่างรับฟังความคิดเห็น | Required only for higher-value e-bidding projects, before the official announcement |
| **Open** | Officially announced and currently accepting proposals/bids | ประกาศเชิญชวน / เปิดรับข้อเสนอ | Default active state once the announcement is posted |
| **Awarded** | A winning vendor has been selected; no longer accepting applicants | ประกาศผู้ชนะการเสนอราคา | After the agency completes evaluation |
| **Closed** | Submission window has passed with no award or cancellation posted yet | *(inferred from deadline; not always explicitly labeled by the source)* | Ambiguous/stale postings — flagged so users don't chase a dead listing |
| **Cancelled** | Agency withdrew or cancelled the procurement | ยกเลิกประกาศ | Can occur at any stage |
| *Amended (flag, not a status)* | Overlaid on any badge above, e.g. "Open · Amended" | ประกาศแก้ไขเปลี่ยนแปลง | Whenever FR10's document diff detects a revision |

Note: FR09's "sourced from the origin portal" constraint means these badges should map as closely as possible to what e-GP/BMA actually publish; *Closed* is the one inferred state (dead time past deadline, no official update yet) and should be visually distinct (e.g., muted/gray) from the agency-confirmed states so users know it's the platform's best guess, not a confirmed status.

**FR10.** The system must hash TOR document content and trigger a diff comparison, summarizing the exact clauses that were altered or added. *\[Amendment & Status Watchdog\]*

**FR11.** The system must let users save TORs to a personal watchlist and receive status/amendment alerts for saved items. *\[Amendment & Status Watchdog\]*

**FR12.** The system must calculate and display the historical median/average price of similar past projects, grouped by category and scope similarity. *\[Reality Check Dashboard\]*

**FR13.** The system must compare a TOR's qualification/experience requirements against normalized baselines for similar projects and flag postings with statistically unusual or hyper-specific requirements as "high lock-spec risk." *\[Lock-spec Flagging\]*

**FR14.** The system must provide administrators a dashboard showing scraper uptime and failures per source. *\[Admin Monitoring Dashboard\]*

**FR15.** The system must display OCR/LLM extraction confidence scores per document and allow admins to manually correct or reclassify low-confidence or misclassified entries. *\[Admin Monitoring Dashboard\]*

# **Timeline & Roadmap** {#timeline-&-roadmap}

The project will be executed over a **13-week** timeline, structured to ensure a functional draft is ready for review by Week 11, leaving ample time for refinement before the final handover.

* **Phase 1: Discovery, Design & Architecture (Weeks 0–2)**  
  * Finalize system architecture and UI/UX wireframes.  
  * Map the exact BMA and Thai e-GP data sources for the web scrapers, confirming coverage is limited to Bangkok software/IT TORs.

* **Phase 2: Core Data Pipeline (Weeks 3–6)**  
  * Build the automated web scrapers for Comptroller General's Department and BMA portals, supporting PDF, image, HTML, and JSON sources.  
  * Integrate Thai OCR and configure the LLM prompts for extracting "ราคากลาง" (Reference Price), Tech Stack, and Summaries into the normalized schema.

* **Phase 3: Application Development & Core Features (Weeks 7–9)**  
  * Develop the user-facing web app (Profiles, Search & Filter, SME Matchmaker).  
  * Build the Smart Matching Engine and Price Benchmarking logic.

* **MILESTONE 1: First Attempt Submission (Week 10\)**  
  * *Deliverable:* A fully functional draft of the platform.  
  * *Action:* Client review, User Acceptance Testing (UAT), and gathering feedback on the Thai AI extraction accuracy.

* **Phase 4: Refinement & Advanced Features (Weeks 11–12)**  
  * Address all feedback and bug reports from the Week 11 submission.  
  * Implement the Amendment & Status Watchdog (document hashing and diffing for silent PDF uploads) and the Lock-spec Flagging logic.  
  * Deploy the Admin Dashboard for monitoring pipeline health and extraction confidence.

* **MILESTONE 2: Final Submission (Week 13\)**  
  * *Deliverable:* The polished, production-ready application.  
  * *Action:* Final project handover, codebase transfer, and launch readiness.

# 

# **Cost Breakdown** {#cost-breakdown}

* **AI Vision & Thai NLP Pipeline (241,850 THB, 24.19%):** This is the platform's core intelligence. It requires specialized R\&D to integrate Thai-optimized OCR and fine-tune Large Language Models (LLMs) so they can accurately read scanned PDFs and extract dense bureaucratic legalese, Tech Stacks, and the Reference Price.

* **Amendment Watchdog & Lock-spec Analytics (178,420 THB, 17.84%):** This funds the complex risk-management logic. It covers building the document hashing system to track silent TOR status changes (open, amended, closed) and the statistical models required to compare current requirements against historical baselines for the Reality Check Dashboard.

* **Automated e-GP/BMA Ingestion Engine (162,350 THB, 16.24%):** Scraping government portals is notoriously difficult. This covers the engineering required to build daily, resilient web scrapers targeting the Comptroller General's Department and BMA portals, and the normalization pipeline to convert varied formats (PDF, image, HTML, JSON) into one unified schema.

* **Frontend Web App & Admin Dashboard (149,680 THB, 14.97%):** This covers all UI/UX design and NextJS frontend development. It funds the creation of the applicant-facing search filters, the normalized TOR summaries, and the Admin Monitoring Dashboard used to track scraper uptime and OCR confidence scores.

* **Smart Matchmaker Engine (118,900 THB, 11.89%):** This covers the specific algorithms that calculate match scores between a user's stated skills/budget and the available TORs, plus the secure email notification dispatch system to alert users of SME Advantage opportunities.

* **Backend API & Database Architecture (96,450 THB, 9.64%):** This is the structural foundation, funding the development of the NodeJS backend, the MongoDB Atlas database schemas, and the secure APIs linking the frontend to the AI engine.

* **Testing (QA/UAT), Infrastructure & Deployment (52,350 THB, 5.23%):** This covers the hard costs for cloud hosting and LLM token usage during the development phase, alongside the dedicated hours required for Week 11 User Acceptance Testing (UAT) and the final Week 13 codebase handover.

# 

# **Team & Roles** {#team-&-roles}

**Amornrit SIRIKHAM** – Project Manager & Data Engineer

* **Project Leadership:** Manages the 13-week sprint schedule, coordinates User Acceptance Testing (UAT), and ensures Milestone 1 and Milestone 2 deliverables are met on time.  
* **Data Pipeline & Ingestion:** Constructs and maintains the automated web scrapers for the Comptroller General's Department and BMA portals.  
* **Feature Ownership:** Manages the data normalization process, ensuring all incoming source formats (PDF, image, HTML, JSON) are successfully converted into a single internal schema.

**Sivapon CHANNUAL** – Lead AI & Frontend Developer

* **Thai NLP & AI Pipeline:** Integrates the Thai OCR and configures the LLM prompts for accurately extracting the Reference Price (ราคากลาง), Tech Stack, and project summaries from scanned PDFs.  
* **UI & Web App:** Leads UI/UX design and develops the NextJS user-facing web application.  
* **Feature Ownership:** Builds the Smart Matchmaker dashboard, the Applicant Search & Discovery interfaces, and develops the statistical baselines for the Lock-spec Flagging system.

**Pannawit MAHACHAROENSIRI** – Backend Developer & Infrastructure Engineer

* **Core API & Database:** Architects the NodeJS backend and designs the schemas for the MongoDB Atlas database.  
* **System Operations:** Implements the daily cron jobs for the Amendment & Status Watchdog, including the document hashing and diffing logic.  
* **Feature Ownership:** Oversees cloud deployment, security, user authentication, and builds the Admin Monitoring Dashboard for tracking scraper uptime.
