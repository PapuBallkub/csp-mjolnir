# Static Application Security Testing (SAST) Guide: GitHub CodeQL

This guide documents the **Static Application Security Testing (SAST)** architecture and operations for the **Government IT Procurement Discovery Platform (GIPDP / Mjölnir)**, fulfilling **Grading Criteria #14 & #15**, **Threat Models T1/T4/T7**, and **OWASP ASVS v5.0 Chapter 15: Secure Coding and Architecture** (Requirement V15.2.1).

---

## 1. Overview & Objectives

While DAST (Dynamic Application Security Testing) tests the running application from an external attacker's vantage point, **SAST (Static Application Security Testing)** inspects the source code at rest. It performs semantic analysis, Abstract Syntax Tree (AST) evaluation, and data-flow taint tracking to uncover vulnerabilities *before* code is ever deployed or merged into `main`.

### Key Security Vectors Covered:
- **Injection Flaws (CWE-89, CWE-943):** NoSQL query injection in MongoDB/Mongoose routes, unescaped user input reaching queries.
- **Cross-Site Scripting (XSS, CWE-79):** Reflected, stored, and DOM-based XSS in React / Next.js server components and client pages.
- **Regular Expression Denial of Service (ReDoS, CWE-1333):** Pathological regex patterns evaluated on untrusted user strings (enforcing `escapeRegex` from `#common/utils/escape-regex.js`).
- **Path Traversal & Insecure File Access (CWE-22):** Arbitrary file reading in TOR PDF download, OCR staging, or local storage.
- **Broken Access Control & Privilege Escalation (CWE-285):** Unprotected routes missing `requireAuth` or `requireRole('admin')`.
- **Sensitive Data Exposure & Information Leaks (CWE-200, CWE-312):** Hardcoded secrets, unmasked PII, or insecure cryptographic algorithm usage.

---

## 2. Automated SAST in CI/CD (`fullstack-ci-setup.yml`)

The platform integrates **GitHub CodeQL** directly into the unified GitHub Actions CI pipeline at [`.github/workflows/fullstack-ci-setup.yml`](../../.github/workflows/fullstack-ci-setup.yml).

### Execution Model: Every Push & Pull Request
Unlike heavy DAST scans, CodeQL SAST runs automatically on:
- Every push to `main`
- Every Pull Request targeting `main`
- Manual workflow runs (`workflow_dispatch`)

### Job Configuration (`codeql-sast`):
```yaml
  codeql-sast:
    name: CodeQL Static Security Analysis (SAST)
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      security-events: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: '/language:javascript-typescript'
```

### Analysis Engine & Taint Tracking
CodeQL builds a relational database representing the entire codebase syntax, control-flow graphs, and data-flow paths:
1. **Source Identification:** Tracks untrusted inputs entering the system (e.g. `req.body`, `req.query`, `req.params`, uploaded TOR documents, e-GP feed payloads).
2. **Sanitizer Verification:** Checks if input passes through mandatory defense guards before reaching sensitive sinks (e.g., `escapeRegex()`, Mongoose schema typecasting, bcrypt hashing).
3. **Sink Inspection:** Alerts if tainted, unvalidated data reaches execution sinks (e.g., `db.collection.find()`, `eval()`, `res.send()`, child processes).

---

## 3. How to View CodeQL Findings on GitHub

CodeQL uploads its analysis results using the standard Static Analysis Results Interchange Format (SARIF) to GitHub Code Scanning.

### Viewing Alerts in GitHub:
1. Open the repository on GitHub: `https://github.com/PapuBallkub/csp-mjolnir`
2. Click the **Security** tab in the top navigation bar.
3. In the left sidebar under **Vulnerability alerts**, select **Code scanning**.
4. You will see a list of all active or resolved static analysis findings, categorized by severity:
   - 🔴 **Critical / High:** Potential injection, authentication bypass, or remote code execution.
   - 🟡 **Medium:** Cryptographic weakness, unhandled exception paths, or permissive CORS.
   - ⚪ **Low / Note:** Code style smells, dead code, or minor information disclosure.

### Pull Request Integration:
When a team member opens a Pull Request, CodeQL automatically analyzes the PR's diff:
- If a new vulnerability is introduced, CodeQL posts an inline annotation directly on the offending code line in the PR "Files changed" view.
- PR status checks display the `CodeQL Static Security Analysis (SAST)` check result, preventing merges with critical security flaws.

---

## 4. Triaging and Remediating Alerts

When an alert is flagged by CodeQL, follow this triage procedure:

1. **Verify the Taint Path:** Click on the alert to view the step-by-step data path from source to sink.
2. **Apply Defensive Remediation:**
   - For **Regex Injection**: Wrap inputs with `escapeRegex()` before passing to `$regex` or `new RegExp()`.
   - For **NoSQL Injection**: Ensure queries use strongly-typed Mongoose schema finders or exact object matching rather than raw string concatenation.
   - For **Missing Auth**: Verify the route is protected by `requireAuth` or `requireRole('admin')` at the router level (ADR 0011).
3. **Resolving False Positives:**
   If a finding is determined to be intentional and verified safe (e.g., test fixtures or throwaway mock data):
   - Click **Dismiss alert** in the GitHub Security UI.
   - Select the appropriate reason (`False positive`, `Used in tests`, or `Won't fix`).
   - Add a brief justification comment citing the relevant ADR or architectural requirement.

---

## 5. Traceability Matrix

| Requirement / Standard | Implementation | Verification Tool |
|---|---|---|
| **ASVS V15.2.1** (Automated Security Testing) | Automated CodeQL scanning on every push and PR | GitHub CodeQL Action v3 |
| **CWE-943 / ASVS V5.3.4** (NoSQL Query Injection) | Taint analysis on Express route handlers to Mongoose queries | CodeQL `js/sql-injection` & `js/nosql-injection` |
| **CWE-1333 / ASVS V5.2.2** (ReDoS Prevention) | Semantic check on regex constructions | CodeQL `js/polynomial-redos` |
| **CWE-79 / ASVS V5.3.1** (Cross-Site Scripting) | React JSX escaping and DOM sink inspection | CodeQL `js/xss` |
| **Grading Criteria #14 & #15** (SAST/DAST Tooling) | Integrated CI pipeline with SARIF telemetry | GitHub Security Tab |
