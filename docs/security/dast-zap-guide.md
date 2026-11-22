# Dynamic Application Security Testing (DAST) Guide: OWASP ZAP

This guide documents the **Dynamic Application Security Testing (DAST)** architecture and operation for the **Government IT Procurement Discovery Platform (GIPDP / Mjölnir)**, fulfilling **Grading Criteria #14 & #15**, **Threat Models T7/T8**, and **OWASP ASVS** dynamic testing requirements.

---

## 1. Overview & Objectives

While SAST (Static Application Security Testing) analyzes source code at rest, **DAST (Dynamic Application Security Testing)** inspects the running application from an external attacker's perspective. It evaluates:
- **HTTP Security Headers:** CSP enforcement, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
- **Session & Cookie Protections:** `HttpOnly`, `Secure`, `SameSite=Lax`, and `__Host-` prefix validation (ASVS Chapter 3).
- **Injection & Reflected Attacks:** Cross-Site Scripting (XSS), SQL/NoSQL injection markers, and open redirects.
- **Error Information Leakage:** Stack traces or sensitive technical details exposed in HTTP response bodies (ASVS Chapter 16).

---

## 2. Automated DAST in CI/CD (`dast-zap.yml`)

The platform includes an automated GitHub Actions workflow at [`.github/workflows/dast-zap.yml`](../../.github/workflows/dast-zap.yml).

### Execution Model: On-Demand & Scheduled
Because full-stack dynamic scanning requires spinning up a database container, API server, and Next.js frontend, DAST runs decoupled from standard PR fast checks:
1. **On-Demand (`workflow_dispatch`):** Team members or instructors can manually trigger a scan from the GitHub Actions tab at any time (e.g. before milestone submission or release).
2. **Weekly Schedule (`cron: 0 0 * * 0`):** Automatically runs every Sunday at midnight UTC to maintain regular security health telemetry.

### Workflow Lifecycle:
1. **Database:** Starts a disposable MongoDB 8 service container.
2. **Data Seeding:** Runs `npm run seed -- --demo` to populate starter technologies, 28 real e-GP TOR projects, and demo insights for spider crawling.
3. **API Server:** Boots Express API on port `8000` with test secrets and waits for `http://localhost:8000/health`.
4. **Web Client:** Builds Next.js in production mode (`NEXT_PUBLIC_API_URL=http://localhost:8000`) and starts it on port `3000`.
5. **Spider & Scanner:** Executes `zaproxy/action-baseline@v0.15.0` with:
   - `-m 3`: 3-minute spider crawl duration across pages.
   - `-T 5`: 5-minute passive scan queue drainage.
   - `-I`: Warnings do not abort pipeline; outputs full report artifacts.
6. **Artifact Preservation:** Automatically captures and uploads:
   - `report_html.html` (interactive HTML report with alert severity summaries).
   - `report_md.md` (markdown summary for PR comments / documentation).
   - `report_json.json` (machine-readable structured findings).

---

## 3. How to Trigger and View Results in GitHub Actions

1. Open the repository on GitHub: `https://github.com/PapuBallkub/csp-mjolnir`
2. Navigate to the **Actions** tab.
3. In the left sidebar, select **"DAST — OWASP ZAP Baseline Scan"**.
4. Click the **Run workflow** dropdown on the right:
   - Target URL defaults to `http://localhost:3000`.
   - Click the green **Run workflow** button.
5. Once the run finishes:
   - Scroll down to the **Artifacts** section at the bottom of the summary page.
   - Download **`zap-baseline-report`** (contains HTML and Markdown reports).

---

## 4. Running OWASP ZAP Locally

To test locally before pushing or to perform a deeper active scan:

### Prerequisites
- Docker installed and running.
- Local MongoDB running on `localhost:27017`.

### Step 1: Start Backend and Frontend
In terminal 1 (server):
```bash
cd server
npm run seed -- --demo
npm start
```

In terminal 2 (client):
```bash
cd client
npm run build
npm start
```

### Step 2: Run ZAP Container (Passive Baseline Scan)
In terminal 3:
```bash
docker run --rm -v $(pwd):/zap/wrk/:rw --network="host" \
  ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t http://localhost:3000 \
  -r report_local.html \
  -c .zap/rules.tsv
```

Open `report_local.html` in your browser to inspect the results.

---

## 5. Managing False Positives with `.zap/rules.tsv`

Dynamic scanners may report alerts for configurations that are intentional and safe. To suppress false positives or tune alert thresholds, edit [`.zap/rules.tsv`](../../.zap/rules.tsv):

```tsv
# Format: <Rule-ID>\t<Action: IGNORE|WARN|FAIL>\t<Description>
10015	IGNORE	(Incomplete or No Cache-control Header Set on public unauthenticated routes)
```

Common ZAP Baseline Rule IDs:
- **10015:** Incomplete Cache-Control HTTP Headers
- **10020:** X-Frame-Options Header
- **10038:** Content Security Policy (CSP) Header
- **10096:** Timestamp Disclosure
- **90033:** Cookie without SameSite attribute

Rules set to `IGNORE` will be excluded from the report and will not trigger warnings or failures.
