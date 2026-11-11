import type { TorInsightDetail } from "../../../_lib/api";
import { AccentPanel, Label, Panel, SectionHeading } from "../../ui";
import { ChangeEntry, formatDateString, formatMoney } from "../_lib/tor-helpers";

export function EligibilityHistoryTab({
  insight,
}: {
  insight: TorInsightDetail;
}) {
  const elig = insight.eligibility;
  const conditions = insight.contractConditions;
  const changes = insight.amendments ?? [];
  const amend = insight.amendmentInfo;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. BID ELIGIBILITY & QUALIFICATIONS */}
      <Panel className="px-4 py-5 sm:px-6 sm:py-6">
        <SectionHeading sub="เกณฑ์คุณสมบัติของผู้ยื่นข้อเสนอ มูลค่าผลงานขั้นต่ำ และมาตรฐานที่ต้องมี">
          คุณสมบัติผู้ยื่นข้อเสนอ (Eligibility)
        </SectionHeading>

        <div className="mt-3 flex flex-col gap-4">
          {/* Previous Experience */}
          {elig.previousExperience || elig.previousExperienceMinTHB ? (
            <div className="rounded-[3px] border border-line bg-surface-2/40 p-3.5">
              <Label>ผลงานในอดีตขั้นต่ำ (Previous Experience)</Label>
              <p className="mt-1 text-[14px] font-medium leading-thai text-ink">
                {elig.previousExperience || (
                  `สัญญาเดียวไม่น้อยกว่า ${formatMoney(elig.previousExperienceMinTHB)}`
                )}
              </p>
            </div>
          ) : null}

          {/* Company Requirements */}
          {elig.companyRequirements && elig.companyRequirements.length > 0 ? (
            <div>
              <Label>คุณสมบัติทางนิติบุคคล</Label>
              <ul className="mt-1 flex flex-col gap-1.5">
                {elig.companyRequirements.map((req, idx) => (
                  <li key={idx} className="flex gap-2 text-[13px] leading-thai text-ink-2">
                    <span className="text-ink-3">✓</span>
                    <span>{req}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Certifications */}
          {elig.requiredCertifications && elig.requiredCertifications.length > 0 ? (
            <div>
              <Label>ใบรับรองมาตรฐานสากล (ISO / CMMI)</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {elig.requiredCertifications.map((cert, idx) => (
                  <span
                    key={idx}
                    className="rounded border border-line bg-surface px-2 py-1 text-[12px] font-medium text-ink"
                  >
                    {cert}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Manufacturer Authorization */}
          {elig.manufacturerAuthorizations && elig.manufacturerAuthorizations.length > 0 ? (
            <div className="rounded-[3px] border border-amend-line bg-amend-bg/40 p-3">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-amend">
                <span>⚠️</span>
                <span>หนังสือแต่งตั้งตัวแทนจำหน่าย (Manufacturer Authorization)</span>
              </div>
              <ul className="mt-1.5 flex flex-col gap-1">
                {elig.manufacturerAuthorizations.map((auth, idx) => (
                  <li key={idx} className="text-[13px] leading-thai text-ink">
                    {auth}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Panel>

      {/* 2. CONTRACT CONDITIONS */}
      <Panel className="px-4 py-5 sm:px-6 sm:py-6">
        <SectionHeading sub="การแบ่งจ่ายเงินงวด การส่งมอบ และเกณฑ์การพิจารณาคัดเลือก">
          เงื่อนไขสัญญาและการส่งมอบ
        </SectionHeading>

        <div className="mt-3 flex flex-col gap-3 text-[13.5px]">
          <div>
            <Label>เงื่อนไขการจ่ายเงิน (Payment Terms)</Label>
            <p className="mt-1 leading-thai text-ink-2">
              {conditions.paymentTerms || "ไม่ระบุใน TOR"}
            </p>
          </div>

          <div>
            <Label>เกณฑ์การพิจารณาตัดสิน (Evaluation Method)</Label>
            <p className="mt-1 leading-thai text-ink-2">
              {conditions.evaluationMethod || "ไม่ระบุใน TOR"}
            </p>
          </div>
        </div>
      </Panel>

      {/* 3. CHANGES & AMENDMENTS (FR-16) */}
      {changes.length > 0 || amend.isAmended ? (
        <AccentPanel tone="amend" id="changes" className="px-4 py-5 sm:px-6 sm:py-6">
          <SectionHeading sub="แสดงเฉพาะค่าที่เทียบกันได้ เช่น ตัวเลข วันที่ และรายการเทคโนโลยี ส่วนอื่นให้ดูจากเอกสารต้นฉบับ">
            ประวัติการเปลี่ยนแปลง
          </SectionHeading>

          {amend.amendmentSummary ? (
            <p className="mb-3 text-[14px] leading-thai text-ink">{amend.amendmentSummary}</p>
          ) : null}

          {changes.length > 0 ? (
            <ol className="flex flex-col gap-4">
              {[...changes].reverse().map((change, idx) => (
                <ChangeEntry
                  key={`${change.detectedAt ?? change.date ?? "change"}-${idx}`}
                  change={change}
                />
              ))}
            </ol>
          ) : (
            <p className="text-[13px] leading-thai text-ink-2">
              หน่วยงานประกาศเปลี่ยนแปลงประกาศเชิญชวน
              {amend.lastAmendedDate ? (
                <span className="tnum"> · {formatDateString(amend.lastAmendedDate)}</span>
              ) : null}
            </p>
          )}
        </AccentPanel>
      ) : null}
    </div>
  );
}
