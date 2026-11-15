"use client";

import { pick, type Lang, type RiskLevel } from "../../../_data/tors";
import {
  ARCHETYPE_OPTIONS,
  CATEGORY_OPTIONS,
  COMPLEXITY_OPTIONS,
  getArchetypeLabel,
  getCategoryLabel,
  getComplexityLabel,
  type ComplexityTier,
  type LockSpecTriggerId,
  type ProjectCategory,
  type SystemArchetype,
} from "../../../_data/watchdog";
import { Chip, input, Label, Panel } from "../../../_components/ui";
import { PRICE_BAND_OPTIONS, type PriceBandId } from "../_lib/types";

export type WatchdogFilterBarProps = {
  lang: Lang;
  category: ProjectCategory | "all";
  onCategoryChange: (val: ProjectCategory | "all") => void;
  archetype: SystemArchetype | "all";
  onArchetypeChange: (val: SystemArchetype | "all") => void;
  complexity: ComplexityTier | "all";
  onComplexityChange: (val: ComplexityTier | "all") => void;
  agencyFilter: string;
  onAgencyChange: (val: string) => void;
  agencies: { th: string; en: string; count: number }[];
  priceBand: PriceBandId;
  onPriceBandChange: (val: PriceBandId) => void;
  effectiveStartMonth: string;
  effectiveEndMonth: string;
  defaultStartMonth: string;
  defaultEndMonth: string;
  onStartMonthChange: (val: string) => void;
  onEndMonthChange: (val: string) => void;
  availableMonths: { key: string; labelTh: string; labelEn: string; quarter: string }[];
  selectedBucket: string | null;
  selectedTrigger: LockSpecTriggerId | null;
  selectedRiskTier: RiskLevel | null;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
};

export function WatchdogFilterBar({
  lang,
  category,
  onCategoryChange,
  archetype,
  onArchetypeChange,
  complexity,
  onComplexityChange,
  agencyFilter,
  onAgencyChange,
  agencies,
  priceBand,
  onPriceBandChange,
  effectiveStartMonth,
  effectiveEndMonth,
  defaultStartMonth,
  defaultEndMonth,
  onStartMonthChange,
  onEndMonthChange,
  availableMonths,
  selectedBucket,
  selectedTrigger,
  selectedRiskTier,
  hasActiveFilters,
  onResetFilters,
}: WatchdogFilterBarProps) {
  return (
    <Panel className="mb-6 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Category Filter */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wd-category">
            {lang === "th" ? "หมวดหมู่งาน IT (Category)" : "IT project category"}
          </Label>
          <select
            id="wd-category"
            value={category}
            onChange={(e) => onCategoryChange(e.target.value as ProjectCategory | "all")}
            className={input}
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {pick(opt.label, lang)}
              </option>
            ))}
          </select>
        </div>

        {/* System Archetype Filter */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wd-archetype">
            {lang === "th" ? "รูปแบบสถาปัตยกรรมระบบ (Archetype)" : "System archetype"}
          </Label>
          <select
            id="wd-archetype"
            value={archetype}
            onChange={(e) => onArchetypeChange(e.target.value as SystemArchetype | "all")}
            className={input}
          >
            {ARCHETYPE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {pick(opt.label, lang)}
              </option>
            ))}
          </select>
        </div>

        {/* Complexity Tier Filter */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wd-complexity">
            {lang === "th" ? "ขนาดและความซับซ้อน (Complexity)" : "Complexity tier"}
          </Label>
          <select
            id="wd-complexity"
            value={complexity}
            onChange={(e) => onComplexityChange(e.target.value as ComplexityTier | "all")}
            className={input}
          >
            {COMPLEXITY_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {pick(opt.label, lang)}
              </option>
            ))}
          </select>
        </div>

        {/* Agency Filter */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wd-agency">
            {lang === "th" ? "หน่วยงานผู้จัดซื้อ (Agency)" : "Procuring agency"}
          </Label>
          <select
            id="wd-agency"
            value={agencyFilter}
            onChange={(e) => onAgencyChange(e.target.value)}
            className={input}
          >
            <option value="all">
              {lang === "th"
                ? `ทุกหน่วยงาน (${agencies.length} หน่วยงาน)`
                : `All agencies (${agencies.length})`}
            </option>
            {agencies.map((ag) => (
              <option key={ag.th} value={ag.th}>
                {lang === "th" ? ag.th : ag.en} ({ag.count})
              </option>
            ))}
          </select>
        </div>

        {/* Price Range Filter */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wd-price-band">
            {lang === "th" ? "ช่วงราคากลาง (Price range)" : "Reference price range"}
          </Label>
          <select
            id="wd-price-band"
            value={priceBand}
            onChange={(e) => onPriceBandChange(e.target.value as PriceBandId)}
            className={input}
          >
            {PRICE_BAND_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {pick(opt.label, lang)}
              </option>
            ))}
          </select>
        </div>

        {/* Time Period Range Filter */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wd-start-month">
            {lang === "th" ? "ช่วงเวลาประกาศ (Time period)" : "Time period"}
          </Label>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
            <select
              id="wd-start-month"
              aria-label={lang === "th" ? "ตั้งแต่เดือน" : "Start month"}
              value={effectiveStartMonth}
              onChange={(e) => onStartMonthChange(e.target.value)}
              className={input}
            >
              {availableMonths.map((m) => (
                <option key={m.key} value={m.key}>
                  {lang === "th" ? m.labelTh : m.labelEn}
                </option>
              ))}
            </select>
            <span className="text-[12px] text-ink-3">–</span>
            <select
              id="wd-end-month"
              aria-label={lang === "th" ? "ถึงเดือน" : "End month"}
              value={effectiveEndMonth}
              onChange={(e) => onEndMonthChange(e.target.value)}
              className={input}
            >
              {availableMonths.map((m) => (
                <option key={m.key} value={m.key}>
                  {lang === "th" ? m.labelTh : m.labelEn}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Active Filter Pills & Reset */}
      {hasActiveFilters ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-ink-3">
              {lang === "th" ? "ตัวกรองที่เลือก:" : "Active filters:"}
            </span>
            {category !== "all" ? (
              <Chip>{getCategoryLabel(category, lang)}</Chip>
            ) : null}
            {archetype !== "all" ? (
              <Chip>{getArchetypeLabel(archetype, lang)}</Chip>
            ) : null}
            {complexity !== "all" ? (
              <Chip>{getComplexityLabel(complexity, lang)}</Chip>
            ) : null}
            {agencyFilter !== "all" ? <Chip>{agencyFilter}</Chip> : null}
            {priceBand !== "all" ? (
              <Chip>
                {pick(
                  PRICE_BAND_OPTIONS.find((b) => b.id === priceBand)!.label,
                  lang,
                )}
              </Chip>
            ) : null}
            {effectiveStartMonth !== defaultStartMonth ||
            effectiveEndMonth !== defaultEndMonth ? (
              <Chip>
                {(() => {
                  const s = availableMonths.find((m) => m.key === effectiveStartMonth);
                  const e = availableMonths.find((m) => m.key === effectiveEndMonth);
                  const sLbl = s ? (lang === "th" ? s.labelTh : s.labelEn) : effectiveStartMonth;
                  const eLbl = e ? (lang === "th" ? e.labelTh : e.labelEn) : effectiveEndMonth;
                  return `${sLbl} – ${eLbl}`;
                })()}
              </Chip>
            ) : null}
            {selectedBucket ? (
              <Chip>
                {lang === "th" ? `ช่วงเวลา: ${selectedBucket}` : `Period: ${selectedBucket}`}
              </Chip>
            ) : null}
            {selectedRiskTier ? (
              <Chip>
                {lang === "th"
                  ? `ระดับความเสี่ยง: ${selectedRiskTier.toUpperCase()}`
                  : `Risk tier: ${selectedRiskTier.toUpperCase()}`}
              </Chip>
            ) : null}
            {selectedTrigger ? <Chip>{selectedTrigger}</Chip> : null}
          </div>
          <button
            type="button"
            onClick={onResetFilters}
            className="text-[12px] font-medium text-ink-2 underline hover:text-ink cursor-pointer"
          >
            {lang === "th" ? "ล้างตัวกรองทั้งหมด" : "Reset all filters"}
          </button>
        </div>
      ) : null}
    </Panel>
  );
}
