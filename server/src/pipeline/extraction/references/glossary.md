## Glossary: Thai procurement terms

| Term in the TOR | What it means | Field |
|---|---|---|
| งบประมาณ, วงเงินงบประมาณ, วงเงินที่ได้รับจัดสรร | The budget the agency has set aside | `facts.budget` |
| ราคากลาง, ราคาอ้างอิง | The official reference price bids are judged against | `facts.referencePrice` |
| วันยื่นข้อเสนอ, กำหนดยื่นข้อเสนอ, ยื่นเอกสารภายในวันที่ | The bid submission deadline | `facts.submissionDeadline` |
| วันประกาศ, ประกาศ ณ วันที่ | The publication date | `facts.postedDate` |
| กำหนดส่งมอบ, ส่งมอบงานภายใน ... วัน | The delivery period | `facts.deliveryPeriodDays` |
| ระยะเวลาดำเนินการ, อายุสัญญา | The contract duration | `facts.contractDurationDays` |
| รับประกันความชำรุดบกพร่อง | The warranty | `facts.warrantyYears` |
| วิธีประกาศเชิญชวนทั่วไป (e-bidding), วิธีคัดเลือก, วิธีเฉพาะเจาะจง | The procurement method | `facts.procurementMethod` |
| ค่าปรับเป็นรายวัน ร้อยละ ... | The late-delivery penalty | `facts.penaltyClause` |
| ขอบเขตของงาน, รายละเอียดคุณลักษณะเฉพาะ | Scope of work and specifications | `deliverables`, `technicalRequirements` |
| หรือเทียบเท่า, หรือดีกว่า | "Or equivalent", "or better". Keep it in the quote; it changes what a requirement means. | quotes |
| คุณสมบัติของผู้ยื่นข้อเสนอ | Who may bid | `eligibility` |
| ผลงาน ... ไม่น้อยกว่า ... บาท | The past-work requirement and its minimum value | `eligibility.previousExperience`, `eligibility.previousExperienceMin` |
| หนังสือแต่งตั้งตัวแทนจำหน่าย, หนังสือรับรองจากผู้ผลิต | A manufacturer's authorization letter | `eligibility.manufacturerAuthorizations` |
| งวดงาน, งวดเงิน | Payment instalments | `contractConditions.paymentTerms` |
| เกณฑ์ราคา, เกณฑ์ราคาประกอบเกณฑ์อื่น | How bids are judged | `contractConditions.evaluationMethod` |
| การบำรุงรักษา, MA | Maintenance | `operationalRequirements.maintenance` |
| ระยะเวลาแก้ไข, SLA | Support response and fix times | `operationalRequirements.technicalSupportAndSla` |

Thai months: มกราคม 1, กุมภาพันธ์ 2, มีนาคม 3, เมษายน 4, พฤษภาคม 5, มิถุนายน 6, กรกฎาคม 7, สิงหาคม 8, กันยายน 9, ตุลาคม 10, พฤศจิกายน 11, ธันวาคม 12. Short forms such as ม.ค. and ส.ค. mean the same months.
