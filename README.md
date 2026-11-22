# GIPDP — Government IT Procurement Discovery Platform

**Repository:** [https://github.com/PapuBallkub/csp-mjolnir](https://github.com/PapuBallkub/csp-mjolnir)

GIPDP (working title: *Mjölnir*) is a web platform that collects Thai government software and IT procurement notices from e-GP and open-data sources, extracts and normalizes their Terms of Reference (TOR) documents into plain-language summaries, and surfaces risk signals — **Price Reality Check** against historical contracts, **Lock-spec Risk** detection, and **Amendment History / Diffs** — alongside capability-based matching and watchlists for small Thai tech companies and freelance developers.

> **Disclaimer:** GIPDP is a third-party discovery and analysis tool. All official procurement announcements and bidding take place on the Comptroller General's Department e-GP portal ([gprocurement.go.th](https://www.gprocurement.go.th)).

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

### Step 1: Start Local MongoDB (if using Setting Option 1)

If `MONGO_URI` points to `mongodb://localhost:27017`, make sure MongoDB is running before starting the backend:

```bash
# Using Docker Compose (recommended — persists data in the mongo-data volume)
docker compose up -d mongo
```

*(Skip this step if `MONGO_URI` in `server/.env` points to MongoDB Atlas, or if you already have a native MongoDB service running on port `27017`.)*

### Step 2: Install and Start the Backend API (`http://localhost:8000`)

Open two terminals — one for the Backend API (`server/`) and one for the Frontend Web App (`client/`):

```bash
cd server
npm install
npm run dev
```

*(Optional — if using an empty local MongoDB database)* Seed the technology vocabulary and demo TOR records in a separate terminal:

```bash
cd server
npm run technologies:seed
npm run seed
```

### Step 3: Install and Start the Frontend (`http://localhost:3000`)

```bash
cd client
npm install
npm run dev
```

### Step 4: Access the Application

- **Web Application:** [http://localhost:3000](http://localhost:3000)
- **Backend API Health Check:** [http://localhost:8000/api/health](http://localhost:8000/api/health)

---

## Running Tests & Linting

```bash
# Backend unit & integration tests (requires local MongoDB running on localhost:27017)
cd server
npm test

# Frontend unit tests and ESLint
cd client
npm test
npm run lint
```

---

## Project Structure & Documentation

```text
.
├── client/                 Next.js 16 frontend application (App Router)
├── server/                 Node.js + Express 5 API and ingestion/extraction pipeline
├── docs/                   Architecture overviews, SRS summary, database schemas, and ADRs
├── README.md               Project overview, setup options, and run instructions
├── AGENTS.md               Engineering rules and frontend design guide
└── CONTRIBUTING.md         Developer onboarding, workflow, and commit conventions
```

For full documentation, start at **[docs/README.md](docs/README.md)**:
- **System Overview:** [docs/overview/system-overview.md](docs/overview/system-overview.md)
- **Requirements (SRS Summary):** [docs/requirements.md](docs/requirements.md)
- **Pipeline Guide:** [docs/pipeline-guide.md](docs/pipeline-guide.md)
- **Project Map (every file explained):** [docs/project-map.md](docs/project-map.md)
- **Deployment Checklist:** [docs/deployment-checklist.md](docs/deployment-checklist.md)

---

## Team

Capstone Project — Department of Computer Engineering (Software Engineering, `01219346`), Kasetsart University:
- Amornrit Sirikham
- Sivapon Channual
- Pannawit Mahacharoensiri