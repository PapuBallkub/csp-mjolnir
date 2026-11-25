import { SECTIONS_LIST } from "../_lib/review-form";

export function ReviewSectionNav({
  activeSection,
  diffsBySection,
  totalDiffs,
  mobileTocOpen,
  onToggleMobileToc,
  onSelectSection,
}: {
  activeSection: string;
  diffsBySection: Record<string, number>;
  totalDiffs: number;
  mobileTocOpen: boolean;
  onToggleMobileToc: () => void;
  onSelectSection: (sectionId: string) => void;
}) {
  return (
    <div className="lg:col-span-1">
      <div className="lg:sticky lg:top-[125px] flex flex-col gap-1 rounded-2xl border border-line bg-surface p-2 shadow-xs">
        <button
          type="button"
          onClick={onToggleMobileToc}
          aria-expanded={mobileTocOpen}
          className="lg:hidden flex w-full items-center justify-between px-2.5 py-2 text-left text-[12.5px] font-semibold text-ink cursor-pointer"
        >
          <span className="truncate">
            หัวข้อข้อมูล TOR ทั้ง 10 ส่วน
            {totalDiffs > 0 ? ` (แก้ไข ${totalDiffs})` : ""}
          </span>
          <span className="ml-2 text-[11px] text-ink-3 shrink-0">
            {mobileTocOpen ? "▲ ซ่อน" : "▼ แสดง"}
          </span>
        </button>
        <span className="hidden lg:block px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-3">
          {"หัวข้อข้อมูล TOR ทั้ง 10 ส่วน"}
        </span>
        <div className={`${mobileTocOpen ? "flex" : "hidden"} lg:flex flex-col gap-1`}>
          {SECTIONS_LIST.map((sec) => {
            const sectionDiffCount = diffsBySection[sec.section] || 0;
            return (
              <button
                key={sec.id}
                type="button"
                aria-current={activeSection === sec.id ? "location" : undefined}
                onClick={() => onSelectSection(sec.id)}
                className={`flex items-center justify-between text-left px-3 py-2 text-[12px] font-medium rounded-xl transition-colors cursor-pointer ${
                  activeSection === sec.id
                    ? "bg-ink text-surface shadow-xs"
                    : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <span className="truncate">{sec.label}</span>
                {sectionDiffCount > 0 ? (
                  <span className="ml-2 rounded-full bg-amend text-surface text-[10px] font-bold px-1.5 py-0.2 shrink-0">
                    {sectionDiffCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
