# Feature Specification: Lock-Spec Risk Detection (FR-21)

**Feature:** Lock-Specification Risk Scoring & Qualification Barrier Detection  
**Related Requirements:**  
- `FR-20`: Compare a TOR's technical and qualification requirements against normalized historical baselines.  
- `FR-21`: Visibly flag "high lock-spec risk" on TORs with statistically unusual or hyper-specific requirements.  
- `NFR-15`: Thai primary locale with transparent, non-accusing copy ("Describe, don't accuse").  
**Related Decisions:**  
- [`0010 · Normalized TOR Detail Information`](../decisions/0010-normalized-tor-detail-Information.md)  
- [`0014 · Price names and data rules for TorInsight`](../decisions/0014-price-names-and-insight-data-rules.md)  
- [`0021 · Define comparable projects by architecture and complexity`](../decisions/0021-find-comparable-projects.md)  
- [`0030 · Lock-spec risk criteria and scoring algorithm`](../decisions/0030-lock-spec-risk-criteria-and-scoring.md)  
**Status:** Approved  
**Audience:** Product Owners, Developers, Domain Experts, SME Bidders, and Platform Users  

---

## 1. Feature Purpose (ทำไมต้องมีฟีเจอร์นี้ และทำหน้าที่อะไร)

### 1.1 The Problem It Solves
In Thai government IT procurement, small software companies (SMEs) and freelance developers face a severe, invisible hurdle: **Qualification Lock-Spec (การล็อกสเปกกีดกันทางการค้า)**.
- Official tender documents (TOR) are typically 30–60 page PDFs written in dense bureaucratic Thai (*ภาษาราชการ*).
- An SME might spend 3 weeks of unpaid labor preparing team CVs, project schedules, and architecture diagrams, only to be disqualified on day one because clause 3.4 required an official Manufacturer Authorization Form (MAF) from an American software vendor, or demanded past contract experience equal to 90% of the project budget.
- Currently, only entrenched government contractor cartels know which tenders are genuinely open and which have been pre-arranged for an insider.

### 1.2 What This Feature Does
The **Lock-Spec Risk Detection** feature automatically scans the extracted qualification criteria, licensing terms, and tech stacks of every TOR:
1. It analyzes clauses against **4 statutory lock-spec criteria** grounded in the Thai Public Procurement Act B.E. 2560 (Section 9) and Comptroller General's Department guidelines.
2. It generates self-contained **evidence findings**, citing the exact clause text, page number, and standard market benchmark.
3. It computes an objective **Risk Score ($0–100$)** and assigns a visual risk tier (`low`, `medium`, `high`).
4. It provides clear, plain-language Thai copy informing the bidder whether the tender offers fair open competition or presents significant bid-tailoring barriers.

### 1.3 Guiding Principle: "Describe, Don't Accuse" (AGENTS.md Section 7)
In strict adherence to GIPDP design guidelines:
- The system presents **factual evidence and regulatory deviations**.
- It **never accuses** agencies or officials of corruption or criminal intent (strictly avoiding words like "ทุจริต", "ฮั้วประมูล", or "โกง").
- Tenders with restrictive clauses are neutrally labeled: *"พบเงื่อนไขที่อาจจำกัดการแข่งขันเฉพาะราย"* (Found conditions that may restrict competition to specific vendors).

---

## 2. The 4 Lock-Spec Risk Categories

```
                       ┌──────────────────────────────────────────────┐
                       │           Lock-Spec Risk Taxonomy            │
                       └──────────────────────┬───────────────────────┘
                                              │
         ┌──────────────────┬─────────────────┴────────────────┬──────────────────┐
         ▼                  ▼                                  ▼                  ▼
   1. Vendor Lock-in   2. Qualification Barriers         3. Disproportionate    4. Spec Tailoring
      (MAF / Reseller)    (Prior Contract Ratio)            Certs & Staff          (Legacy/Niche)
```

### Category 1: Vendor Lock-in & Reseller Letters (`Vendor Lock-in`)
- **What it is:** Requiring a Manufacturer Authorization Form (MAF / หนังสือแต่งตั้งตัวแทนจำหน่าย) or official partnership certificate on a custom software development contract (`software-development` or `procurementKind === 'hire'`).
- **Severity & Points:** `high` (**30 points**).
- **Governing Legal Instruments & What Each Document Mandates:**
  - 📜 **พ.ร.บ. การจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560 (มาตรา 8 และมาตรา 9):** มาตรา 8 กำหนดหลักการแข่งขันอย่างเป็นธรรม; มาตรา 9 บัญญัติห้ามมิให้กำหนดคุณลักษณะเฉพาะให้ใกล้เคียงกับยี่ห้อใดยี่ห้อหนึ่ง หรือของผู้ขายรายใดรายหนึ่งโดยเฉพาะ หรือกำหนดเงื่อนไขที่ทำให้เกิดการได้เปรียบเสียเปรียบ
  - 📋 **หนังสือเวียน กวจ. ด่วนที่สุด ที่ กค (กวจ) 0405.2/ว 214 ลงวันที่ 18 พฤษภาคม 2563 (ข้อ 1.1 และ 1.3):** ข้อ 1.1 อนุญาตให้กำหนดหนังสือตัวแทนจำหน่าย (MAF) ได้เฉพาะใน "งานซื้อครุภัณฑ์หลัก" เท่านั้น; ข้อ 1.3 สั่งการว่าในงานจ้างบริการ งานจ้างพัฒนาระบบ หรืองานซื้อพัสดุทั่วไป **"ห้ามมิให้กำหนดหนังสือแต่งตั้งตัวแทนจำหน่ายโดยเด็ดขาด"**
- **Why it's a barrier (ผลกระทบต่อ SME):** Custom software development is professional engineering labor, not commodity box-dropping. Forcing an MAF imports a hardware lock-in trick into software, handing the contract exclusively to 1 or 2 pre-selected local partners.

### Category 2: Disproportionate Past Experience Barriers (`Qualification Barrier`)
- **What it is:** Requiring a single previous past contract value exceeding standard government ratios:
  - Ratio $> 80\%$ of budget / ref price: `high` (**30 points**).
  - Ratio $> 50\%$ and $\le 80\%$: `medium` (**15 points**).
- **Governing Legal Instruments & What Each Document Mandates:**
  - 📜 **พ.ร.บ. การจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560 (มาตรา 9):** คุณสมบัติผู้ยื่นข้อเสนอต้องเปิดกว้างและไม่สร้างภาระหรือเงื่อนไขกีดกันการแข่งขันเกินความจำเป็นของงาน
  - 📋 **หนังสือเวียน กวจ. ด่วนที่สุด ที่ กค (กวจ) 0405.2/ว 214 (ข้อ 2: แนวทางการกำหนดผลงาน):** ในงานจ้างบริการหรืองานจ้างทั่วไปที่ไม่ใช่งานก่อสร้าง **"หลักการทั่วไปคือห้ามกำหนดผลงาน"**; หากจำเป็นต้องกำหนด **"ให้กำหนดได้ไม่เกินร้อยละ 50 ของวงเงินงบประมาณหรือราคากลาง"** และต้องเป็นสัญญาเดี่ยวในประเภทงานเดียวกัน
- **Why it's a barrier (ผลกระทบต่อ SME):** Setting past contract ceilings above 50% (and especially over 80%) shuts out newer or mid-sized IT startups, ensuring only the existing contractor who previously won the job qualifies.

### Category 3: Disproportionate Certifications & Team Sizing (`Personnel Barrier`)
- **What it is:** Requiring enterprise-level capability frameworks (e.g. **CMMI Level 3/5**, **ISO 27001**) on small municipal or agency projects with Reference Price $\le ฿5,000,000$.
- **Severity & Points:** `medium` (**15 points**) on budgets $\le ฿5\text{M}$.
- **Governing Legal Instruments & What Each Document Mandates:**
  - 📜 **กฎกระทรวง กำหนดพัสดุและวิธีการจัดซื้อจัดจ้างพัสดุที่รัฐต้องการส่งเสริมหรือสนับสนุน (ฉบับที่ 2) พ.ศ. 2563:** บัญญัติมาตรการส่งเสริมผู้ประกอบการ SME และห้ามหน่วยงานรัฐกำหนดเงื่อนไขที่เป็นอุปสรรคต่อการเข้าถึงงานของ SME
  - 📋 **คู่มือและแนวทางการจัดหาระบบคอมพิวเตอร์ภาครัฐ โดย สพร. (DGA) และกระทรวงดิจิทัลเพื่อเศรษฐกิจและสังคม (DES):** กำหนดว่าการเรียกใบรับรองระดับสากล เช่น CMMI หรือ ISO 27001 ต้องได้สัดส่วนกับขนาดของงาน (Proportionality Principle) โดยใช้กับงานระบบโครงสร้างพื้นฐานวิกฤตขนาดใหญ่เท่านั้น **ไม่ควรกำหนดในโครงการขนาดเล็ก**
- **Why it's a barrier (ผลกระทบต่อ SME):** Maintaining CMMI/ISO audits costs ฿1M–฿3M/year. Demanding this on a ฿3M–฿5M departmental website or CRUD app does not protect code quality; it acts as a financial tollgate filtering out 95% of Thai tech SMEs.

### Category 4: Specification Tailoring & Legacy Runtime Locking (`Specification Tailoring`)
- **What it is:** Mandating a specific proprietary commercial edition, obsolete legacy runtime, or end-of-life operating system where open standards are established practice, without permitting equivalent alternatives.
- **Severity & Points:** `high` (**30 points**).
- **Governing Legal Instruments & What Each Document Mandates:**
  - 📜 **พ.ร.บ. การจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. 2560 (มาตรา 9):** ห้ามมิให้กำหนดคุณลักษณะเฉพาะให้ใกล้เคียงกับยี่ห้อใดยี่ห้อหนึ่ง หรือของผู้ขายรายใดรายหนึ่งโดยเฉพาะ
  - 📋 **หนังสือเวียน กวจ. ด่วนที่สุด ที่ กค (กวจ) 0405.2/ว 214 (ข้อ 3: การกำหนดคุณลักษณะเฉพาะและชื่อยี่ห้อ):** **"ห้ามระบุชื่อยี่ห้อหรือรุ่นเป็นการเฉพาะเจาะจง"**; หากจำเป็นต้องระบุชื่อยี่ห้อเพื่อความเข้ากันได้กับระบบเดิม **"จะต้องระบุคำว่า 'หรือเทียบเท่า' ไว้ด้วยเสมอ"**
- **Why it's a barrier (ผลกระทบต่อ SME):** Forcing hyper-specific commercial brands without an "or equivalent" clause blocks modern, cost-effective open-source alternatives and restricts bids to vendors who hold legacy distributor arrangements.

---

## 3. Scoring System & Risk Tiers

The composite risk score sums the severity points of all detected findings, capped at 100:

$$\text{riskScore} = \min\left(100, \sum \text{severity\_points}\right)$$

Where:
- `high` finding = **+30 points**
- `medium` finding = **+15 points**
- `low` finding = **+5 points**

### Risk Tiers & UI Presentation

| Risk Score | Tier | Badge Token | Catalog & Detail Copy | Operational Meaning |
|:---:|:---:|:---:|---|---|
| **$0 \le \text{score} < 35$** | `low` | Neutral / Green (`text-open`) | *"ความเสี่ยงต่ำ: ข้อกำหนดเปิดกว้างตามมาตรฐาน"* | **Fair competition.** Standard qualification terms; highly recommended for SMEs to bid. |
| **$35 \le \text{score} < 70$** | `medium` | Amber (`text-amend`) | *"ความเสี่ยงปานกลาง: มีเงื่อนไขที่อาจจำกัดการแข่งขันบางส่วน"* | **Proceed with caution.** Some restrictive terms (e.g. elevated past experience or specialized certs). |
| **$\text{score} \ge 70$** | `high` | Crimson (`text-risk`) | *"ความเสี่ยงสูง: พบเงื่อนไขที่อาจจำกัดการแข่งขันเฉพาะราย"* | **High barrier.** Multiple heavy lock-in signals; small teams should avoid wasting proposal effort. |

---

## 4. Result Data Dictionary (`TorInsight.analytics.lockSpec`)

| Field | Type | Description | Sample Value |
|---|---|---|---|
| `riskScore` | `Number` | Composite lock-spec score from 0 (clean) to 100 (maximum risk). | `75` |
| `verdictText` | `String` | Human-readable Thai summary verdict displayed on badges and banners. | `"ความเสี่ยงสูง: พบเงื่อนไขที่อาจจำกัดการแข่งขันเฉพาะราย"` |
| `findings` | `[Finding]` | Array of individual detected lock-spec clauses (see finding fields below). | *(Array of findings)* |

### 4.1 Finding Sub-Document Structure (`findingSchema`)

| Field | Type | Description | Sample Value |
|---|---|---|---|
| `id` | `String` | Unique finding ID for keying and audit tracing. | `"FIND-68039469567-01"` |
| `title` | `String` | Concise heading describing the specific qualification anomaly. | `"กำหนดหนังสือแต่งตั้งตัวแทนจำหน่าย (MAF) ในงานจ้างพัฒนาซอฟต์แวร์"` |
| `category` | `String` | High-level taxonomy grouping. | `"Vendor Lock-in"` |
| `requirementText` | `String` | Paraphrased or direct clause text from the tender document. | `"ผู้ยื่นข้อเสนอต้องแนบหนังสือแต่งตั้งตัวแทนจำหน่ายอย่างเป็นทางการจากผู้ผลิต"` |
| `normalBenchmark` | `String` | The standard market or statutory benchmark for comparison. | `"งานจ้างพัฒนาโปรแกรมทั่วไปไม่กำหนดหนังสือแต่งตั้งตัวแทนจำหน่าย"` |
| `sourceExcerpt` | `String` | Verbatim text quote cited directly from the scanned PDF. | `"หน้า 8 ข้อ 3.4 ผู้ยื่นข้อเสนอต้องเป็นตัวแทนจำหน่ายที่ได้รับการแต่งตั้ง..."` |
| `sourceLocation` | `String` | Page and clause location in the original government document. | `"หน้า 8 · ข้อ 3.4"` |
| `severity` | `String` | Impact level (`'high'`, `'medium'`, `'low'`). | `"high"` |

---

## 5. Complete Result Examples

### Example 1: High Lock-Spec Risk Tender (ความเสี่ยงสูง — พบลักษณะกีดกันทางการค้า)
A ฿3,000,000 web portal project that demands an MAF letter and past experience of ฿2.6M (86.7% of budget):

```json
{
  "analytics": {
    "lockSpec": {
      "riskScore": 75,
      "verdictText": "ความเสี่ยงสูง: พบเงื่อนไขที่อาจจำกัดการแข่งขันเฉพาะราย",
      "findings": [
        {
          "id": "FIND-68039469567-01",
          "title": "กำหนดหนังสือแต่งตั้งตัวแทนจำหน่าย (MAF) ในงานจ้างพัฒนาซอฟต์แวร์",
          "category": "Vendor Lock-in",
          "requirementText": "ผู้ยื่นข้อเสนอต้องแนบหนังสือแต่งตั้งตัวแทนจำหน่ายอย่างเป็นทางการจากเจ้าของลิขสิทธิ์ซอฟต์แวร์",
          "normalBenchmark": "งานจ้างพัฒนาซอฟต์แวร์ทั่วไปประเมินจากทักษะและผลงานของทีมพัฒนา ไม่กำหนดหนังสือตัวแทนจำหน่าย",
          "sourceExcerpt": "ข้อ 3.4 ผู้ยื่นข้อเสนอต้องแนบหนังสือแต่งตั้งตัวแทนจำหน่าย (Manufacturer Authorization Form) อย่างเป็นทางการ...",
          "sourceLocation": "หน้า 7 · ข้อ 3.4",
          "severity": "high"
        },
        {
          "id": "FIND-68039469567-02",
          "title": "กำหนดมูลค่าผลงานขั้นต่ำเกิน 80% ของราคากลาง",
          "category": "Qualification Barrier",
          "requirementText": "มีผลงานประเภทเดียวกันในสัญญาเดียวไม่น้อยกว่า 2,600,000 บาท (คิดเป็น 86.7% ของราคากลาง 3.0 ล้านบาท)",
          "normalBenchmark": "ตามระเบียบกระทรวงการคลังและแนวทางมาตรฐาน ผลงานขั้นต่ำไม่ควรเกิน 50% ของราคากลาง",
          "sourceExcerpt": "ข้อ 2.1 มีผลงานการพัฒนาระบบที่มีลักษณะใกล้เคียงกันในสัญญาเดียว วงเงินไม่น้อยกว่า 2,600,000 บาท...",
          "sourceLocation": "หน้า 4 · ข้อ 2.1",
          "severity": "high"
        },
        {
          "id": "FIND-68039469567-03",
          "title": "กำหนดใบรับรอง CMMI Level 3 สำหรับโครงการงบประมาณไม่เกิน 5 ล้านบาท",
          "category": "Personnel Barrier",
          "requirementText": "บริษัทต้องได้รับการรับรองมาตรฐานกระบวนการพัฒนาซอฟต์แวร์ CMMI ไม่น้อยกว่า Level 3",
          "normalBenchmark": "มาตรฐาน CMMI นิยมกำหนดเฉพาะในโครงการโครงสร้างพื้นฐานระดับองค์กรขนาดใหญ่ (งบประมาณ > 10 ล้านบาท)",
          "sourceExcerpt": "ข้อ 2.6 ต้องแนบเอกสารรับรองมาตรฐาน CMMI Level 3 ที่ยังไม่หมดอายุ...",
          "sourceLocation": "หน้า 5 · ข้อ 2.6",
          "severity": "medium"
        }
      ]
    }
  }
}
```

### Example 2: Clean, Open Competition Tender (ความเสี่ยงต่ำ — ข้อกำหนดเปิดกว้าง)
A ฿2,500,000 mobile application tender with standard open terms and fair experience requirements (฿1.0M = 40% of budget):

```json
{
  "analytics": {
    "lockSpec": {
      "riskScore": 0,
      "verdictText": "ความเสี่ยงต่ำ: ข้อกำหนดเปิดกว้างตามมาตรฐาน",
      "findings": []
    }
  }
}
```
