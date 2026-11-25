import { input, Panel, SectionHeading, textarea } from "../../../../../../_components/ui";
import { DynamicListEditor } from "../../ReviewEditorComponents";
import { FieldHeader, modInput, type ReviewSectionBaseProps } from "../ReviewFieldPrimitives";

export function IntegrationOpsSection({
  form,
  setField,
  diffsByField,
  onRevert,
}: Omit<ReviewSectionBaseProps, "getFieldScore">) {
  return (
    <>
      {/* SECTION 6: Integration Environment */}
      <Panel id="sec-integration" className="p-5 scroll-mt-[135px]">
        <div className="border-b border-line pb-3">
          <SectionHeading>{"6. ระบบเดิมและสภาพแวดล้อมที่ต้องเชื่อมต่อ"}</SectionHeading>
          <p className="text-[12px] text-ink-3 mt-1">
            {"ระบบเดิมของหน่วยงาน อินเทอร์เฟซ API การถ่ายโอนข้อมูล และสถานที่ติดตั้ง"}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <DynamicListEditor
            label={"ระบบเดิมที่ต้องเชื่อมต่อ"}
            items={form.existingSystems}
            onChange={(next) => setField("existingSystems", next)}
            placeholder={"เช่น ระบบทะเบียนราษฎร์ กรมการปกครอง (DOPA)"}
            addLabel={"เพิ่มระบบเดิม"}
            isModified={Boolean(diffsByField["existingSystems"])}
            onRevert={() => onRevert("existingSystems")}
          />

          <DynamicListEditor
            label={"อินเทอร์เฟซและบริการ API"}
            items={form.interfacesAndApis}
            onChange={(next) => setField("interfacesAndApis", next)}
            placeholder={"เช่น RESTful API ด้วย JSON Web Token (JWT)"}
            addLabel={"เพิ่ม API Interface"}
            isModified={Boolean(diffsByField["interfacesAndApis"])}
            onRevert={() => onRevert("interfacesAndApis")}
          />

          <div>
            <FieldHeader
              label={"ข้อมูลและเงื่อนไขการย้ายข้อมูล"}
              fieldKey="dataMigrationNotes"
              htmlFor="field-migration"
              diffItem={diffsByField["dataMigrationNotes"]}
              onRevert={onRevert}
            />
            <textarea
              id="field-migration"
              rows={3}
              value={form.dataMigrationNotes}
              onChange={(e) => setField("dataMigrationNotes", e.target.value)}
              placeholder={"ระบุรายละเอียดการถ่ายโอนข้อมูลจากฐานข้อมูลเดิม..."}
              className={`${textarea} min-h-[85px] ${modInput(Boolean(diffsByField["dataMigrationNotes"]))}`}
            />
          </div>

          <div>
            <FieldHeader
              label={"สถานที่และสภาพแวดล้อมการติดตั้ง"}
              fieldKey="deploymentLocation"
              htmlFor="field-deploy-loc"
              diffItem={diffsByField["deploymentLocation"]}
              onRevert={onRevert}
            />
            <input
              id="field-deploy-loc"
              type="text"
              value={form.deploymentLocation}
              onChange={(e) => setField("deploymentLocation", e.target.value)}
              placeholder={"เช่น ศูนย์ข้อมูล กทม. ดินแดง หรือ ระบบคลาวด์กลางภาครัฐ (GDCC)"}
              className={`${input} ${modInput(Boolean(diffsByField["deploymentLocation"]))}`}
            />
          </div>
        </div>
      </Panel>

      {/* SECTION 7: Operational Requirements */}
      <Panel id="sec-ops" className="p-5 scroll-mt-[135px]">
        <div className="border-b border-line pb-3">
          <SectionHeading>{"7. การติดตั้งและบำรุงรักษา"}</SectionHeading>
          <p className="text-[12px] text-ink-3 mt-1">
            {"เงื่อนไขการติดตั้ง ฝึกอบรม ข้อตกลงระดับบริการ (SLA) และการบำรุงรักษา"}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <DynamicListEditor
            label={"ข้อกำหนดด้านการติดตั้งและปรับแต่ง"}
            items={form.installationAndConfig}
            onChange={(next) => setField("installationAndConfig", next)}
            placeholder={"เช่น ติดตั้งระบบปฏิบัติการและตั้งค่า Firewall ตามมาตรฐาน CIS Benchmark"}
            addLabel={"เพิ่มข้อกำหนดการติดตั้ง"}
            isModified={Boolean(diffsByField["installationAndConfig"])}
            onRevert={() => onRevert("installationAndConfig")}
          />

          <DynamicListEditor
            label={"การฝึกอบรมบุคลากร"}
            items={form.training}
            onChange={(next) => setField("training", next)}
            placeholder={"เช่น อบรมการใช้งานระบบสำหรับเจ้าหน้าที่ 2 รุ่น รุ่นละ 30 คน"}
            addLabel={"เพิ่มหลักสูตรฝึกอบรม"}
            isModified={Boolean(diffsByField["training"])}
            onRevert={() => onRevert("training")}
          />

          <div>
            <FieldHeader
              label={"ข้อตกลงระดับการให้บริการและการสนับสนุนเทคนิค"}
              fieldKey="technicalSupportAndSla"
              htmlFor="field-sla"
              diffItem={diffsByField["technicalSupportAndSla"]}
              onRevert={onRevert}
            />
            <textarea
              id="field-sla"
              rows={3}
              value={form.technicalSupportAndSla}
              onChange={(e) => setField("technicalSupportAndSla", e.target.value)}
              placeholder={"เช่น ให้บริการแก้ไขเหตุขัดข้องแบบ 24x7 และตอบสนองภายใน 2 ชั่วโมง"}
              className={`${textarea} min-h-[85px] ${modInput(Boolean(diffsByField["technicalSupportAndSla"]))}`}
            />
          </div>

          <DynamicListEditor
            label={"การบำรุงรักษาระบบ"}
            items={form.maintenance}
            onChange={(next) => setField("maintenance", next)}
            placeholder={"เช่น ตรวจสอบสถานะการทำงานเชิงป้องกัน (Preventive Maintenance) ทุก 3 เดือน"}
            addLabel={"เพิ่มข้อกำหนดบำรุงรักษา"}
            isModified={Boolean(diffsByField["maintenance"])}
            onRevert={() => onRevert("maintenance")}
          />
        </div>
      </Panel>
    </>
  );
}
