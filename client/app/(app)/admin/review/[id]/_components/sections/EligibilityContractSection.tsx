import { input, Panel, SectionHeading, textarea } from "../../../../../../_components/ui";
import type { ReviewValidationResult } from "../../_lib/review-form";
import { DynamicListEditor } from "../../ReviewEditorComponents";
import {
  FieldConfidenceBadge,
  FieldHeader,
  modInput,
  type ReviewSectionBaseProps,
} from "../ReviewFieldPrimitives";

export function EligibilityContractSection({
  form,
  setField,
  diffsByField,
  onRevert,
  getFieldScore,
  validation,
}: ReviewSectionBaseProps & {
  validation: ReviewValidationResult;
}) {
  return (
    <>
      {/* SECTION 8: Bid Eligibility & Qualifications */}
      <Panel id="sec-eligibility" className="p-5 scroll-mt-[135px]">
        <div className="border-b border-line pb-3">
          <SectionHeading>{"8. คุณสมบัติผู้ยื่นข้อเสนอ"}</SectionHeading>
          <p className="text-[12px] text-ink-3 mt-1">
            {"คุณสมบัตินิติบุคคล หนังสือรับรอง มาตรฐาน ISO/CMMI และผลงานที่ผ่านมา"}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <DynamicListEditor
            label={"คุณสมบัติบริษัท/นิติบุคคล"}
            items={form.companyReqs}
            onChange={(next) => setField("companyReqs", next)}
            placeholder={"เช่น มีทุนจดทะเบียนชำระแล้วไม่น้อยกว่า 5,000,000 บาท"}
            addLabel={"เพิ่มคุณสมบัติบริษัท"}
            confidenceBadge={<FieldConfidenceBadge confidence={getFieldScore("Company")} />}
            isModified={Boolean(diffsByField["companyRequirements"])}
            onRevert={() => onRevert("companyRequirements")}
          />

          <DynamicListEditor
            label={"มาตรฐานและใบรับรองที่กำหนด"}
            items={form.requiredCertifications}
            onChange={(next) => setField("requiredCertifications", next)}
            placeholder={"เช่น ได้รับการรับรองมาตรฐาน ISO/IEC 29110 หรือ CMMI Level 3"}
            addLabel={"เพิ่มใบรับรอง/มาตรฐาน"}
            isModified={Boolean(diffsByField["requiredCertifications"])}
            onRevert={() => onRevert("requiredCertifications")}
          />

          <DynamicListEditor
            label={"หนังสือแต่งตั้งตัวแทนจำหน่าย"}
            items={form.manufacturerAuthorizations}
            onChange={(next) => setField("manufacturerAuthorizations", next)}
            placeholder={"เช่น มีหนังสือแต่งตั้งตัวแทนจำหน่ายอย่างเป็นทางการจากเจ้าของผลิตภัณฑ์"}
            addLabel={"เพิ่มหนังสือแต่งตั้ง"}
            isModified={Boolean(diffsByField["manufacturerAuthorizations"])}
            onRevert={() => onRevert("manufacturerAuthorizations")}
          />

          <DynamicListEditor
            label={"คุณสมบัติบุคลากรประจำโครงการ"}
            items={form.personnelQualifications}
            onChange={(next) => setField("personnelQualifications", next)}
            placeholder={"เช่น ผู้จัดการโครงการต้องได้รับประกาศนียบัตร PMP และมีประสบการณ์ไม่น้อยกว่า 5 ปี"}
            addLabel={"เพิ่มคุณสมบัติบุคลากร"}
            isModified={Boolean(diffsByField["personnelQualifications"])}
            onRevert={() => onRevert("personnelQualifications")}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <FieldHeader
                label={"ผลงานและประสบการณ์ที่ต้องมี"}
                fieldKey="previousExperience"
                htmlFor="field-prev-exp"
                diffItem={diffsByField["previousExperience"]}
                onRevert={onRevert}
                confidenceBadge={<FieldConfidenceBadge confidence={getFieldScore("Experience")} />}
              />
              <textarea
                id="field-prev-exp"
                rows={3}
                value={form.previousExperience}
                onChange={(e) => setField("previousExperience", e.target.value)}
                placeholder={"เช่น มีผลงานพัฒนาระบบเทคโนโลยีสารสนเทศที่มีลักษณะคล้ายคลึงกันในสัญญาเดียว..."}
                className={`${textarea} min-h-[90px] ${modInput(Boolean(diffsByField["previousExperience"]))}`}
              />
            </div>

            <div>
              <FieldHeader
                label={"มูลค่าผลงานขั้นต่ำ (บาท)"}
                fieldKey="previousExperienceMinTHB"
                htmlFor="field-min-exp"
                diffItem={diffsByField["previousExperienceMinTHB"]}
                onRevert={onRevert}
              />
              <input
                id="field-min-exp"
                type="text"
                value={form.previousExperienceMinTHB}
                onChange={(e) => setField("previousExperienceMinTHB", e.target.value)}
                placeholder="เช่น 5,000,000"
                className={`${input} ${!validation.minExpCheck.valid ? "border-risk focus:border-risk" : ""} ${modInput(Boolean(diffsByField["previousExperienceMinTHB"]))}`}
              />
              {!validation.minExpCheck.valid ? (
                <p className="mt-1 text-[11px] text-risk">{"โปรดระบุเป็นตัวเลขเท่านั้น"}</p>
              ) : null}
            </div>
          </div>
        </div>
      </Panel>

      {/* SECTION 9: Contract & Commercial Conditions */}
      <Panel id="sec-contract" className="p-5 scroll-mt-[135px]">
        <div className="border-b border-line pb-3">
          <SectionHeading>{"9. เงื่อนไขสัญญาและการชำระเงิน"}</SectionHeading>
          <p className="text-[12px] text-ink-3 mt-1">
            {"งวดการจ่ายเงิน เงื่อนไขการตรวจรับ และเกณฑ์การพิจารณาตัดสิน"}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <div>
            <FieldHeader
              label={"งวดการจ่ายเงิน"}
              fieldKey="paymentTerms"
              htmlFor="field-payment"
              diffItem={diffsByField["paymentTerms"]}
              onRevert={onRevert}
              confidenceBadge={<FieldConfidenceBadge confidence={getFieldScore("Payment")} />}
            />
            <textarea
              id="field-payment"
              rows={3}
              value={form.paymentTerms}
              onChange={(e) => setField("paymentTerms", e.target.value)}
              placeholder={"เช่น แบ่งจ่าย 4 งวดตามผลการตรวจรับมอบงาน..."}
              className={`${textarea} min-h-[90px] ${modInput(Boolean(diffsByField["paymentTerms"]))}`}
            />
          </div>

          <div>
            <FieldHeader
              label={"เงื่อนไขการตรวจรับมอบงาน"}
              fieldKey="deliveryConditions"
              htmlFor="field-delivery-cond"
              diffItem={diffsByField["deliveryConditions"]}
              onRevert={onRevert}
            />
            <textarea
              id="field-delivery-cond"
              rows={3}
              value={form.deliveryConditions}
              onChange={(e) => setField("deliveryConditions", e.target.value)}
              placeholder={"เช่น ตรวจรับภายใน 5 วันทำการหลังส่งมอบครบถ้วน..."}
              className={`${textarea} min-h-[85px] ${modInput(Boolean(diffsByField["deliveryConditions"]))}`}
            />
          </div>

          <div>
            <FieldHeader
              label={"เกณฑ์การพิจารณาคัดเลือก"}
              fieldKey="evaluationMethod"
              htmlFor="field-eval-method"
              diffItem={diffsByField["evaluationMethod"]}
              onRevert={onRevert}
            />
            <input
              id="field-eval-method"
              type="text"
              value={form.evaluationMethod}
              onChange={(e) => setField("evaluationMethod", e.target.value)}
              placeholder={"เช่น เกณฑ์ราคา หรือ เกณฑ์ประสิทธิภาพต่อราคา (Price-Performance Ratio)"}
              className={`${input} ${modInput(Boolean(diffsByField["evaluationMethod"]))}`}
            />
          </div>
        </div>
      </Panel>

      {/* SECTION 10: Amendment History & Tracking */}
      <Panel id="sec-amendments" className="p-5 scroll-mt-[135px]">
        <div className="border-b border-line pb-3">
          <SectionHeading>{"10. ข้อมูลการแก้ไขประกาศ"}</SectionHeading>
          <p className="text-[12px] text-ink-3 mt-1">
            {"การเปลี่ยนแปลงหรือแก้ไขข้อกำหนด TOR หลังเผยแพร่ประกาศครั้งแรก"}
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isAmended}
                onChange={(e) => setField("isAmended", e.target.checked)}
                className="h-4 w-4 rounded border-line-2 accent-ink"
              />
              <span className="text-[13px] font-medium text-ink">
                {"ประกาศนี้มีการแก้ไข TOR"}
              </span>
            </label>
            {diffsByField["isAmended"] && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amend-bg border border-amend-line px-2 py-0.5 text-[10.5px] font-semibold text-amend">
                <span>●</span>
                <span>แก้ไขแล้ว</span>
                <button
                  type="button"
                  onClick={() => onRevert("isAmended")}
                  className="ml-0.5 text-amend hover:underline cursor-pointer"
                  title="คืนค่าเดิม"
                >
                  ↺
                </button>
              </span>
            )}
          </div>

          {form.isAmended ? (
            <div className="flex flex-col gap-4 rounded-xl border border-amend-line bg-amend-bg/15 p-4 animate-in fade-in duration-200">
              <div>
                <FieldHeader
                  label={"สรุปสาระสำคัญที่มีการแก้ไข"}
                  fieldKey="amendmentSummary"
                  htmlFor="field-amend-summary"
                  diffItem={diffsByField["amendmentSummary"]}
                  onRevert={onRevert}
                />
                <textarea
                  id="field-amend-summary"
                  rows={3}
                  value={form.amendmentSummary}
                  onChange={(e) => setField("amendmentSummary", e.target.value)}
                  placeholder={"เช่น ขยายเวลารับซองออกไป 7 วัน และปรับลดข้อกำหนดคุณสมบัติ ISO..."}
                  className={`${textarea} min-h-[85px] ${modInput(Boolean(diffsByField["amendmentSummary"]))}`}
                />
              </div>

              <DynamicListEditor
                label={"ส่วนของเอกสารที่มีการแก้ไข"}
                items={form.changedSections}
                onChange={(next) => setField("changedSections", next)}
                placeholder={"เช่น ข้อ 4.2 ขยายเวลารับซอง"}
                addLabel={"เพิ่มส่วนที่แก้ไข"}
                isModified={Boolean(diffsByField["changedSections"])}
                onRevert={() => onRevert("changedSections")}
              />
            </div>
          ) : null}
        </div>
      </Panel>
    </>
  );
}
