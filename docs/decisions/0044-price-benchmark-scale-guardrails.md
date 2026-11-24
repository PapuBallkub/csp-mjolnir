# 0044 · Price benchmark order-of-magnitude scale guardrails

Status: accepted · 2026-11-24

## Context

[0021](0021-find-comparable-projects.md) established technical specification matching (`systemArchetype`, `complexityTier`, `requiredTechnologies`, and `categories`) to identify comparable historical IT procurement projects for the Price Reality Check (FR-19).

To eliminate circular bias—where an inflated tender is validated merely by comparing it to similarly expensive tenders—ADR 0021 deliberately excluded budget filtering from candidate discovery.

In live evaluation of Thai government procurement notices (e-GP), this led to an extreme pathological edge case:
- A nationwide **฿495,000,000** data center operations project matched with five routine room maintenance contracts ranging from **฿801,350 to ฿1,594,416** (e.g. *"จัดจ้างบำรุงรักษาระบบปฏิบัติงานของ Data Center"*, *"การจ้างบำรุงรักษาและซ่อมแซมแก้ไขห้อง Data Center"*).
- Because both the mega-tender and the routine contracts contained the phrase "Data Center", both were assigned `systemArchetype: 'infra-networking'` and `categories: ['maintenance-and-support']`.
- With no budget scale guardrail, the algorithm selected these ฿1M maintenance tenders as peers, yielding a statistical baseline of ฿1.36M and flagging the ฿495M project as **+36,141.6%** above market.
- The UI copy described this ฿495M tender as being compared against *"โครงการขนาดใกล้เคียงกัน"* (projects of similar size).

A deviation of +36,141% is not an indicator of procurement inflation; it is an erroneous comparison of fundamentally different scopes of work (routine A/C and hardware maintenance vs. a national data center operations contract). Such extreme false positives erode credibility with vendors, journalists, and public auditors.

We needed a principled boundary that prevents astronomical scope mismatches while preserving the non-circular independence of price benchmarking.

---

## Decision

**Candidate projects must satisfy an order-of-magnitude scale sanity guardrail ($\text{Scale Ratio} \ge 0.10$) and strict enterprise tier isolation before being admitted into peer benchmark calculations.**

### 1. The Order-of-Magnitude Scale Guardrail ($\ge 0.10$)

In comparative economics and cost estimation, projects whose budgets differ by more than **one order of magnitude (10x)** represent categorically distinct operational scopes, regardless of shared technology keywords.

A candidate peer ($C$) is eligible for comparison against the target project ($T$) only if their reference prices satisfy:

$$\text{Scale Ratio} = \frac{\min(T_{\text{price}}, C_{\text{price}})}{\max(T_{\text{price}}, C_{\text{price}})} \ge 0.10$$

- **Allowed (True Price Anomaly Detection):**  
  A ฿10,000,000 project compared against peers between ฿1,000,000 and ฿100,000,000 ($\text{Ratio} \ge 0.10$). Standard overpricing (e.g. +30% to +150%) remains fully detectable and unhindered.
- **Rejected (Gross Scope Mismatch):**  
  A ฿495,000,000 project compared against ฿1,500,000 maintenance contracts ($\text{Ratio} = 0.003 < 0.10$). These are disqualified immediately.

### 2. Strict Enterprise Tier Isolation

Grounded in [0021](0021-find-comparable-projects.md):
- When a target project is classified as `enterprise` (`overview.complexityTier: 'enterprise'`), candidates must also be `enterprise`.
- Candidates classified as `standard` or `basic` cannot serve as historical baselines for enterprise platforms.
- If no concluded `enterprise` peers exist in the database for that category, the system must not fall back to routine `standard` or `basic` tenders.

### 3. Graceful $N = 0$ Fallback ([0024](0024-price-benchmark-bands-and-sample-size-thresholds.md))

In accordance with Section 6 of `AGENTS.md` (*"Missing is not invented: when the TOR doesn't state something... omit the section. Never show a plausible default"*):
- If zero candidate peers satisfy the category, tier, and 10x scale guardrail, `findComparableProjects()` returns an empty list (`[]`).
- `calculatePriceBenchmarks()` sets `historicalMedianTHB: null`, `historicalAverageTHB: null`, and `diffPercentage: null` (`sampleSize: 0`, `reliability: 'none'`).
- The UI displays a neutral **`— ไม่มีราคาเปรียบเทียบ`** badge rather than an alarmist percentage spike.

---

## Consequences

- **Eliminates Absurd False Flags:** Eliminates pathological 4-digit and 5-digit percentage outliers (+3,000% to +36,000%) caused by comparing mega-projects against small maintenance jobs.
- **Preserves Legitimate Anomaly Detection:** Tenders that are genuinely overpriced by 20% to 200% remain fully caught and flagged within the 10x scale window.
- **Database Refresh Required:** Stored records in `TorInsight.analytics.priceAnalysis` must be refreshed across existing MongoDB documents using `node scripts/find-comparable.js --all --save`.

