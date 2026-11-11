import type { TorInsightDetail } from "../../../_lib/api";
import { Label, Panel, SectionHeading } from "../../ui";

export function OverviewTab({
  insight,
}: {
  insight: TorInsightDetail;
}) {
  const overview = insight.overview;
  const deliverables = insight.deliverables;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. PROJECT OVERVIEW */}
      <Panel className="px-4 py-5 sm:px-6 sm:py-6">
        <SectionHeading sub="วัตถุประสงค์และขอบเขตภาพรวมของงานจ้างตามเอกสาร TOR">
          วัตถุประสงค์และขอบเขตโครงการ
        </SectionHeading>

        {!overview.objective && !overview.highLevelScope && (!overview.majorComponents || overview.majorComponents.length === 0) ? (
          <p className="mt-3 text-[14px] leading-thai text-ink-3">
            ไม่มีรายละเอียดวัตถุประสงค์หรือขอบเขตระบุไว้ในเอกสาร TOR ฉบับนี้
          </p>
        ) : null}

        {overview.objective ? (
          <div className="mt-3">
            <Label>วัตถุประสงค์ (Objective)</Label>
            <p className="mt-1 text-[15px] leading-thai text-ink">
              {overview.objective}
            </p>
          </div>
        ) : null}

        {overview.highLevelScope ? (
          <div className="mt-4">
            <Label>ขอบเขตภาพรวม (High-level Scope)</Label>
            <p className="mt-1 text-[14px] leading-thai text-ink-2">
              {overview.highLevelScope}
            </p>
          </div>
        ) : null}

        {overview.majorComponents && overview.majorComponents.length > 0 ? (
          <div className="mt-5 border-t border-line/60 pt-4">
            <Label>องค์ประกอบหลักของงาน (Major Components)</Label>
            <ul className="mt-2 flex flex-col gap-2">
              {overview.majorComponents.map((item, idx) => (
                <li key={idx} className="flex gap-2.5 text-[14px] leading-thai text-ink">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-3" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>

      {/* 2. CONTRACTOR DELIVERABLES */}
      <Panel className="px-4 py-5 sm:px-6 sm:py-6">
        <SectionHeading sub="สิ่งที่ผู้รับจ้างต้องจัดทำและส่งมอบตามสัญญาเพื่อรับการตรวจรับ">
          สิ่งที่ต้องส่งมอบ (Deliverables)
        </SectionHeading>

        {(!deliverables.system || deliverables.system.length === 0) &&
        (!deliverables.implementation || deliverables.implementation.length === 0) &&
        (!deliverables.validation || deliverables.validation.length === 0) &&
        (!deliverables.supportingWork || deliverables.supportingWork.length === 0) ? (
          <div className="mt-3 rounded-[3px] border border-line bg-surface-2/40 p-4 text-[13px] leading-thai text-ink-3">
            ไม่มีการแจกแจงรายการสิ่งส่งมอบเฉพาะในเอกสาร TOR ฉบับนี้
          </div>
        ) : (
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {deliverables.system && deliverables.system.length > 0 ? (
              <div className="rounded-[3px] border border-line bg-surface-2/40 p-3.5">
                <h3 className="text-[13px] font-semibold text-ink">
                  📦 ระบบซอฟต์แวร์และเอกสารระบบ
                </h3>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {deliverables.system.map((item, idx) => (
                    <li key={idx} className="flex gap-2 text-[13px] leading-thai text-ink-2">
                      <span className="text-ink-3">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {deliverables.implementation && deliverables.implementation.length > 0 ? (
              <div className="rounded-[3px] border border-line bg-surface-2/40 p-3.5">
                <h3 className="text-[13px] font-semibold text-ink">
                  ⚙️ การติดตั้งและย้ายข้อมูล
                </h3>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {deliverables.implementation.map((item, idx) => (
                    <li key={idx} className="flex gap-2 text-[13px] leading-thai text-ink-2">
                      <span className="text-ink-3">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {deliverables.validation && deliverables.validation.length > 0 ? (
              <div className="rounded-[3px] border border-line bg-surface-2/40 p-3.5">
                <h3 className="text-[13px] font-semibold text-ink">
                  🔍 การทดสอบระบบและการตรวจรับ
                </h3>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {deliverables.validation.map((item, idx) => (
                    <li key={idx} className="flex gap-2 text-[13px] leading-thai text-ink-2">
                      <span className="text-ink-3">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {deliverables.supportingWork && deliverables.supportingWork.length > 0 ? (
              <div className="rounded-[3px] border border-line bg-surface-2/40 p-3.5">
                <h3 className="text-[13px] font-semibold text-ink">
                  🎓 การฝึกอบรมและการสนับสนุน
                </h3>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {deliverables.supportingWork.map((item, idx) => (
                    <li key={idx} className="flex gap-2 text-[13px] leading-thai text-ink-2">
                      <span className="text-ink-3">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </Panel>
    </div>
  );
}
