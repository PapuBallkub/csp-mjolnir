import type { FormEvent } from "react";
import { btn, input, Label } from "../../../../../_components/ui";

export function ReclassifyModal({
  isOpen,
  reason,
  onChangeReason,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  reason: string;
  onChangeReason: (val: string) => void;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl animate-in zoom-in-95 duration-150">
        <h3 className="text-[15px] font-semibold text-ink">
          {"ยืนยันการจัดประเภทใหม่เป็นงานนอกขอบเขต"}
        </h3>
        <p className="mt-1 text-[12.5px] leading-thai text-ink-3">
          {"โครงการนี้จะถูกทำเครื่องหมายเป็นงานนอกขอบเขต (non-IT) และซ่อนจากหน้าสืบค้นสาธารณะ"}
        </p>

        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          <div>
            <Label htmlFor="modal-reclassify-reason">{"เหตุผลในการคัดออก"}</Label>
            <input
              id="modal-reclassify-reason"
              type="text"
              required
              value={reason}
              onChange={(e) => onChangeReason(e.target.value)}
              placeholder={"เช่น งานก่อสร้างปรับปรุงอาคาร ไม่ใช่งานไอที"}
              className={`${input} mt-1`}
            />
          </div>

          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className={btn.secondary}
            >
              {"ยกเลิก"}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-full border border-risk-line bg-risk px-4 h-9 text-[13px] font-medium text-white hover:opacity-85 transition-opacity cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? "กำลังบันทึก..." : "ยืนยันคัดออก"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
