import { useEffect, useState } from "react";
import { btn, input, Label } from "../../../../_components/ui";
import type { TorVersionItem } from "../../../../_lib/api";

export function DynamicListEditor({
  label,
  items,
  onChange,
  placeholder = "ระบุรายการ...",
  addLabel = "เพิ่มรายการ",
  emptyHint = "ยังไม่มีรายการในส่วนนี้ (คลิกเพื่อเพิ่ม)",
  lang = "th",
  confidenceBadge,
  isModified,
  onRevert,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  emptyHint?: string;
  lang?: "th" | "en";
  confidenceBadge?: React.ReactNode;
  isModified?: boolean;
  onRevert?: () => void;
}) {
  const handleAdd = () => {
    onChange([...items, ""]);
  };

  const handleUpdate = (index: number, val: string) => {
    // If the user pastes multi-line text, split it automatically into separate items
    if (val.includes("\n")) {
      const lines = val
        .split("\n")
        .map((s) => s.trim().replace(/^[-*•\d.]+\s*/, ""))
        .filter(Boolean);
      if (lines.length > 1) {
        const next = [...items];
        next.splice(index, 1, ...lines);
        onChange(next);
        return;
      }
    }
    const next = [...items];
    next[index] = val;
    onChange(next);
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className={`flex flex-col gap-2 rounded-[3px] transition-colors ${isModified ? "p-2 bg-amend-bg/15 border border-amend-line/80" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label>{label}</Label>
          {isModified && (
            <span className="inline-flex items-center gap-1 rounded-[2px] bg-amend-bg border border-amend-line px-1.5 py-0.2 text-[10.5px] font-semibold text-amend">
              <span>●</span>
              <span>{lang === "th" ? "แก้ไขแล้ว" : "Modified"}</span>
              {onRevert && (
                <button
                  type="button"
                  onClick={onRevert}
                  className="ml-0.5 text-amend hover:underline cursor-pointer"
                  title={lang === "th" ? "คืนค่าเดิม" : "Revert"}
                >
                  ↺
                </button>
              )}
            </span>
          )}
        </div>
        {confidenceBadge}
      </div>

      <div className="flex flex-col gap-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="flex h-9 w-7 shrink-0 items-center justify-center font-mono text-[11px] font-semibold text-ink-3">
              {idx + 1}.
            </span>
            <input
              type="text"
              value={item}
              onChange={(e) => handleUpdate(idx, e.target.value)}
              placeholder={`${placeholder} #${idx + 1}`}
              className={`${input} flex-1 ${isModified ? "border-amend/60 bg-surface focus:border-amend" : ""}`}
            />
            <button
              type="button"
              onClick={() => handleRemove(idx)}
              title={lang === "th" ? "ลบรายการนี้" : "Remove item"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] text-ink-3 hover:bg-risk-bg hover:text-risk transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        ))}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleAdd}
            className={`${btn.secondary} text-[12px] h-8 px-3 flex items-center gap-1.5`}
          >
            <span>+</span>
            <span>{addLabel}</span>
          </button>
          {items.length === 0 ? (
            <span className="text-[12px] text-ink-3 italic">{emptyHint}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function KeyValueListEditor({
  label,
  items,
  onChange,
  keyLabel = "รายการ / ตัวชี้วัด",
  valueLabel = "คุณสมบัติ / ค่าที่กำหนด",
  addLabel = "เพิ่มข้อกำหนด",
  emptyHint = "ไม่มีข้อกำหนดเฉพาะเจาะจง",
  lang = "th",
  confidenceBadge,
  isModified,
  onRevert,
}: {
  label: string;
  items: Array<{ key: string; value: string }>;
  onChange: (items: Array<{ key: string; value: string }>) => void;
  keyLabel?: string;
  valueLabel?: string;
  addLabel?: string;
  emptyHint?: string;
  lang?: "th" | "en";
  confidenceBadge?: React.ReactNode;
  isModified?: boolean;
  onRevert?: () => void;
}) {
  const handleAdd = () => {
    onChange([...items, { key: "", value: "" }]);
  };

  const handleUpdate = (index: number, field: "key" | "value", val: string) => {
    const next = items.map((it, idx) => (idx === index ? { ...it, [field]: val } : it));
    onChange(next);
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className={`flex flex-col gap-2 rounded-[3px] transition-colors ${isModified ? "p-2 bg-amend-bg/15 border border-amend-line/80" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label>{label}</Label>
          {isModified && (
            <span className="inline-flex items-center gap-1 rounded-[2px] bg-amend-bg border border-amend-line px-1.5 py-0.2 text-[10.5px] font-semibold text-amend">
              <span>●</span>
              <span>{lang === "th" ? "แก้ไขแล้ว" : "Modified"}</span>
              {onRevert && (
                <button
                  type="button"
                  onClick={onRevert}
                  className="ml-0.5 text-amend hover:underline cursor-pointer"
                  title={lang === "th" ? "คืนค่าเดิม" : "Revert"}
                >
                  ↺
                </button>
              )}
            </span>
          )}
        </div>
        {confidenceBadge}
      </div>

      <div className="flex flex-col gap-2">
        {items.map((row, idx) => (
          <div key={idx} className="flex flex-col gap-2 rounded-[3px] border border-line bg-surface-2 p-2 sm:flex-row sm:items-center">
            <span className="flex h-8 w-6 shrink-0 items-center justify-center font-mono text-[11px] font-semibold text-ink-3">
              {idx + 1}.
            </span>
            <input
              type="text"
              value={row.key}
              onChange={(e) => handleUpdate(idx, "key", e.target.value)}
              placeholder={keyLabel}
              className={`${input} flex-1 sm:max-w-[220px]`}
            />
            <input
              type="text"
              value={row.value}
              onChange={(e) => handleUpdate(idx, "value", e.target.value)}
              placeholder={valueLabel}
              className={`${input} flex-1`}
            />
            <button
              type="button"
              onClick={() => handleRemove(idx)}
              title={lang === "th" ? "ลบรายการนี้" : "Remove row"}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] text-ink-3 hover:bg-risk-bg hover:text-risk transition-colors cursor-pointer self-end sm:self-auto"
            >
              ✕
            </button>
          </div>
        ))}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleAdd}
            className={`${btn.secondary} text-[12px] h-8 px-3 flex items-center gap-1.5`}
          >
            <span>+</span>
            <span>{addLabel}</span>
          </button>
          {items.length === 0 ? (
            <span className="text-[12px] text-ink-3 italic">{emptyHint}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function VersionHistoryDrawer({
  isOpen,
  onClose,
  versions,
  currentVersion,
  onRollback,
  isRollingBack,
  lang = "th",
}: {
  isOpen: boolean;
  onClose: () => void;
  versions: TorVersionItem[];
  currentVersion: number | null;
  onRollback: (version: number) => void;
  isRollingBack: boolean;
  lang?: "th" | "en";
}) {
  const [confirmRollbackVersion, setConfirmRollbackVersion] = useState<number | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[1px]">
      <div className="flex h-full w-full max-w-lg flex-col bg-surface border-l border-line shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">
              {lang === "th" ? "ประวัติเวอร์ชันและการย้อนกลับ (Version History)" : "Version History & Rollback"}
            </h2>
            <p className="text-[12px] text-ink-3 mt-0.5">
              {lang === "th"
                ? `เวอร์ชันปัจจุบัน: v${currentVersion ?? 1} (NFR-07, ADR 0031)`
                : `Current version: v${currentVersion ?? 1} (NFR-07, ADR 0031)`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-[3px] text-ink-3 hover:bg-surface-2 hover:text-ink cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {versions.length === 0 ? (
            <div className="rounded-[3px] border border-line bg-surface-2 p-6 text-center text-[13px] text-ink-3">
              {lang === "th"
                ? "ยังไม่มีประวัติเวอร์ชันก่อนหน้า — บันทึกนี้เป็นเวอร์ชันเริ่มต้น v1"
                : "No superseded versions recorded yet — this is the initial version v1."}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {versions.map((ver) => (
                <div
                  key={ver.version}
                  className="rounded-[3px] border border-line bg-surface-2 p-4 transition-all"
                >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] font-bold text-ink">
                          v{ver.version}
                        </span>
                        <span className="rounded-[2px] border border-line px-1.5 py-0.5 text-[10px] font-mono text-ink-2">
                          {ver.reason}
                        </span>
                      </div>
                      <span className="text-[11px] text-ink-3">
                        {new Date(ver.supersededAt).toLocaleString(lang === "th" ? "th-TH" : "en-US")}
                      </span>
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-2 text-[11.5px] text-ink-2">
                      <div>
                        <span className="text-ink-3">{lang === "th" ? "สถานะ: " : "Status: "}</span>
                        <span className="font-medium text-ink">{ver.reviewStatus || "unknown"}</span>
                      </div>
                      <div>
                        <span className="text-ink-3">{lang === "th" ? "คะแนน: " : "Confidence: "}</span>
                        <span className="font-mono font-medium text-ink">
                          {ver.confidenceScore ? `${ver.confidenceScore}%` : "-"}
                        </span>
                      </div>
                      {ver.modelName ? (
                        <div className="col-span-2 truncate">
                          <span className="text-ink-3">{lang === "th" ? "โมเดล: " : "Model: "}</span>
                          <span className="font-mono text-[11px] text-ink">{ver.modelName}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-3">
                      <span className="text-[11px] text-ink-3">
                        {ver.keptText ? (lang === "th" ? "✓ มีข้อความ OCR เดิม" : "✓ OCR text stored") : ""}
                      </span>
                      <button
                        type="button"
                        disabled={isRollingBack}
                        onClick={() => setConfirmRollbackVersion(ver.version)}
                        className={`${btn.primary} h-7 px-2.5 text-[11px]`}
                      >
                        {isRollingBack && confirmRollbackVersion === ver.version
                          ? lang === "th"
                            ? "กำลังย้อนกลับ..."
                            : "Restoring..."
                          : lang === "th"
                            ? `ย้อนกลับเป็น v${ver.version}`
                            : `Rollback to v${ver.version}`}
                      </button>
                    </div>

                    {confirmRollbackVersion === ver.version && (
                      <div className="rounded-[3px] border border-amend-line bg-amend-bg/30 p-3 mt-3 space-y-2 animate-in fade-in duration-100">
                        <div className="text-[12px] font-semibold text-ink flex items-center gap-1.5">
                          <span>⚠️</span>
                          <span>
                            {lang === "th"
                              ? `ยืนยันการย้อนกลับเนื้อหาเป็นเวอร์ชัน v${ver.version}?`
                              : `Confirm rollback to version v${ver.version}?`}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-2 leading-relaxed">
                          {lang === "th"
                            ? `ระบบจะนำเนื้อหาและผลการสกัดของเวอร์ชัน v${ver.version} กลับมาใช้งาน และจะบันทึกเป็นเวอร์ชันใหม่ (v${(currentVersion ?? 1) + 1}) เพื่อให้สามารถย้อนกลับคืนได้เสมอ`
                            : `Fields from version v${ver.version} will be restored as a new version v${(currentVersion ?? 1) + 1}.`}
                        </p>
                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-line/40">
                          <button
                            type="button"
                            disabled={isRollingBack}
                            onClick={() => setConfirmRollbackVersion(null)}
                            className={`${btn.secondary} text-[11px] h-6.5 px-2.5`}
                          >
                            {lang === "th" ? "ยกเลิก" : "Cancel"}
                          </button>
                          <button
                            type="button"
                            disabled={isRollingBack}
                            onClick={() => {
                              onRollback(ver.version);
                              setConfirmRollbackVersion(null);
                            }}
                            className={`${btn.primary} text-[11px] h-6.5 px-3 font-semibold`}
                          >
                            {isRollingBack
                              ? (lang === "th" ? "กำลังย้อนกลับ..." : "Restoring...")
                              : (lang === "th" ? "ยืนยันย้อนกลับ" : "Confirm Rollback")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Drawer Footer */}
        <div className="border-t border-line bg-surface-2 px-5 py-3 text-[12px] text-ink-3">
          {lang === "th"
            ? "การย้อนกลับจะสร้างเวอร์ชันใหม่โดยนำข้อมูลจากเวอร์ชันที่เลือกกลับมาใช้งาน"
            : "Rolling back restores the selected version's fields and records a new version."}
        </div>
      </div>
    </div>
  );
}

export function EvidenceGroundingDrawer({
  isOpen,
  onClose,
  evidence,
  lang = "th",
}: {
  isOpen: boolean;
  onClose: () => void;
  evidence: Record<string, unknown> | null | undefined;
  lang?: "th" | "en";
}) {
  if (!isOpen) return null;

  const entries = Object.entries(evidence || {}).filter(([, val]) => Boolean(val));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[1px]">
      <div className="flex h-full w-full max-w-lg flex-col bg-surface border-l border-line shadow-2xl animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">
              {lang === "th" ? "หลักฐานอ้างอิงจากเอกสาร TOR (Evidence Grounding)" : "TOR Grounding Evidence"}
            </h2>
            <p className="text-[12px] text-ink-3 mt-0.5">
              {lang === "th"
                ? "ข้อความต้นฉบับที่ AI ใช้สกัดข้อมูล (NFR-17)"
                : "Exact quotations extracted from source document (NFR-17)"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-[3px] text-ink-3 hover:bg-surface-2 hover:text-ink cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {entries.length === 0 ? (
            <div className="rounded-[3px] border border-line bg-surface-2 p-6 text-center text-[13px] text-ink-3">
              {lang === "th"
                ? "ไม่มีข้อมูลข้อความอ้างอิง (Evidence) ที่บันทึกไว้สำหรับโครงการนี้"
                : "No grounding quotes recorded for this project."}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {entries.map(([key, value]) => (
                <div key={key} className="rounded-[3px] border border-line bg-surface-2 p-3">
                  <div className="font-mono text-[11px] font-semibold text-ink-2 uppercase tracking-wider mb-1.5">
                    {key}
                  </div>
                  <blockquote className="border-l-2 border-open pl-3 text-[12.5px] leading-relaxed text-ink font-serif italic bg-surface p-2 rounded-[2px]">
                    {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}
                  </blockquote>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export type EditDiffItem = {
  section: string;
  field: string;
  labelTh: string;
  labelEn: string;
  from: string;
  to: string;
};

function SmartDiffContent({
  from,
  to,
  lang,
}: {
  from: string;
  to: string;
  lang: "th" | "en";
}) {
  const isList =
    (from.includes(";") || to.includes(";") || (from.includes(",") && to.includes(","))) &&
    !from.includes("\n");

  if (isList) {
    const sep = from.includes(";") || to.includes(";") ? ";" : ",";
    const fromItems = from
      .split(sep)
      .map((s) => s.trim())
      .filter(Boolean);
    const toItems = to
      .split(sep)
      .map((s) => s.trim())
      .filter(Boolean);

    const fromSet = new Set(fromItems);
    const toSet = new Set(toItems);

    const added = toItems.filter((x) => !fromSet.has(x));
    const removed = fromItems.filter((x) => !toSet.has(x));
    const unchanged = toItems.filter((x) => fromSet.has(x));

    if (added.length > 0 || removed.length > 0) {
      return (
        <div className="space-y-2 pt-1 text-[11.5px]">
          {removed.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-mono uppercase text-risk font-semibold flex items-center gap-1">
                <span>✕</span>
                <span>{lang === "th" ? "รายการที่ลบออก" : "Removed Items"}</span>
                <span className="opacity-75">({removed.length})</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {removed.map((it, idx) => (
                  <span
                    key={idx}
                    className="rounded-[2px] bg-risk-bg text-risk border border-risk-line px-1.5 py-0.5 font-mono line-through"
                  >
                    {it}
                  </span>
                ))}
              </div>
            </div>
          )}
          {added.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-mono uppercase text-open font-semibold flex items-center gap-1">
                <span>+</span>
                <span>{lang === "th" ? "รายการที่เพิ่มใหม่" : "Added Items"}</span>
                <span className="opacity-75">({added.length})</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {added.map((it, idx) => (
                  <span
                    key={idx}
                    className="rounded-[2px] bg-open-bg text-open border border-open-line px-1.5 py-0.5 font-semibold font-mono"
                  >
                    {it}
                  </span>
                ))}
              </div>
            </div>
          )}
          {unchanged.length > 0 && (
            <div className="text-[10.5px] text-ink-3 pt-0.5 font-mono">
              {lang === "th"
                ? `(คงเดิม ${unchanged.length} รายการ)`
                : `(${unchanged.length} items unchanged)`}
            </div>
          )}
        </div>
      );
    }
  }

  // Word-level diff for sentences / multi-words
  const fromWords = from.trim().split(/\s+/).filter(Boolean);
  const toWords = to.trim().split(/\s+/).filter(Boolean);
  const isMultiWord = fromWords.length > 2 || toWords.length > 2;

  if (isMultiWord && from && to) {
    const fromSet = new Set(fromWords);
    const toSet = new Set(toWords);
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px] pt-1">
        <div className="rounded-[2px] bg-surface p-2 border border-line">
          <div className="text-[10px] uppercase font-mono text-ink-3 mb-0.5">
            {lang === "th" ? "ค่าเดิม (Before)" : "Previous Value"}
          </div>
          <div className="break-words font-mono text-[11.5px] leading-relaxed">
            {fromWords.map((w, i) => (
              <span
                key={i}
                className={
                  !toSet.has(w)
                    ? "bg-risk-bg text-risk line-through px-0.5 rounded-[1px] mr-1"
                    : "text-ink-2 mr-1"
                }
              >
                {w}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-[2px] bg-open-bg/30 p-2 border border-open-line">
          <div className="text-[10px] uppercase font-mono text-open font-semibold mb-0.5">
            {lang === "th" ? "ค่าใหม่ (After)" : "New Value"}
          </div>
          <div className="break-words font-mono text-[11.5px] leading-relaxed">
            {toWords.map((w, i) => (
              <span
                key={i}
                className={
                  !fromSet.has(w)
                    ? "bg-open-bg text-open font-semibold px-0.5 rounded-[1px] border border-open-line mr-1"
                    : "text-ink mr-1"
                }
              >
                {w}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Standard side-by-side Before/After for scalar/short values
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px] pt-1">
      <div className="rounded-[2px] bg-surface p-2 border border-line">
        <div className="text-[10px] uppercase font-mono text-ink-3 mb-0.5">
          {lang === "th" ? "ค่าเดิม (Before)" : "Previous Value"}
        </div>
        <div className="text-ink-3 line-through break-words font-mono text-[11.5px]">
          {from || <span className="italic opacity-60">(ว่าง / Unspecified)</span>}
        </div>
      </div>

      <div className="rounded-[2px] bg-open-bg/40 p-2 border border-open-line">
        <div className="text-[10px] uppercase font-mono text-open font-semibold mb-0.5">
          {lang === "th" ? "ค่าใหม่ (After)" : "New Value"}
        </div>
        <div className="text-ink font-semibold break-words font-mono text-[11.5px]">
          {to || <span className="italic opacity-60 text-ink-3">(ล้างค่า / Cleared)</span>}
        </div>
      </div>
    </div>
  );
}

export function EditSummaryConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  diffs,
  isSaving,
  onRevertField,
  onDiscardAll,
  lang = "th",
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  diffs: EditDiffItem[];
  isSaving: boolean;
  onRevertField?: (fieldKey: string) => void;
  onDiscardAll?: () => void;
  lang?: "th" | "en";
}) {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Lock body scroll and listen for Escape key
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSaving && !showDiscardConfirm) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isSaving, showDiscardConfirm, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-ink/40 backdrop-blur-[2px] animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
    >
      <div
        className="relative flex flex-col w-full max-w-2xl max-h-[85vh] bg-surface border border-line rounded-[4px] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line bg-surface-2 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-[3px] bg-ink text-surface text-[13px]">
              📋
            </span>
            <div>
              <h2 className="text-[14px] font-semibold text-ink leading-tight">
                {lang === "th" ? "สรุปรายการที่แก้ไขและยืนยันการอนุมัติ" : "Review Edit Summary & Confirm"}
              </h2>
              <p className="text-[11.5px] text-ink-3">
                {lang === "th"
                  ? "ตรวจสอบรายการที่เปลี่ยนแปลงก่อนบันทึกและเผยแพร่ข้อมูลสู่สาธารณะ"
                  : "Review modified fields before saving and publishing changes"}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-[2px] text-ink-3 hover:bg-surface hover:text-ink transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Status / Count Banner */}
        <div className="px-5 py-2.5 border-b border-line bg-surface flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-[2px] px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                diffs.length > 0
                  ? "border border-amend-line bg-amend-bg text-amend"
                  : "bg-surface-2 text-ink-3 border border-line"
              }`}
            >
              {diffs.length > 0
                ? lang === "th"
                  ? `มีการเปลี่ยนแปลง ${diffs.length} รายการ`
                  : `${diffs.length} field(s) modified`
                : lang === "th"
                ? "ไม่มีข้อมูลที่เปลี่ยนแปลง"
                : "No fields modified"}
            </span>
          </div>
          <span className="text-[11px] text-ink-3 font-mono">
            {lang === "th" ? "Action: approve" : "Action: approve"}
          </span>
        </div>

        {/* Body / Diff List */}
        <div className="flex-1 overflow-y-auto p-5">
          {diffs.length === 0 ? (
            <div className="rounded-[3px] border border-line bg-surface-2/60 p-6 text-center space-y-1.5">
              <p className="text-[13px] font-medium text-ink">
                {lang === "th"
                  ? "ไม่มีการแก้ไขข้อมูลในฟอร์ม"
                  : "No form fields were changed"}
              </p>
              <p className="text-[12px] text-ink-3 leading-relaxed">
                {lang === "th"
                  ? "การยืนยันจะเป็นการอนุมัติข้อมูลฉบับปัจจุบัน และปรับสถานะโครงการเป็นพร้อมแสดงผลต่อสาธารณะทันที"
                  : "Confirming will approve the existing extraction and publish the TOR immediately."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {diffs.map((d, idx) => (
                <div
                  key={`${d.field}-${idx}`}
                  className="rounded-[3px] border border-line bg-surface-2/40 p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-[2px] border border-line bg-surface px-1.5 py-0.5 text-[10.5px] font-mono text-ink-3">
                        {d.section}
                      </span>
                      <span className="text-[12.5px] font-semibold text-ink">
                        {lang === "th" ? d.labelTh : d.labelEn}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {onRevertField && (
                        <button
                          type="button"
                          onClick={() => onRevertField(d.field)}
                          className="text-[10.5px] text-ink-3 hover:text-ink hover:underline flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] border border-line bg-surface hover:bg-surface-2 transition-colors cursor-pointer"
                          title={lang === "th" ? "คืนค่าฟิลด์นี้กลับเป็นค่าเดิม" : "Revert this field"}
                        >
                          <span>↺</span>
                          <span>{lang === "th" ? "คืนค่า" : "Revert"}</span>
                        </button>
                      )}
                      <span className="font-mono text-[10.5px] text-ink-3">
                        {d.field}
                      </span>
                    </div>
                  </div>

                  {/* Smart Diff view */}
                  <SmartDiffContent from={d.from} to={d.to} lang={lang} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-2 px-5 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className={`${btn.secondary} text-[12.5px] h-8 px-4`}
            >
              {lang === "th" ? "← กลับไปแก้ไข" : "Back to Edit"}
            </button>
            {onDiscardAll && diffs.length > 0 && (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setShowDiscardConfirm(true)}
                className="text-[11.5px] text-risk hover:underline px-2.5 py-1 rounded-[2px] hover:bg-risk-bg transition-colors cursor-pointer"
              >
                {lang === "th" ? "ยกเลิกการแก้ไขทั้งหมด" : "Discard All Changes"}
              </button>
            )}
          </div>

          <button
            type="button"
            disabled={isSaving}
            onClick={onConfirm}
            className={`${btn.primary} text-[12.5px] h-8 px-5 font-semibold flex items-center gap-1.5`}
          >
            {isSaving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-surface border-t-transparent rounded-full animate-spin" />
                <span>{lang === "th" ? "กำลังบันทึก..." : "Saving..."}</span>
              </>
            ) : (
              <span>{lang === "th" ? "✓ ยืนยันการบันทึกและอนุมัติ" : "Confirm & Publish"}</span>
            )}
          </button>
        </div>
      </div>

      {/* Safety Confirmation Dialog for Discard All Changes */}
      {showDiscardConfirm && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm animate-in fade-in duration-100"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDiscardConfirm(false);
          }}
        >
          <div
            className="relative flex flex-col w-full max-w-md bg-surface border border-line rounded-[4px] shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-risk-bg text-risk text-[18px]">
                ⚠️
              </span>
              <div className="space-y-1">
                <h3 className="text-[15px] font-semibold text-ink">
                  {lang === "th"
                    ? "ยืนยันการยกเลิกการแก้ไขทั้งหมด?"
                    : "Discard All Changes?"}
                </h3>
                <p className="text-[12.5px] text-ink-2 leading-relaxed">
                  {lang === "th"
                    ? `คุณแน่ใจหรือไม่ว่าต้องการยกเลิกการแก้ไขทั้งหมด (${diffs.length} รายการ) และคืนค่าของทุกฟิลด์กลับไปเป็นค่าดั้งเดิมจากเอกสาร TOR? ข้อมูลที่คุณแก้ไขในรอบนี้จะไม่ถูกบันทึก`
                    : `Are you sure you want to discard all ${diffs.length} modified field(s) and reset back to original extracted values? Your edits will be lost.`}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className={`${btn.secondary} text-[12px] h-8 px-3.5`}
              >
                {lang === "th" ? "กลับไปแก้ไขต่อ" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDiscardConfirm(false);
                  if (onDiscardAll) {
                    onDiscardAll();
                  }
                  onClose();
                }}
                className="rounded-[3px] bg-risk px-4 h-8 text-[12px] font-semibold text-white hover:opacity-90 transition-opacity cursor-pointer"
              >
                {lang === "th" ? "ยืนยันคืนค่าทั้งหมด" : "Yes, Discard All"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
