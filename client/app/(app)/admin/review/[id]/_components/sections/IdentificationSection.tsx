import { input, Panel, SectionHeading } from "../../../../../../_components/ui";
import { CategoryPicker } from "../../ReviewEditorComponents";
import {
  FieldConfidenceBadge,
  FieldHeader,
  modInput,
  type ReviewSectionBaseProps,
} from "../ReviewFieldPrimitives";

export function IdentificationSection({
  form,
  setField,
  diffsByField,
  onRevert,
  getFieldScore,
}: ReviewSectionBaseProps) {
  return (
    <Panel id="sec-identification" className="p-5 scroll-mt-[135px]">
      <div className="border-b border-line pb-3">
        <SectionHeading>{"1. ข้อมูลทั่วไปและการจัดประเภท"}</SectionHeading>
        <p className="text-[12px] text-ink-3 mt-1">
          {"ชื่อโครงการ หน่วยงาน และประเภทงานตามประกาศทางการ"}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <div>
          <FieldHeader
            label={"ชื่อโครงการ (ภาษาไทย)"}
            fieldKey="title"
            htmlFor="field-title"
            diffItem={diffsByField["title"]}
            onRevert={onRevert}
            confidenceBadge={<FieldConfidenceBadge confidence={getFieldScore("Title")} />}
          />
          <input
            id="field-title"
            type="text"
            required
            value={form.title}
            onChange={(e) => setField("title", e.target.value)}
            className={`${input} ${modInput(Boolean(diffsByField["title"]))}`}
          />
        </div>

        <div>
          <FieldHeader
            label={"ชื่อโครงการ (ภาษาอังกฤษ)"}
            fieldKey="titleEn"
            htmlFor="field-title-en"
            diffItem={diffsByField["titleEn"]}
            onRevert={onRevert}
          />
          <input
            id="field-title-en"
            type="text"
            value={form.titleEn}
            onChange={(e) => setField("titleEn", e.target.value)}
            placeholder="e.g. Bangkok Smart Traffic Data Infrastructure Development"
            className={`${input} ${modInput(Boolean(diffsByField["titleEn"]))}`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldHeader
              label={"หน่วยงานผู้จัดซื้อ"}
              fieldKey="agency"
              htmlFor="field-agency"
              diffItem={diffsByField["agency"]}
              onRevert={onRevert}
              confidenceBadge={<FieldConfidenceBadge confidence={getFieldScore("Agency")} />}
            />
            <input
              id="field-agency"
              type="text"
              required
              value={form.agency}
              onChange={(e) => setField("agency", e.target.value)}
              className={`${input} ${modInput(Boolean(diffsByField["agency"]))}`}
            />
          </div>

          <div>
            <FieldHeader
              label={"สำนัก / กอง / ฝ่ายที่รับผิดชอบ"}
              fieldKey="department"
              htmlFor="field-dept"
              diffItem={diffsByField["department"]}
              onRevert={onRevert}
            />
            <input
              id="field-dept"
              type="text"
              value={form.department}
              onChange={(e) => setField("department", e.target.value)}
              placeholder="เช่น กองสารสนเทศระบายน้ำ"
              className={`${input} mt-1 ${modInput(Boolean(diffsByField["department"]))}`}
            />
          </div>
        </div>

        <div>
          <FieldHeader
            label={"หมวดหมู่งานไอที"}
            fieldKey="categories"
            diffItem={diffsByField["categories"]}
            onRevert={onRevert}
          />
          <CategoryPicker
            selected={form.categories}
            onChange={(next) => setField("categories", next)}
            isModified={Boolean(diffsByField["categories"])}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldHeader
              label={"สถานะการจัดซื้อ"}
              fieldKey="status"
              htmlFor="field-status"
              diffItem={diffsByField["status"]}
              onRevert={onRevert}
            />
            <select
              id="field-status"
              name="status"
              value={form.status}
              onChange={(e) => setField("status", e.target.value)}
              className={`${input} mt-1 pr-8 cursor-pointer ${modInput(Boolean(diffsByField["status"]))}`}
            >
              <option value="Draft">{"ร่างประกาศ"}</option>
              <option value="Open">{"เปิดรับซอง / ยื่นข้อเสนอ"}</option>
              <option value="Awarded">{"ประกาศผู้ชนะแล้ว"}</option>
              <option value="Closed">{"สิ้นสุดการยื่นข้อเสนอ"}</option>
              <option value="Cancelled">{"ยกเลิกประกาศ"}</option>
            </select>
          </div>
        </div>
      </div>
    </Panel>
  );
}
