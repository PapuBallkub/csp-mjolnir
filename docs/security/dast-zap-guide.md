# Dynamic Application Security Testing (DAST) Guide: OWASP ZAP

This guide documents the **Dynamic Application Security Testing (DAST)** architecture, automated CI/CD pipeline, and operations for the **Government IT Procurement Discovery Platform (GIPDP / Mjölnir)**, fulfilling **Grading Criteria #14 & #15**, **Threat Models T7/T8**, and **OWASP ASVS v5.0 Chapter 15** dynamic testing requirements (Requirement V15.2.1).

---

## 1. Overview & Objectives

While SAST (Static Application Security Testing) analyzes source code at rest, **DAST (Dynamic Application Security Testing)** inspects the running application from an external attacker's perspective without access to internal source files.

### Key Security Vectors Evaluated:
- **HTTP Security Headers:** CSP enforcement, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.
- **Framework & Server Information Leaks:** Absence of `X-Powered-By` headers and runtime version disclosures (ASVS Chapter 13).
- **Session & Cookie Protections:** `HttpOnly`, `Secure`, `SameSite=Lax`, and `__Host-` prefix validation (ASVS Chapter 3).
- **Authentication & Credential Transmission:** Verifying credentials are not transmitted via GET query parameters (`method="post"` enforcement, CWE-598).
- **Injection & Reflected Attack Vectors:** Cross-Site Scripting (XSS), SQL/NoSQL injection markers, and open redirects.
- **Error Information Leakage:** Stack traces or sensitive technical details exposed in HTTP response bodies (ASVS Chapter 16).

---

## 2. Automated DAST in CI/CD (`dast-zap.yml`)

The platform includes an automated GitHub Actions workflow at [`.github/workflows/dast-zap.yml`](../../.github/workflows/dast-zap.yml).

### Execution Model: On-Demand & Scheduled
Because full-stack dynamic scanning requires spinning up a database container, Express API server, and Next.js frontend, DAST runs decoupled from standard PR fast checks to preserve developer velocity:
1. **On-Demand (`workflow_dispatch`):** Team members or instructors can manually trigger a scan from the GitHub Actions tab at any time (e.g. before milestone submission or release).
2. **Weekly Schedule (`cron: 0 0 * * 0`):** Automatically runs every Sunday at midnight UTC to maintain regular security health telemetry. *(Can be disabled via GitHub Actions UI when the project concludes).*

### Workflow Lifecycle:
1. **Database:** Starts a disposable MongoDB 8 service container on `localhost:27017` with healthy ping verification.
2. **Data Seeding:** Runs `npm run seed -- --demo` in `server/` to populate starter technologies, 28 real e-GP TOR projects, and demo insights for spider crawling.
3. **API Server:** Boots Express API on port `8000` with test secrets and waits for `http://localhost:8000/health`.
4. **Web Client Build & Standalone Startup:**
   - Builds Next.js in production mode (`NEXT_PUBLIC_API_URL=http://localhost:8000`).
   - Copies static assets (`.next/static` and `public`) into the standalone distribution folder.
   - Launches Next.js standalone server: `PORT=3000 HOSTNAME=0.0.0.0 nohup node .next/standalone/client/server.js > /tmp/client.log 2>&1 &`.
   - Polls `http://localhost:3000` using resilient bash polling (`status=$(curl ... || true)`) to prevent early bash aborts before the port binds.
5. **Report Preparation & Permissions:**
   - Pre-creates report files (`touch report_html.html report_md.md report_json.json`).
   - Grants write permissions (`chmod 666`) so the non-root `zap` Docker user (UID 1000) can write reports to the mounted workspace volume without permission errors.
6. **Spider & Scanner (`zaproxy/action-baseline@v0.15.0`):**
   - Runs against `http://localhost:3000` using Docker `--network=host`.
   - `-m 3`: 3-minute spider crawl duration across all discoverable links.
   - `-T 5`: 5-minute passive scan queue drainage.
   - `-I`: Warnings do not fail the build.
   - `-r report_html.html -w report_md.md -J report_json.json`: Explicitly instructs ZAP to generate HTML, Markdown, and JSON reports.
   - `allow_issue_writing: false`: Disables automated issue creation to prevent 403 API permission errors with read-only tokens.
7. **Artifact Upload:** Automatically packages and uploads `zap-baseline-report` containing the HTML, Markdown, and JSON report files.

---

## 3. How to Trigger and View Results in GitHub Actions

### Triggering a Scan:
1. Open the repository on GitHub: `https://github.com/PapuBallkub/csp-mjolnir`
2. Navigate to the **Actions** tab.
3. In the left sidebar, select **"DAST — OWASP ZAP Baseline Scan"**.
4. Click the **Run workflow** dropdown on the right:
   - Target URL defaults to `http://localhost:3000`.
   - Click the green **Run workflow** button.

### Downloading the Reports:
1. When the run finishes (showing a green checkmark ✅), click on the completed run.
2. Scroll to the **Artifacts** section at the bottom of the Summary page.
3. Click **`zap-baseline-report`** to download the ZIP archive.

---

## 4. Understanding the ZAP Scan Reports

The downloaded archive contains three files:
- **`report_html.html` (Recommended):** Interactive HTML report with visual charts, severity badges, affected URLs, and remediation guidance.
- **`report_md.md`:** Markdown formatted report suitable for documentation or issue comments.
- **`report_json.json`:** Raw structured scan data.

### Interpreting Alert Severity:
| Severity | Description | Platform Baseline Status |
|---|---|---|
| **High** | Critical vulnerabilities (e.g. Remote Code Execution, Active SQL Injection, Stored XSS) | **0 Alerts** (Verified Clean) |
| **Medium** | Security header directives or configuration anomalies | **3 Alerts** (CSP `unsafe-inline` required for Next.js SSR hydration, and wildcard HTTPS image sources) |
| **Low** | Information leakage or minor policy deviations | **0–3 Alerts** (e.g. `COOP: same-origin-allow-popups` intentionally configured to allow Google OAuth popup sign-in) |
| **Informational** | General observations about modern web capabilities and caching | **8 Alerts** (Expected web app behaviors) |

### Understanding the "Statistic" Metrics:
In the report's **Insights** table, the `Statistic` column provides quantitative scan health measurements:
- **Percentage of responses with status code 2xx (e.g., 92%):** Verifies that the crawler successfully navigated the site without crashing backend endpoints.
- **Percentage of endpoints by Content-Type:** Displays the composition of scanned assets (e.g., 41% JavaScript, 26% HTML, 20% WOFF2 fonts).
- **Count of total endpoints (e.g., 63):** Confirms the spider traversed all major application views (`/search`, `/tor/[id]`, `/auth`, `/watchdog`, `/admin`).
- **Percentage with method GET (100%):** Confirms the baseline scan operated in safe, non-destructive read-only mode.

---

## 5. Running OWASP ZAP Locally

To run the scan locally before pushing changes:

### Prerequisites:
- Docker installed and running.
- Local MongoDB running on `localhost:27017`.

### Step 1: Start Backend API
```bash
cd server
npm run seed -- --demo
npm start
```

### Step 2: Build & Start Frontend in Standalone Mode
```bash
cd client
npm run build
cp -r .next/static .next/standalone/client/.next/static 2>/dev/null || true
cp -r public .next/standalone/client/public 2>/dev/null || true
PORT=3000 HOSTNAME=0.0.0.0 node .next/standalone/client/server.js
```

### Step 3: Run ZAP Container (Passive Baseline Scan)
In another terminal at the repository root:
```bash
touch report_local.html
chmod 666 report_local.html

docker run --rm -v $(pwd):/zap/wrk/:rw --network="host" \
  ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t http://localhost:3000 \
  -r report_local.html \
  -c .zap/rules.tsv
```

Open `report_local.html` in your browser to inspect the results.

---

## 6. Managing False Positives with `.zap/rules.tsv`

Dynamic scanners may report alerts for configurations that are intentional and safe (such as Next.js hydration scripts or OAuth popups). To tune alert thresholds or suppress verified false positives, edit [`.zap/rules.tsv`](../../.zap/rules.tsv):

```tsv
# Format: <Rule-ID>\t<Action: IGNORE|WARN|FAIL>\t<Description>
10015	IGNORE	(Incomplete or No Cache-control Header Set on public unauthenticated routes)
```

Common ZAP Baseline Rule IDs:
- **10015:** Incomplete Cache-Control HTTP Headers
- **10020:** X-Frame-Options Header
- **10037:** Server Information Leaks (`X-Powered-By`)
- **10038:** Content Security Policy (CSP) Header
- **10055:** CSP Wildcard or Unsafe-Inline Directive
- **90004:** Cross-Origin Opener / Embedder Policy
