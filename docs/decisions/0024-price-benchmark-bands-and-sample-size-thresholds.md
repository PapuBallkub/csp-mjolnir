# 0024 · Price benchmark bands and sample size thresholds

Status: accepted · 2026-10-13

## Context

When evaluating a TOR, bidders and auditors need a clear signal on whether the project's reference price (ราคากลาง) is realistic relative to historical government IT procurement (FR-20).

Answering "is this price normal?" presents three architectural and domain challenges:

1. **Which statistical central tendency should anchor the benchmark?**
   Government procurement has extreme right-skew (occasional 100M+ THB mega-projects). If we rely solely on the arithmetic mean, a single large past tender pulls the benchmark upwards, falsely making normal SME-scale tenders look severely underfunded.
2. **What defines "normal" versus an "anomaly"?**
   Tenders naturally vary between agencies due to maintenance durations, warranty terms, and service-level agreements. Setting an overly narrow band (e.g. $\pm 5\%$) triggers constant false alarms on ordinary market variance. Conversely, setting an overly wide band (e.g. $\pm 30\%$) obscures genuine price anomalies.
3. **How to avoid misleading users when historical data is scarce?**
   If only one or two comparable projects exist in the database, presenting a firm verdict of "normal" or "abnormal" is statistically irresponsible and misleading.

## Decision

### 1. Median as primary anchor; Mean as secondary reference

- **Primary benchmark:** Historical **Median** ($M$) of comparable reference prices is used for the primary difference calculation:
  $$\Delta = \frac{T_{\text{price}} - M}{M} \times 100\%$$
  The median resists extreme outliers and accurately reflects the center of typical contract values.
- **Secondary reference:** The arithmetic **Mean** ($\bar{P}$) and deviation vs mean ($\Delta_{\text{avg}}$) are calculated and displayed alongside the median in the metric grid for full statistical transparency.

### 2. The $\pm 15\%$ Normal Market Band

A deviation within **$\pm 15\%$** is defined as standard market variation:

| Difference ($\Delta$) | Classification | Badge / Status | Color Tone | Thai Copy |
|---|---|---|---|---|
| **$\Delta > +15\%$** | Premium / Above Benchmark | สูงกว่าค่ากลาง | Amber (`text-amend`) | *"ราคากลางสูงกว่าค่ามัธยฐานในอดีตประมาณ +X% สำหรับโครงการขนาดใกล้เคียงกัน"* |
| **$-15\% \le \Delta \le +15\%$** | Market Normal | **ราคาอยู่ในเกณฑ์ปกติ** | Neutral / Green (`text-open`) | *"ราคากลางอยู่ในเกณฑ์ปกติเมื่อเทียบกับโครงการใกล้เคียงในอดีต (เบี่ยงเบน X%)"* |
| **$\Delta < -15\%$** | Underfunded Outlier | ต่ำกว่าค่ากลาง | Crimson (`text-risk`) | *"ราคากลางต่ำกว่าค่ามัธยฐานในอดีตประมาณ -X% อาจมีความเสี่ยงเรื่องงบประมาณจำกัดเกินไป"* |

The $\pm 15\%$ threshold accommodates agency-specific procurement differences (e.g. 1-year vs 2-year warranty clauses or Bangkok vs provincial delivery logistics) while reliably surfacing projects that require closer scrutiny.

### 3. Sample Size Reliability Tiers ($N \ge 3$)

The system enforces three explicit tiers based on the number of valid comparable projects ($N$):

- **$N = 0$ (No peers):**
  `reliability: "none"`. Benchmarks remain `null`. The UI shows `"ไม่มีข้อมูลเปรียบเทียบ"` rather than inventing plausible defaults or stating "not analyzed".
- **$1 \le N < 3$ (Low sample size):**
  `reliability: "low"`. Calculations are computed, but the UI refuses to issue a definitive normal verdict. Instead, it displays a mandatory advisory banner:
  > *ⓘ ข้อสังเกต: การคำนวณอ้างอิงจากโครงการในอดีตจำนวน {N} โครงการ ซึ่งมีจำนวนจำกัด อาจยังไม่สะท้อนแนวโน้มราคาทั่วทั้งตลาด*
- **$N \ge 3$ (Standard confidence):**
  `reliability: "sufficient"`. The sample is considered statistically adequate for public decision support. The advisory banner is hidden, and the standard classification verdict is applied.

### 4. Objective, Non-Accusatory Copy (AGENTS.md)

Following the platform's core design guidelines:
- Verdict copy describes the mathematical gap and contextual benchmark, never alleging misconduct, corruption, or intent.
- "Underfunded" is flagged because unrealistically low budgets risk vendor abandonment or low-quality deliverables.
- "Above median" is flagged as an observation relative to peers, not as an accusation of inflated budget.

## Consequences

- **Consistent UX across Catalog and Detail:** Both the search row badge (`InsightPriceBadge` / `PriceDeltaBadge`) and the TOR detail page share the identical $\pm 15\%$ threshold and terminology (`"ราคาอยู่ในเกณฑ์ปกติ"`).
- **Transparent evidence:** Every benchmarked figure links to the underlying peer projects in the database, allowing users to verify the comparison.
- **Honest confidence states:** Small sample sizes are never disguised as definitive market truths.
