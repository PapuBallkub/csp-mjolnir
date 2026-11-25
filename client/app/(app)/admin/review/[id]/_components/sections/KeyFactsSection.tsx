import { input, Panel, SectionHeading } from "../../../../../../_components/ui";
import type { ReviewValidationResult } from "../../_lib/review-form";
import {
  FieldConfidenceBadge,
  FieldHeader,
  modInput,
  type ReviewSectionBaseProps,
} from "../ReviewFieldPrimitives";

export function KeyFactsSection({
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
    <Panel id="sec-keyfacts" className="p-5 scroll-mt-[135px]">
      <div className="border-b border-line pb-3">
        <SectionHeading>{"2. ข้อมูลสำคัญ ราคา และกำหนดการ"}</SectionHeading>
        <p className="text-[12px] text-ink-3 mt-1">
          {"งบประมาณ ราคากลาง กำหนดส่งมอบ และเงื่อนไขค่าปรับ"}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldHeader
              label={"งบประมาณ (บาท)"}
              fieldKey="budgetTHB"
              htmlFor="field-budget"
              diffItem={diffsByField["budgetTHB"]}
              onRevert={onRevert}
              confidenceBadge={<FieldConfidenceBadge confidence={getFieldScore("Budget")} />}
            />
            <input
              id="field-budget"
              type="text"
              value={form.budgetTHB}
              onChange={(e) => setField("budgetTHB", e.target.value)}
              placeholder="เช่น 1,800,000"
              className={`${input} ${!validation.budgetCheck.valid ? "border-risk focus:border-risk" : ""} ${modInput(Boolean(diffsByField["budgetTHB"]))}`}
            />
            {!validation.budgetCheck.valid ? (
              <p className="mt-1 text-[11px] text-risk">
                {"โปรดระบุเป็นตัวเลขเท่านั้น (เช่น 1,500,000 หรือ 1500000)"}
              </p>
            ) : null}
          </div>

          <div>
            <FieldHeader
              label={"ราคากลาง (บาท)"}
              fieldKey="referencePriceTHB"
              htmlFor="field-ref-price"
              diffItem={diffsByField["referencePriceTHB"]}
              onRevert={onRevert}
              confidenceBadge={<FieldConfidenceBadge confidence={getFieldScore("Reference")} />}
            />
            <input
              id="field-ref-price"
              type="text"
              value={form.referencePriceTHB}
              onChange={(e) => setField("referencePriceTHB", e.target.value)}
              placeholder="เช่น 1,750,000"
              className={`${input} ${!validation.refPriceCheck.valid ? "border-risk focus:border-risk" : ""} ${modInput(Boolean(diffsByField["referencePriceTHB"]))}`}
            />
            {!validation.refPriceCheck.valid ? (
              <p className="mt-1 text-[11px] text-risk">
                {"โปรดระบุเป็นตัวเลขเท่านั้น (เช่น 1,500,000 หรือ 1500000)"}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <FieldHeader
              label={"วันสิ้นสุดรับซอง"}
              fieldKey="submissionDeadline"
              htmlFor="field-deadline"
              diffItem={diffsByField["submissionDeadline"]}
              onRevert={onRevert}
              confidenceBadge={<FieldConfidenceBadge confidence={getFieldScore("Deadline")} />}
            />
            <input
              id="field-deadline"
              type="date"
              value={form.submissionDeadline}
              onChange={(e) => setField("submissionDeadline", e.target.value)}
              className={`${input} ${modInput(Boolean(diffsByField["submissionDeadline"]))}`}
            />
          </div>

          <div>
            <FieldHeader
              label={"วันสิ้นสุดวิจารณ์"}
              fieldKey="commentDeadline"
              htmlFor="field-comment-deadline"
              diffItem={diffsByField["commentDeadline"]}
              onRevert={onRevert}
            />
            <input
              id="field-comment-deadline"
              type="date"
              value={form.commentDeadline}
              onChange={(e) => setField("commentDeadline", e.target.value)}
              className={`${input} ${modInput(Boolean(diffsByField["commentDeadline"]))}`}
            />
          </div>

          <div>
            <FieldHeader
              label={"วันที่ประกาศ"}
              fieldKey="postedDate"
              htmlFor="field-posted-date"
              diffItem={diffsByField["postedDate"]}
              onRevert={onRevert}
            />
            <input
              id="field-posted-date"
              type="date"
              value={form.postedDate}
              onChange={(e) => setField("postedDate", e.target.value)}
              className={`${input} ${modInput(Boolean(diffsByField["postedDate"]))}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <FieldHeader
              label={"ระยะเวลาสัญญา (วัน)"}
              fieldKey="contractDurationDays"
              htmlFor="field-duration"
              diffItem={diffsByField["contractDurationDays"]}
              onRevert={onRevert}
            />
            <input
              id="field-duration"
              type="text"
              value={form.contractDurationDays}
              onChange={(e) => setField("contractDurationDays", e.target.value)}
              placeholder="เช่น 180"
              className={`${input} ${!validation.durationCheck.valid ? "border-risk focus:border-risk" : ""} ${modInput(Boolean(diffsByField["contractDurationDays"]))}`}
            />
          </div>

          <div>
            <FieldHeader
              label={"ระยะเวลาส่งมอบงาน (วัน)"}
              fieldKey="deliveryPeriodDays"
              htmlFor="field-delivery-period"
              diffItem={diffsByField["deliveryPeriodDays"]}
              onRevert={onRevert}
            />
            <input
              id="field-delivery-period"
              type="text"
              value={form.deliveryPeriodDays}
              onChange={(e) => setField("deliveryPeriodDays", e.target.value)}
              placeholder="เช่น 120"
              className={`${input} ${!validation.deliveryPeriodCheck.valid ? "border-risk focus:border-risk" : ""} ${modInput(Boolean(diffsByField["deliveryPeriodDays"]))}`}
            />
          </div>

          <div>
            <FieldHeader
              label={"ระยะเวลารับประกัน (ปี)"}
              fieldKey="warrantyYears"
              htmlFor="field-warranty"
              diffItem={diffsByField["warrantyYears"]}
              onRevert={onRevert}
            />
            <input
              id="field-warranty"
              type="text"
              value={form.warrantyYears}
              onChange={(e) => setField("warrantyYears", e.target.value)}
              placeholder="เช่น 1 หรือ 2"
              className={`${input} ${!validation.warrantyCheck.valid ? "border-risk focus:border-risk" : ""} ${modInput(Boolean(diffsByField["warrantyYears"]))}`}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldHeader
              label={"วิธีการจัดซื้อจัดจ้าง"}
              fieldKey="procurementMethod"
              htmlFor="field-method"
              diffItem={diffsByField["procurementMethod"]}
              onRevert={onRevert}
            />
            <input
              id="field-method"
              type="text"
              value={form.procurementMethod}
              onChange={(e) => setField("procurementMethod", e.target.value)}
              placeholder="เช่น ประกวดราคาอิเล็กทรอนิกส์ (e-bidding) หรือ วิธีคัดเลือก"
              className={`${input} ${modInput(Boolean(diffsByField["procurementMethod"]))}`}
            />
          </div>

          <div>
            <FieldHeader
              label={"เงื่อนไขค่าปรับล่าช้า"}
              fieldKey="penaltyClause"
              htmlFor="field-penalty"
              diffItem={diffsByField["penaltyClause"]}
              onRevert={onRevert}
              confidenceBadge={<FieldConfidenceBadge confidence={getFieldScore("Penalty")} />}
            />
            <input
              id="field-penalty"
              type="text"
              value={form.penaltyClause}
              onChange={(e) => setField("penaltyClause", e.target.value)}
              placeholder="เช่น ร้อยละ 0.20 ต่อวันของมูลค่าสัญญา"
              className={`${input} ${modInput(Boolean(diffsByField["penaltyClause"]))}`}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}
