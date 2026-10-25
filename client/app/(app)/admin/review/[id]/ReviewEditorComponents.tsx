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
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  emptyHint?: string;
  lang?: "th" | "en";
  confidenceBadge?: React.ReactNode;
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
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
              className={`${input} flex-1`}
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
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
                        onClick={() => onRollback(ver.version)}
                        className={`${btn.primary} h-7 px-2.5 text-[11px]`}
                      >
                        {isRollingBack
                          ? lang === "th"
                            ? "กำลังย้อนกลับ..."
                            : "Restoring..."
                          : lang === "th"
                            ? `ย้อนกลับเป็น v${ver.version}`
                            : `Rollback to v${ver.version}`}
                      </button>
                    </div>
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
