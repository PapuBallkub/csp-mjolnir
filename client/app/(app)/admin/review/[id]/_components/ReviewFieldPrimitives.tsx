import type { ReactNode } from "react";
import { Label } from "../../../../../_components/ui";
import type { EditDiffItem } from "../ReviewEditorComponents";
import type { ReviewFormState } from "../_lib/review-form";

export function confidenceTone(value: number): string {
  if (value < 0.7) return "bg-risk text-white";
  if (value < 0.85) return "bg-amend text-ink";
  return "bg-open text-white";
}

export function FieldConfidenceBadge({
  confidence,
}: {
  confidence: number;
}) {
  const pct = Math.round(confidence <= 1 ? confidence * 100 : confidence);
  const tone =
    pct >= 85
      ? "border-open-line bg-open-bg text-open"
      : pct >= 70
      ? "border-amend-line bg-amend-bg text-amend"
      : "border-risk-line bg-risk-bg text-risk";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono font-medium ${tone}`}
      title={`ความมั่นใจ AI: ${pct}%`}
    >
      <span>LLM</span>
      <span>{pct}%</span>
    </span>
  );
}

export function FieldHeader({
  label,
  fieldKey,
  diffItem,
  onRevert,
  htmlFor,
  confidenceBadge,
}: {
  label: string;
  fieldKey?: string;
  diffItem?: EditDiffItem;
  onRevert?: (fieldKey: string) => void;
  htmlFor?: string;
  confidenceBadge?: ReactNode;
}) {
  return (
    <div className="mb-1 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {diffItem && fieldKey && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amend-bg border border-amend-line px-2 py-0.5 text-[10.5px] font-semibold text-amend">
            <span>●</span>
            <span>แก้ไขแล้ว</span>
            {onRevert && (
              <button
                type="button"
                onClick={() => onRevert(fieldKey)}
                className="ml-0.5 text-amend hover:underline cursor-pointer"
                title="คืนค่าเดิม"
              >
                ↺
              </button>
            )}
          </span>
        )}
      </div>
      {confidenceBadge}
    </div>
  );
}

export function modInput(isMod: boolean | undefined) {
  return isMod
    ? "border-amend/80 bg-amend-bg/15 ring-1 ring-amend/60 focus:border-amend focus:ring-amend"
    : "";
}

export interface ReviewSectionBaseProps {
  form: ReviewFormState;
  setField: <K extends keyof ReviewFormState>(key: K, value: ReviewFormState[K]) => void;
  diffsByField: Record<string, EditDiffItem>;
  onRevert: (fieldKey: string) => void;
  getFieldScore: (fieldName: string, fallback?: number) => number;
}
