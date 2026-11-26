# GIPDP — Government IT Procurement Discovery Platform

GIPDP (working title: *Mjölnir*) is a web platform that collects Thai government software and IT procurement notices from e-GP and open-data sources, extracts and normalizes their Terms of Reference (TOR) documents into plain-language summaries, and surfaces risk signals — **Price Reality Check** against historical contracts, **Lock-spec Risk** detection, and **Amendment History / Diffs** — alongside capability-based matching and watchlists for small Thai tech companies and freelance developers.

> **Disclaimer:** GIPDP is a third-party discovery and analysis tool. It never drafts or submits bids, and it never offers legal advice. All official procurement announcements and bidding take place on the Comptroller General's Department e-GP portal ([gprocurement.go.th](https://www.gprocurement.go.th)).

---

## Key Capabilities

- **Automated Ingestion & AI Normalization (`FR-01`–`FR-07`, `NFR-16`–`NFR-17`):** Polls e-GP RSS feeds (`15`, `B0`, `D0`, `D1`, `D2`, `W0`/`W1`/`W2`) and imports historical `data.go.th` contracts (`CGDContract`), screens IT scope, runs Thai+English OCR + ClamAV scanning, extracts structured TOR facts with Vertex AI Gemini (`gemini-3.7-flash`), and quarantines records under 80% confidence for human review.
- **Price Reality Check & Lock-Spec Analysis (`FR-19`–`FR-21`):** Groups comparable historical projects using deterministic similarity scoring + 10× order-of-magnitude scale guardrails (`ADR-0044`), benchmarks ราคากลาง against historical medians/averages (`±15%` normal band), and flags competition barriers under Circular ว 214.
- **Capability Profile & Matchmaker (`FR-12`–`FR-14`):** Evaluates a 6-factor match score (tech stack, system archetype, budget range, past contract portfolio, legal entity type, certifications) across `/search` and `/tor/[id]`.
- **Amendment Diffs, Watchlist & PDPA Alerts (`FR-15`–`FR-18`):** Detects silent document package changes as well as `D2` amendments, diffs historical versions, and dispatches in-app feeds + opt-in email digests with 1-click HMAC unsubscribe.
- **Admin Operations & Security (`FR-22`–`FR-24`, `NFR-08`–`NFR-11`):** Live feed telemetry, review/approval/rollback workspace (`/admin/review/[id]`), pipeline recovery, peppered bcrypt auth (`ADR-0039`), pre-creation email verification (`ADR-0041`), Google OAuth 2.0, CodeQL SAST, and OWASP ZAP DAST.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend (`client/`)** | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| **Backend (`server/`)** | Node.js (ES Modules), Express 5, Mongoose 9 |
| **Database** | MongoDB 8 (Local MongoDB or MongoDB Atlas) |
| **Ingestion & AI Pipeline** | Tesseract.js / PDF parsing (OCR), Google Gemini (`@google/genai`), ClamAV (`clamd` virus scanning) |

---

## Prerequisites

- **Node.js** 22+ and **npm**
- **MongoDB** (either **Docker** to run the included `mongo:8` container, a local MongoDB instance on `localhost:27017`, or a MongoDB Atlas connection string)

---

## Environment Configuration (`.env` Settings)

Before running the application, configure both the backend (`server/.env`) and frontend (`client/.env.local`).

### 1. Backend Configuration (`server/.env`)

Copy the example environment file from the repository root:

```bash
# PowerShell / Git Bash / macOS / Linux
cp server/.env.example server/.env

# Windows Command Prompt (cmd.exe)
copy server\.env.example server\.env
```

#### Core Required Variables

The server refuses to boot unless `MONGO_URI`, `JWT_SECRET` (at least 32 bytes), and `PASSWORD_PEPPER` (at least 32 bytes) are set. Generate your own local secrets with Node.js:

```bash
# 1. Generate JWT_SECRET (72 characters)
node -e "console.log(crypto.randomUUID() + crypto.randomUUID())"

# 2. Generate PASSWORD_PEPPER (44 characters — keep this constant once user accounts exist)
node -e "console.log(crypto.randomBytes(32).toString('base64'))"
```

Fill in the core settings in `server/.env`:

```env
PORT=8000
CORS_ORIGIN=http://localhost:3000
MONGO_URI=mongodb://localhost:27017
TRUST_PROXY_HOPS=0
JWT_SECRET=<your-generated-jwt-secret>
PASSWORD_PEPPER=<your-generated-password-pepper>
```

#### Two Database Setting Options (`MONGO_URI`)

You have two options for configuring `MONGO_URI` in `server/.env`:

- **Setting Option 1 — Local MongoDB (Default, Isolated Development):**
  ```env
  MONGO_URI=mongodb://localhost:27017
  ```
  Connects to a local MongoDB instance on your machine. If you use Docker, start the project's pre-configured MongoDB 8 container (defined in `docker-compose.override.yml`) from the repository root:
  ```bash
  docker compose up -d mongo
  ```
  After starting the server, you can populate the local database with sample data using `npm run technologies:seed` and `npm run seed` inside `server/`.
- **Setting Option 2 — Shared MongoDB Atlas Cluster (Real Scraped Dataset):**
  ```env
  MONGO_URI=mongodb+srv://<user>:<password>@<cluster-url>/?retryWrites=true&w=majority
  ```
  Connects to the MongoDB Atlas cluster containing scraped e-GP notices and extracted TOR insights (requires your current IP address to be on the Atlas Network Access allowlist).

#### External Service Settings (Google OAuth 2.0, Gmail SMTP & Google Cloud / Vertex AI Gemini)

To enable **Sign in with Google**, **Email Notifications / Account Confirmation Emails**, and **AI TOR Extraction (Gemini on Vertex AI)**, configure the following optional variables in `server/.env`:

1. **Google OAuth 2.0 (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`):**
   - **Setup Guide:** [Setting Up Google OAuth 2.0 Credentials (Wiki)](https://github.com/PapuBallkub/csp-mjolnir/wiki/Setting-Up-Google-OAuth-2.0-Credentials)
   ```env
   GOOGLE_CLIENT_ID=<your-google-client-id>
   GOOGLE_CLIENT_SECRET=<your-google-client-secret>
   GOOGLE_REDIRECT_URI=http://localhost:8000/api/auth/google/callback
   ```
   *(If left unset, `/api/auth/google` returns `503` while email/password authentication continues to work normally.)*

2. **Gmail SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`):**
   - **Setup Guide:** [Setting Up Gmail SMTP (Wiki)](https://github.com/PapuBallkub/csp-mjolnir/wiki/Setting-Up-Gmail-SMTP)
   ```env
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=your_account@gmail.com
   SMTP_PASS=<your-16-char-google-app-password>
   EMAIL_FROM="GIPDP Procurement Alerts <your_account@gmail.com>"
   ```
   *(In local development, if `SMTP_USER` and `SMTP_PASS` are left unset, the server prints account-confirmation and password-reset links directly to the terminal console under `[auth] Development only, no SMTP`.)*

3. **Google Cloud / Vertex AI Gemini (`GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GEMINI_MODEL`):**
   - **Setup Guide:** [Setting Up Google Cloud & Vertex AI Gemini (Wiki)](https://github.com/PapuBallkub/csp-mjolnir/wiki/Setting-Up-Google-Cloud-&-Vertex-AI-Gemini)
   ```env
   GOOGLE_CLOUD_PROJECT=<your-google-cloud-project-id>
   GOOGLE_CLOUD_LOCATION=global
   GEMINI_MODEL=gemini-3.7-flash
   ```
   *(Used only when running the AI screening and extraction pipeline commands such as `npm run screen`, `npm run extract`, or admin re-extraction; the web server boots and serves existing TORs without it. No API key is stored in `.env` — authenticate once via the Google Cloud CLI with `gcloud auth login`, `gcloud config set project <GOOGLE_CLOUD_PROJECT>`, and `gcloud auth application-default login`, then verify with `npm run gemini:check`.)*

---

### 2. Frontend Configuration (`client/.env.local`)

Copy the example environment file in `client/` from the repository root:

```bash
# PowerShell / Git Bash / macOS / Linux
cp client/.env.example client/.env.local

# Windows Command Prompt (cmd.exe)
copy client\.env.example client\.env.local
```

Default contents of `client/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

> **Important:** Always open the web app at **`http://localhost:3000`** (not `http://127.0.0.1:3000`). Because the API runs on `http://localhost:8000`, using `127.0.0.1:3000` is treated as cross-site by the browser and causes session cookies to be dropped.

---

## How to Install and Run the Application

### Option A: Native Development (Recommended for Active Coding)

#### Step 1: Start Local MongoDB (if using Setting Option 1)

If `MONGO_URI` points to `mongodb://localhost:27017`, make sure MongoDB is running before starting the backend:

```bash
# Using Docker Compose (recommended — persists data in the mongo-data volume)
docker compose up -d mongo
```

*(Skip this step if `MONGO_URI` in `server/.env` points to MongoDB Atlas, or if you already have a native MongoDB service running on port `27017`.)*

#### Step 2: Install and Start the Backend API (`http://localhost:8000`)

Open two terminals — one for the Backend API (`server/`) and one for the Frontend Web App (`client/`):

```bash
cd server
npm install
npm run dev
```

*(Optional — if using an empty local MongoDB database)* Seed the technology vocabulary and demo TOR records in a separate terminal, and optionally promote a registered user to `admin`:

```bash
cd server
npm run technologies:seed
npm run seed
npm run role -- your_email@example.com admin
```

#### Step 3: Install and Start the Frontend (`http://localhost:3000`)

```bash
cd client
npm install
npm run dev
```

#### Step 4: Access the Application

- **Web Application:** [http://localhost:3000](http://localhost:3000)
- **Backend API Health Check:** [http://localhost:8000/health](http://localhost:8000/health)

### Option B: One-Command Full Stack with Docker Compose

After creating `server/.env` and `client/.env.local`, build and start MongoDB, the Express API, and the Next.js frontend together:

```bash
docker compose up -d --build
```

To also run the ClamAV virus-scanning daemon (`clamd`, requires 3–4 GiB free RAM for malware signatures):

```bash
docker compose --profile scan up -d --build
```

For production deployment configuration (`NODE_ENV=production`, TLS, `TRUST_PROXY_HOPS`, same-site cookie requirements), see [docs/deployment-checklist.md](docs/deployment-checklist.md) and the [Docker & Production Deployment (Wiki)](https://github.com/PapuBallkub/csp-mjolnir/wiki/Docker-and-Production-Deployment).

---

## Running Tests, Linting & Security Checks

```bash
# Backend unit & integration tests (requires local MongoDB running on localhost:27017)
# 76 test suites (777 tests covering API, pipeline, auth, lock-spec, price benchmarks & ASVS)
npm --prefix server test

# Frontend unit tests and ESLint
# 14 test suites (102 tests passing)
npm --prefix client test
npm --prefix client run lint
```

GitHub Actions workflows in `.github/workflows/` also run the full test matrix, **CodeQL SAST** analysis (`fullstack-ci-setup.yml`), and **OWASP ZAP DAST** baseline scans (`dast-zap.yml`).

---

## Project Structure & Documentation

```text
.
├── client/                 Next.js 16 frontend application (App Router)
├── server/                 Node.js + Express 5 API (50 routes, 14 Mongoose models) and pipelines
├── docs/                   Architecture overviews, SRS summary, DB schemas, and 44 ADRs
├── .github/workflows/      CI test matrix, CodeQL SAST, and OWASP ZAP DAST
├── README.md               Project overview, setup options, and run instructions
├── AGENTS.md               Engineering rules and frontend design guide
└── CONTRIBUTING.md         Developer onboarding, workflow, and commit conventions
```

### GitHub Wiki Guides

| Guide | What It Covers |
| :--- | :--- |
| **[Wiki Home](https://github.com/PapuBallkub/csp-mjolnir/wiki)** | Role-based entry point, official project documents, and platform snapshot |
| **[Local Development Setup](https://github.com/PapuBallkub/csp-mjolnir/wiki/Local-Development-Setup)** | End-to-end local setup, secret generation, seeding, admin promotion, and tests |
| **[Setting Up Google OAuth 2.0 Credentials](https://github.com/PapuBallkub/csp-mjolnir/wiki/Setting-Up-Google-OAuth-2.0-Credentials)** | Google Cloud Console OAuth client and callback configuration |
| **[Setting Up Gmail SMTP](https://github.com/PapuBallkub/csp-mjolnir/wiki/Setting-Up-Gmail-SMTP)** | 2-Step Verification and Gmail App Password configuration for notifications |
| **[Setting Up Google Cloud & Vertex AI Gemini](https://github.com/PapuBallkub/csp-mjolnir/wiki/Setting-Up-Google-Cloud-&-Vertex-AI-Gemini)** | GCP Vertex AI API, ADC login via `gcloud`, and `npm run gemini:check` |
| **[Docker & Production Deployment](https://github.com/PapuBallkub/csp-mjolnir/wiki/Docker-and-Production-Deployment)** | Full-stack containers, volumes, ClamAV daemon, and production checklists |
| **[User Guide](https://github.com/PapuBallkub/csp-mjolnir/wiki/User-Guide)** | Using search, TOR detail analysis, Watchdog, profile matchmaker, and alerts |
| **[Admin & Pipeline Handbook](https://github.com/PapuBallkub/csp-mjolnir/wiki/Admin-and-Pipeline-Handbook)** | Telemetry, review workspace, rollbacks, pipeline recovery, and CLI scripts |
| **[Troubleshooting & FAQ](https://github.com/PapuBallkub/csp-mjolnir/wiki/Troubleshooting-and-FAQ)** | Fixes for `127.0.0.1` cookies, missing secrets, e-GP hours, ClamAV, and OAuth skips |
| **[Architecture & Handover Index](https://github.com/PapuBallkub/csp-mjolnir/wiki/Architecture-and-Handover-Index)** | Evaluator and maintainer portal linking all 88 docs, SDD, SRS, and QA suites |

For versioned technical specifications stored in this repository, start at **[docs/README.md](docs/README.md)**:
- **System Overview:** [docs/overview/system-overview.md](docs/overview/system-overview.md)
- **Requirements (SRS Summary):** [docs/requirements.md](docs/requirements.md)
- **Software Design Document:** [docs/design-document.md](docs/design-document.md)
- **Pipeline Guide:** [docs/pipeline-guide.md](docs/pipeline-guide.md)
- **Project Map (every file explained):** [docs/project-map.md](docs/project-map.md)
- **Deployment Checklist:** [docs/deployment-checklist.md](docs/deployment-checklist.md)

---

## Team

Capstone Project — Department of Computer Engineering (Software Engineering, `01219346`), Kasetsart University:
- Amornrit Sirikham
- Sivapon Channual
- Pannawit Mahacharoensiri
