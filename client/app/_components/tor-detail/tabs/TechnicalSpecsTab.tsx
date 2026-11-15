import type { TorInsightDetail } from "../../../_lib/api";
import { prioritizeMatchedTechObjects } from "../../../_lib/catalog";
import { Chip, Label, Panel, SectionHeading } from "../../ui";

export function TechnicalSpecsTab({
  insight,
  matchedSkills = [],
}: {
  insight: TorInsightDetail;
  matchedSkills?: string[];
}) {
  const tech = insight.technicalRequirements;
  const integration = insight.integrationEnvironment;
  const ops = insight.operationalRequirements;

  const sortedTech = prioritizeMatchedTechObjects(tech.requiredTechnologies ?? [], matchedSkills);
  const matchCount = matchedSkills.length > 0
    ? sortedTech.filter((t) => matchedSkills.includes(t.name)).length
    : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. TECHNICAL REQUIREMENTS */}
      <Panel className="px-4 py-5 sm:px-6 sm:py-6">
        <SectionHeading sub="เทคโนโลยี สถาปัตยกรรมระบบ และข้อกำหนดประสิทธิภาพ">
          ข้อกำหนดด้านเทคนิค (Technical Requirements)
        </SectionHeading>

        {/* Technologies */}
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <Label>เทคโนโลยีที่กำหนดระบุไว้</Label>
            {matchCount > 0 ? (
              <span className="text-[11.5px] font-medium text-open">
                ตรงกับทักษะของคุณ {matchCount} รายการ
              </span>
            ) : null}
          </div>
          {!sortedTech || sortedTech.length === 0 ? (
            <p className="mt-2 text-[13px] text-ink-3">
              TOR นี้ไม่ได้ระบุเทคโนโลยีเฉพาะเจาะจง (เทคโนโลยีเปิด / ขึ้นกับข้อเสนอของผู้ยื่นข้อเสนอ)
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {sortedTech.map((t, idx) => {
                const isMatch = matchedSkills.includes(t.name);
                return (
                  <Chip
                    key={`${t.name}-${t.version ?? ""}-${idx}`}
                    className={isMatch ? "border-open-line bg-open-bg text-open font-medium" : ""}
                  >
                    {isMatch ? <span className="mr-1">✓</span> : null}
                    <span className="font-medium">{t.name}</span>
                    {t.version ? (
                      <span className="ml-1 opacity-70 font-mono text-[10px]">v{t.version}</span>
                    ) : null}
                  </Chip>
                );
              })}
            </div>
          )}
        </div>

        {/* Required Capabilities */}
        {tech.requiredCapabilities && tech.requiredCapabilities.length > 0 ? (
          <div className="mt-5 border-t border-line/60 pt-4">
            <Label>ขีดความสามารถที่ระบบต้องมี</Label>
            <ul className="mt-2 flex flex-col gap-2">
              {tech.requiredCapabilities.map((cap, idx) => (
                <li key={idx} className="flex gap-2 text-[13.5px] leading-thai text-ink-2">
                  <span className="text-ink-3">✓</span>
                  <span>{cap}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Infrastructure Specs */}
        {tech.infrastructureSpecifications && tech.infrastructureSpecifications.length > 0 ? (
          <div className="mt-5 border-t border-line/60 pt-4">
            <Label>ข้อกำหนดโครงสร้างพื้นฐานและฮาร์ดแวร์</Label>
            <div className="mt-2 divide-y divide-line rounded-[3px] border border-line bg-surface-2/30">
              {tech.infrastructureSpecifications.map((spec, idx) => (
                <div
                  key={idx}
                  className="flex flex-col sm:flex-row sm:items-center justify-between px-3.5 py-2 text-[13px]"
                >
                  <span className="font-medium text-ink">{spec.key}</span>
                  <span className="font-mono text-ink-2">{spec.spec}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Panel>

      {/* 2. INTEGRATION & EXISTING ENVIRONMENT */}
      <Panel className="px-4 py-5 sm:px-6 sm:py-6">
        <SectionHeading sub="ระบบเดิมที่ต้องเชื่อมต่อ สภาพแวดล้อมเครือข่าย และสถานที่ติดตั้ง">
          สภาพแวดล้อมและการเชื่อมต่อระบบเดิม
        </SectionHeading>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <Label>ระบบเดิมของหน่วยงานที่ต้องเชื่อมต่อ</Label>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {integration.existingSystems && integration.existingSystems.length > 0 ? (
                integration.existingSystems.map((item, idx) => (
                  <li key={idx} className="flex gap-2 text-[13px] leading-thai text-ink-2">
                    <span className="text-ink-3">→</span>
                    <span>{item}</span>
                  </li>
                ))
              ) : (
                <span className="text-[13px] text-ink-3">ไม่ระบุใน TOR</span>
              )}
            </ul>
          </div>

          <div>
            <Label>ช่องทางเชื่อมต่อ (APIs & Protocols)</Label>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {integration.interfacesAndApis && integration.interfacesAndApis.length > 0 ? (
                integration.interfacesAndApis.map((item, idx) => (
                  <li key={idx} className="flex gap-2 text-[13px] leading-thai text-ink-2">
                    <span className="text-ink-3">⇄</span>
                    <span>{item}</span>
                  </li>
                ))
              ) : (
                <span className="text-[13px] text-ink-3">ไม่ระบุใน TOR</span>
              )}
            </ul>
          </div>
        </div>

        {integration.deploymentLocation ? (
          <div className="mt-4 border-t border-line/60 pt-3 text-[13px]">
            <span className="text-ink-3">สถานที่ติดตั้ง/โฮสต์: </span>
            <span className="font-medium text-ink">{integration.deploymentLocation}</span>
          </div>
        ) : null}
      </Panel>

      {/* 3. IMPLEMENTATION & OPERATIONS */}
      <Panel className="px-4 py-5 sm:px-6 sm:py-6">
        <SectionHeading sub="การฝึกอบรม การสนับสนุนทางเทคนิค และเงื่อนไขการบำรุงรักษา">
          การดำเนินงานและการบำรุงรักษา
        </SectionHeading>

        <div className="mt-3 flex flex-col gap-4">
          {ops.technicalSupportAndSla ? (
            <div>
              <Label>ระดับการให้บริการ (SLA) และการสนับสนุน</Label>
              <p className="mt-1 text-[13.5px] leading-thai text-ink-2">
                {ops.technicalSupportAndSla}
              </p>
            </div>
          ) : null}

          {ops.training && ops.training.length > 0 ? (
            <div>
              <Label>การจัดฝึกอบรมบุคลากร</Label>
              <ul className="mt-1 flex flex-col gap-1">
                {ops.training.map((t, idx) => (
                  <li key={idx} className="flex gap-2 text-[13px] leading-thai text-ink-2">
                    <span className="text-ink-3">•</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
