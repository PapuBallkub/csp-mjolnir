# 0030 · Lock-spec risk criteria and scoring algorithm

Status: accepted · 2026-10-25

## Context

FR-21 requires GIPDP to visibly flag "high lock-spec risk" on TORs that exhibit statistically unusual, hyper-specific, or discriminatory qualification requirements (accompanied by FR-20 baseline checks).

In Thai government procurement, **Section 9 of the Public Procurement and Supplies Administration Act B.E. 2560 (พ.ร.บ. จัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560)** explicitly mandates that agencies establish open specifications and strictly prohibits setting conditions that favor or disadvantage specific vendors (*ห้ามมิให้กำหนดคุณลักษณะเฉพาะให้ใกล้เคียงกับยี่ห้อใดยี่ห้อหนึ่ง หรือของผู้ขายรายใดรายหนึ่งโดยเฉพาะ*).

Despite this statutory prohibition, procurement committees often insert subtle qualification barriers or narrow technical clauses—often directly lifted from an incumbent vendor's proprietary brochure or past contract. For small tech companies (SMEs) and freelance developers, spending weeks preparing bids for tenders with hidden disqualify-on-sight clauses leads to wasted operational capital and exclusion from public contracts.

Three architectural questions arise for automated risk detection:
1. **How should lock-spec signals be categorized and detected objectively from normalized TOR fields?**
2. **What point-weighting and scoring threshold should trigger a "High Risk" visual warning without creating false alarms?**
3. **How does the system maintain Section 7 of `AGENTS.md` ("Describe, don't accuse") while presenting evidence of bid tailoring?**

---

## Decision

### 1. Three Objective Lock-Spec Criteria Grounded in Comptroller General Circular ว 214

Rather than relying on non-deterministic LLM guessing at query time or arbitrary heuristics, the system applies **3 deterministic risk rules** over AI-extracted structured facts in `TorInsight` (`identification`, `facts`, `eligibility`, `technicalRequirements`), grounded strictly in the three core operative clauses of **หนังสือเวียน กวจ. ด่วนที่สุด ที่ กค (กวจ) 0405.2/ว 214 (ลงวันที่ 18 พฤษภาคม 2563)**:

#### Executive Summary Table

| Category | Trigger Condition in TOR | Severity & Points | Governing Instruments (เอกสารอ้างอิง) | Core Statutory Prohibition |
|---|---|:---:|---|---|
| **1. Vendor Lock-in** | MAF required for custom software development (`software-development` or `hire` + `manufacturerAuthorizations`) | `high`<br>**(35 pts)** | • พ.ร.บ. จัดซื้อจัดจ้างฯ 2560 (ม. 8, 9)<br>• หนังสือเวียน กวจ. ด่วนที่สุด ว 214 (ข้อ 1.1, 1.3) | ห้ามกำหนดหนังสือแต่งตั้งตัวแทนจำหน่าย (MAF) ในงานจ้างบริการ/จ้างพัฒนา |
| **2. Qualification Barrier** | Prior contract ratio $> 50\%$ of reference price / budget | `high`<br>**(35 pts)** | • พ.ร.บ. จัดซื้อจัดจ้างฯ 2560 (ม. 9)<br>• หนังสือเวียน กวจ. ด่วนที่สุด ว 214 (ข้อ 2) | ห้ามกำหนดผลงานเกินร้อยละ 50 ของวงเงินงบประมาณหรือราคากลาง |
| **3. Specification Tailoring** | Specifying locked proprietary brand or legacy runtime without "or equivalent" | `high`<br>**(35 pts)** | • พ.ร.บ. จัดซื้อจัดจ้างฯ 2560 (ม. 9)<br>• หนังสือเวียน กวจ. ด่วนที่สุด ว 214 (ข้อ 3) | ห้ามระบุชื่อยี่ห้อเป็นการเฉพาะเจาะจง เว้นแต่ระบุ "หรือเทียบเท่า" |

---

#### Detailed Legal Breakdown & Market Rationale

Below is the granular separation of each cited legal instrument, what each specific document mandates, and why violating the principle harms open competition for SMEs:

##### Category 1: Vendor Lock-in & Reseller Letters (`Vendor Lock-in`)
- **Trigger in TOR:** Custom software development project (`identification.category === 'software-development'` or `procurementKind === 'hire'`) demanding Manufacturer Authorization Form (MAF) or Exclusive Partnership Certificates (`eligibility.manufacturerAuthorizations`).
- **Severity & Points:** `high` (35 points).
- **Governing Legal Instruments & What Each Document Mandates:**
  - 📜 **พ.ร.บ. การจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560 (มาตรา 8 และมาตรา 9)**
    - *มาตรา 8:* การจัดซื้อจัดจ้างต้องเป็นไปตามหลักความคุ้มค่า โปร่งใส มีประสิทธิภาพและประสิทธิผล และ **"เปิดโอกาสให้มีการแข่งขันอย่างเป็นธรรม"**
    - *มาตรา 9:* **"ห้ามมิให้กำหนดคุณลักษณะเฉพาะของพัสดุให้ใกล้เคียงกับยี่ห้อใดยี่ห้อหนึ่ง หรือของผู้ขายรายใดรายหนึ่งโดยเฉพาะ"** หรือกำหนดเงื่อนไขที่ทำให้เกิดการได้เปรียบเสียเปรียบระหว่างผู้ยื่นข้อเสนอด้วยกัน
  - 📋 **หนังสือเวียน กวจ. ด่วนที่สุด ที่ กค (กวจ) 0405.2/ว 214 ลงวันที่ 18 พฤษภาคม 2563**
    - *ข้อ 1.1:* การกำหนดหนังสือรับรองหรือแต่งตั้งตัวแทนจำหน่าย (MAF) อนุญาตให้กำหนดได้เฉพาะกรณี **"งานซื้อครุภัณฑ์หลัก"** เท่านั้น
    - *ข้อ 1.3:* ในงานจ้างบริการ งานจ้างพัฒนาระบบ หรืองานซื้อพัสดุทั่วไป **"ห้ามมิให้กำหนดหนังสือแต่งตั้งตัวแทนจำหน่ายโดยเด็ดขาด"** และห้ามกำหนดเงื่อนไขที่มีผลทำให้มีผู้ยื่นข้อเสนอได้เพียงรายเดียว
- **Market & SME Reality (ผลกระทบต่อ SME และการแข่งขัน):**
  - งานจ้างพัฒนาซอฟต์แวร์เป็นการจ้างแรงงานวิชาชีพ การนำเงื่อนไขหนังสือแต่งตั้งตัวแทนจำหน่ายมาบังคับใช้ ทำให้ SME ไทยที่เชี่ยวชาญการเขียนโปรแกรมถูกตัดสิทธิ์ทันที เพราะบริษัทเจ้าของแพลตฟอร์มต่างชาติมักออกหนังสือ MAF ให้เฉพาะบริษัทคู่ค้าผูกขาด (Exclusive Partner) เพียง 1–2 รายในประเทศเท่านั้น
- **Note on Scope & Legal Hierarchy (ขอบเขตการตรวจจับและลำดับชั้นทางกฎหมาย):**
  - *Data Scope:* ฟิลด์ `eligibility.manufacturerAuthorizations` ไม่ได้จำกัดเฉพาะคำว่า "MAF" เท่านั้น แต่ครอบคลุมหนังสือจำกัดสิทธิ์จากผู้ผลิตทุกประเภท เช่น (1) หนังสือแต่งตั้งตัวแทนจำหน่าย (MAF), (2) หนังสือรับรองการเป็นคู่ค้าหรือพันธมิตร (Partner Certificate เช่น Gold / Premier Partner), และ (3) หนังสือรับรองการสนับสนุนทางเทคนิคหรือยินยอมให้ใช้สิทธิ์ (Letter of Support)
  - *Legal Relationship:* พ.ร.บ. จัดซื้อจัดจ้างฯ มาตรา 8 และ 9 เป็นกฎหมายหลักที่บัญญัติหลักการห้ามกำหนดเงื่อนไขกีดกันหรือเอื้อประโยชน์ ส่วนหนังสือเวียน ว 214 (ข้อ 1.3) คือระเบียบปฏิบัติที่เจาะจงห้ามการใช้หนังสือกลุ่มนี้ในงานจ้างบริการและงานจ้างพัฒนาโดยตรง

##### Category 2: Disproportionate Past Experience Barriers (`Qualification Barrier`)
- **Trigger in TOR:** Minimum single previous contract requirement (`eligibility.previousExperienceMinTHB`) exceeding the statutory 50% ceiling relative to Reference Price (or Budget fallback):
  - $\text{Ratio} > 0.50$ ($> 50\%$ of reference price/budget): `high` (35 points)
- **Governing Legal Instruments & What Each Document Mandates:**
  - 📜 **พ.ร.บ. การจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560 (มาตรา 9)**
    - กำหนดให้การกำหนดคุณสมบัติผู้ยื่นข้อเสนอต้องเปิดกว้าง เท่าเทียม และไม่สร้างภาระหรือเงื่อนไขกีดกันการแข่งขันเกินความจำเป็นของงาน
  - 📋 **หนังสือเวียน กวจ. ด่วนที่สุด ที่ กค (กวจ) 0405.2/ว 214 (ข้อ 2: แนวทางการกำหนดผลงาน)**
    - ในงานจ้างที่ไม่ใช่งานก่อสร้าง (งานจ้างบริการ/พัฒนาระบบ) **"หลักการทั่วไปคือห้ามกำหนดผลงาน"** เพื่อเปิดโอกาสให้ผู้ประกอบการรายใหม่
    - หากมีความจำเป็นทางเทคนิคที่ต้องกำหนดผลงาน **"ให้กำหนดมูลค่าผลงานได้ไม่เกินร้อยละ 50 ของวงเงินงบประมาณหรือราคากลาง"** และต้องเป็นสัญญาเดี่ยวในประเภทงานเดียวกัน
- **Market & SME Reality (ผลกระทบต่อ SME และการแข่งขัน):**
  - การกำหนดมูลค่าผลงานขั้นต่ำสูงเกิน 50% ขัดแย้งกับเพดานตามหนังสือเวียนอย่างชัดเจน ทำให้ผู้ประกอบการ SME หรือ Tech Startup ที่เพิ่งเติบโตไม่สามารถเข้าประมูลได้ ส่งผลให้มีเพียงบริษัทคู่สัญญาเดิม (Incumbent) รายเดียวที่ผ่านเกณฑ์คุณสมบัติ

##### Category 3: Specification Tailoring & Legacy Runtime Locking (`Specification Tailoring`)
- **Trigger in TOR:** Specific proprietary commercial edition or obsolete legacy runtime specified where open standards are established practice (`technicalRequirements.requiredTechnologies`).
- **Severity & Points:** `high` (35 points).
- **Governing Legal Instruments & What Each Document Mandates:**
  - 📜 **พ.ร.บ. การจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560 (มาตรา 9)**
    - ห้ามมิให้กำหนดรายละเอียดคุณลักษณะเฉพาะของพัสดุให้ใกล้เคียงกับยี่ห้อใดยี่ห้อหนึ่ง หรือของผู้ขายรายใดรายหนึ่งโดยเฉพาะ
  - 📋 **หนังสือเวียน กวจ. ด่วนที่สุด ที่ กค (กวจ) 0405.2/ว 214 (ข้อ 3: การกำหนดคุณลักษณะเฉพาะและชื่อยี่ห้อ)**
    - **"ห้ามระบุชื่อยี่ห้อหรือรุ่นเป็นการเฉพาะเจาะจง"**
    - หากจำเป็นต้องระบุชื่อยี่ห้อหรือรุ่นเพื่อความเข้ากันได้กับระบบเดิม **"จะต้องระบุคำว่า 'หรือเทียบเท่า' ไว้ด้วยเสมอ"** เพื่อเปิดโอกาสให้ผู้ยื่นข้อเสนอสามารถนำเสนอผลิตภัณฑ์หรือเทคโนโลยีอื่นที่มีคุณสมบัติการทำงานเทียบเคียงกันได้
- **Market & SME Reality (ผลกระทบต่อ SME และการแข่งขัน):**
  - การล็อกสเปกไปยังรุ่น Proprietary เฉพาะ (เช่น บังคับ Commercial Database หรือ Windows Server เวอร์ชันที่ตกรุ่นไปแล้ว) โดยไม่เปิดให้ใช้ระบบเทียบเท่าหรือเทคโนโลยี Open Source เป็นการกีดกันทางเทคนิคที่ออกแบบมาเพื่อให้เฉพาะตัวแทนที่มีสต็อกสินค้านั้น หรือผู้ดูแลระบบเดิมเท่านั้นที่ยื่นข้อเสนอได้

---

### 2. Composite Risk Scoring Algorithm ($\text{score} \in [0, 100]$)

Each evaluated TOR produces zero or more distinct findings ($f \in F$). The composite risk score is calculated as:

$$\text{riskScore} = \min\left(100, \sum_{f \in F} \text{points}(f)\right)$$

Where:
- $\text{points}(\text{'high'}) = 35$
- $\text{points}(\text{'medium'}) = 15$
- $\text{points}(\text{'low'}) = 5$

#### Risk Tiers & Visual Badging

| Risk Score | Risk Tier | Indicator Token | Catalog & Detail Page Copy | System Action |
|:---:|:---:|:---:|---|---|
| **$0 \le \text{score} < 35$** | `low` | Neutral / Green (`text-open`) | *"ความเสี่ยงต่ำ: ข้อกำหนดเปิดกว้างตามมาตรฐาน"* | Normal status badge. Catalog filter classifies as standard open competition. |
| **$35 \le \text{score} < 70$** | `medium` | Amber (`text-amend`) | *"ความเสี่ยงปานกลาง: มีเงื่อนไขที่อาจจำกัดการแข่งขันบางส่วน"* | Amber advisory badge (triggered by 1 high finding). Findings displayed as expandable cautions. |
| **$\text{score} \ge 70$** | `high` | Crimson (`text-risk`) | *"ความเสี่ยงสูง: พบเงื่อนไขที่อาจจำกัดการแข่งขันเฉพาะราย"* | Prominent Crimson risk badge on catalog card and top-level alert box on detail page (triggered by 2+ high findings). |

---

### 3. Data Model Conformance (`findingSchema`)

Every detected lock-spec signal is stored as a structured sub-document in `TorInsight.analytics.lockSpec.findings`:
- `id`: Unique identifier (e.g., `FIND-<projectId>-01`)
- `title`: Concise, human-readable summary of the finding
- `category`: Category string (`Vendor Lock-in`, `Qualification Barrier`, `Specification Tailoring`)
- `requirementText`: Paraphrased requirement clause from the TOR
- `normalBenchmark`: The established statutory or industry baseline
- `sourceExcerpt`: Verbatim quote from the TOR document for auditing
- `sourceLocation`: Page and section reference (e.g., `"หน้า 8 · ข้อ 3.4"`)
- `severity`: `'high' | 'medium' | 'low'`

---

### 4. Non-Accusatory Evidence Trail (AGENTS.md Section 7)

In strict accordance with platform design principles:
- The system **never claims corrupt intent or conspiracy** (no terms like "ทุจริต", "ฮั้วประมูล", or "กีดกันอย่างผิดกฎหมาย").
- Findings describe observable deviations against public regulations:
  - *Correct:* *"กำหนดมูลค่าผลงานขั้นต่ำ 83.3% ของราคากลาง ซึ่งเกินเพดาน 50% ตามหนังสือเวียน ว 214 ข้อ 2"*
  - *Forbidden:* *"หน่วยงานฮั้วประมูล ล็อกสเปกเอื้อประโยชน์บริษัทเดิม"*
- Every finding links directly to the cited page and section in the government PDF, allowing the user to verify the clause for themselves.

---

## Consequences

- **Objective and Defensible:** Grounded directly in Section 9 of the Thai Public Procurement Act B.E. 2560 and the three core clauses of Comptroller General's Circular ว 214, protecting the platform from liability.
- **Fast and Repeatable (< 5ms):** Runs in deterministic Node.js code over extracted schema fields without runtime LLM costs or token latency.
- **Saves SME Capital:** Small software houses immediately see whether a tender contains dealbreaker certification or experience barriers before spending weeks on bid preparation.
- **Frontend Synergy:** Directly maps to `LockSpecBadge`, `catalog-row`, and the `LockSpecModule` on the detail page (`/tor/[id]`).
