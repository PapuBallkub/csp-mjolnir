import { input, Panel, SectionHeading, textarea } from "../../../../../../_components/ui";
import { DynamicListEditor } from "../../ReviewEditorComponents";
import {
  FieldConfidenceBadge,
  FieldHeader,
  modInput,
  type ReviewSectionBaseProps,
} from "../ReviewFieldPrimitives";

export function OverviewDeliverablesSection({
  form,
  setField,
  diffsByField,
  onRevert,
  getFieldScore,
}: ReviewSectionBaseProps) {
  return (
    <>
      {/* SECTION 3: Project Overview & Scope */}
      <Panel id="sec-overview" className="p-5 scroll-mt-[135px]">
        <div className="border-b border-line pb-3">
          <SectionHeading>{"3. ภาพรวมโครงการและขอบเขตงาน"}</SectionHeading>
          <p className="text-[12px] text-ink-3 mt-1">
            {"วัตถุประสงค์ สถาปัตยกรรมระบบ และขอบเขตงานภาพรวม"}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <div>
            <FieldHeader
              label={"วัตถุประสงค์โครงการ"}
              fieldKey="objective"
              htmlFor="field-objective"
              diffItem={diffsByField["objective"]}
              onRevert={onRevert}
              confidenceBadge={<FieldConfidenceBadge confidence={getFieldScore("Objective")} />}
            />
            <textarea
              id="field-objective"
              rows={4}
              value={form.objective}
              onChange={(e) => setField("objective", e.target.value)}
              placeholder={"ระบุวัตถุประสงค์หลักของโครงการตามที่ระบุในเอกสาร TOR..."}
              className={`${textarea} min-h-[100px] ${modInput(Boolean(diffsByField["objective"]))}`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldHeader
                label={"รูปแบบสถาปัตยกรรมระบบ"}
                fieldKey="systemArchetype"
                htmlFor="field-archetype"
                diffItem={diffsByField["systemArchetype"]}
                onRevert={onRevert}
              />
              <select
                id="field-archetype"
                value={form.systemArchetype}
                onChange={(e) => setField("systemArchetype", e.target.value)}
                className={`${input} cursor-pointer ${modInput(Boolean(diffsByField["systemArchetype"]))}`}
              >
                <option value="">{"-- เลือกสถาปัตยกรรมระบบ --"}</option>
                <option value="Web Application">Web Application</option>
                <option value="Mobile Application">Mobile Application</option>
                <option value="Enterprise Resource Planning">Enterprise Resource Planning (ERP)</option>
                <option value="Data Warehouse & AI Analytics">Data Warehouse & AI Analytics</option>
                <option value="Cloud Infrastructure">Cloud Infrastructure & Migration</option>
                <option value="Network & Security">Network & Security Infrastructure</option>
                <option value="Maintenance & Support">Maintenance & Technical Support</option>
                <option value="Hardware & Appliances">Hardware & System Appliances</option>
                <option value="Other IT System">Other IT System</option>
              </select>
            </div>

            <div>
              <FieldHeader
                label={"ระดับความซับซ้อนของระบบ"}
                fieldKey="complexityTier"
                htmlFor="field-tier"
                diffItem={diffsByField["complexityTier"]}
                onRevert={onRevert}
              />
              <select
                id="field-tier"
                value={form.complexityTier}
                onChange={(e) => setField("complexityTier", e.target.value)}
                className={`${input} cursor-pointer ${modInput(Boolean(diffsByField["complexityTier"]))}`}
              >
                <option value="">{"-- เลือกระดับความซับซ้อน --"}</option>
                <option value="Tier 1 - Standard / Low Complexity">Tier 1 - Standard / Low Complexity</option>
                <option value="Tier 2 - Moderate / Mid-Range">Tier 2 - Moderate / Mid-Range</option>
                <option value="Tier 3 - Complex / Enterprise">Tier 3 - Complex / Enterprise</option>
              </select>
            </div>
          </div>

          <div>
            <FieldHeader
              label={"ขอบเขตงานภาพรวม"}
              fieldKey="highLevelScope"
              htmlFor="field-scope"
              diffItem={diffsByField["highLevelScope"]}
              onRevert={onRevert}
            />
            <textarea
              id="field-scope"
              rows={3}
              value={form.highLevelScope}
              onChange={(e) => setField("highLevelScope", e.target.value)}
              placeholder={"สรุปขอบเขตงานภาพรวมที่ผู้รับจ้างต้องดำเนินการ..."}
              className={`${textarea} min-h-[90px] ${modInput(Boolean(diffsByField["highLevelScope"]))}`}
            />
          </div>

          <DynamicListEditor
            label={"องค์ประกอบหลักของระบบ"}
            items={form.majorComponents}
            onChange={(next) => setField("majorComponents", next)}
            placeholder={"เช่น ระบบประมวลผลข้อมูลกลาง (Central API)"}
            addLabel={"เพิ่มองค์ประกอบระบบ"}
            emptyHint={"ยังไม่ได้ระบุองค์ประกอบหลัก (คลิก + เพื่อเพิ่ม)"}
            isModified={Boolean(diffsByField["majorComponents"])}
            onRevert={() => onRevert("majorComponents")}
          />
        </div>
      </Panel>

      {/* SECTION 4: Contractor Deliverables */}
      <Panel id="sec-deliverables" className="p-5 scroll-mt-[135px]">
        <div className="border-b border-line pb-3">
          <SectionHeading>{"4. ขอบเขตงานส่งมอบของผู้รับจ้าง"}</SectionHeading>
          <p className="text-[12px] text-ink-3 mt-1">
            {"รายการสิ่งส่งมอบ 4 ด้าน: งานระบบ, งานติดตั้ง, การทดสอบ, และเอกสาร/งานสนับสนุน"}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-5">
          <DynamicListEditor
            label={"4.1 สิ่งส่งมอบด้านระบบซอฟต์แวร์/ฮาร์ดแวร์"}
            items={form.deliverablesSystem}
            onChange={(next) => setField("deliverablesSystem", next)}
            placeholder={"เช่น ซอร์สโค้ดและโปรแกรมระบบบริหารจัดการข้อมูล..."}
            addLabel={"เพิ่มสิ่งส่งมอบด้านระบบ"}
            isModified={Boolean(diffsByField["deliverables.system"])}
            onRevert={() => onRevert("deliverables.system")}
          />

          <DynamicListEditor
            label={"4.2 สิ่งส่งมอบด้านการติดตั้งและปรับแต่ง"}
            items={form.deliverablesImplementation}
            onChange={(next) => setField("deliverablesImplementation", next)}
            placeholder={"เช่น รายงานผลการติดตั้งและปรับแต่งค่าความปลอดภัยเซิร์ฟเวอร์..."}
            addLabel={"เพิ่มสิ่งส่งมอบด้านการติดตั้ง"}
            isModified={Boolean(diffsByField["deliverables.implementation"])}
            onRevert={() => onRevert("deliverables.implementation")}
          />

          <DynamicListEditor
            label={"4.3 สิ่งส่งมอบด้านการทดสอบและตรวจรับ"}
            items={form.deliverablesValidation}
            onChange={(next) => setField("deliverablesValidation", next)}
            placeholder={"เช่น รายงานผลการทดสอบเจาะระบบ (Penetration Test Report)..."}
            addLabel={"เพิ่มสิ่งส่งมอบด้านการทดสอบ"}
            isModified={Boolean(diffsByField["deliverables.validation"])}
            onRevert={() => onRevert("deliverables.validation")}
          />

          <DynamicListEditor
            label={"4.4 เอกสารและงานสนับสนุน"}
            items={form.deliverablesSupportingWork}
            onChange={(next) => setField("deliverablesSupportingWork", next)}
            placeholder={"เช่น คู่มือการใช้งานสำหรับผู้ดูแลระบบและผู้ใช้งานทั่วไป..."}
            addLabel={"เพิ่มเอกสาร/งานสนับสนุน"}
            isModified={Boolean(diffsByField["deliverables.supportingWork"])}
            onRevert={() => onRevert("deliverables.supportingWork")}
          />
        </div>
      </Panel>
    </>
  );
}
