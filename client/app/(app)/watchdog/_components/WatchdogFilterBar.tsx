"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Filter, RotateCcw, X } from "lucide-react";
import { pick, type Lang, type RiskLevel, type Status } from "../../../_data/tors";
import {
  ARCHETYPE_OPTIONS,
  CATEGORY_OPTIONS,
  COMPLEXITY_OPTIONS,
  getArchetypeLabel,
  getCategoryLabel,
  getComplexityLabel,
  type ComplexityTier,
  type ProjectCategory,
  type SystemArchetype,
} from "../../../_data/watchdog";
import { Chip, input, Label, Panel } from "../../../_components/ui";
import { PRICE_BAND_OPTIONS, type PriceBandId } from "../_lib/types";

export type WatchdogFilterBarProps = {
  lang: Lang;
  // Multi-select status
  selectedStatuses: Status[];
  onToggleStatus: (status: Status) => void;
  onSelectAllStatuses: () => void;
  // Multi-select lock-spec risk level
  selectedRiskLevels: RiskLevel[];
  onToggleRiskLevel: (level: RiskLevel) => void;
  onSelectAllRiskLevels: () => void;
  // Multi-select complexity
  selectedComplexities: ComplexityTier[];
  onToggleComplexity: (tier: ComplexityTier) => void;
  onSelectAllComplexities: () => void;
  // Multi-select categories
  selectedCategories: ProjectCategory[];
  onToggleCategory: (cat: ProjectCategory) => void;
  onSelectAllCategories: () => void;
  onClearCategories: () => void;
  // Multi-select archetypes
  selectedArchetypes: SystemArchetype[];
  onToggleArchetype: (arch: SystemArchetype) => void;
  onSelectAllArchetypes: () => void;
  onClearArchetypes: () => void;
  // Agency
  agencyFilter: string;
  onAgencyChange: (val: string) => void;
  agencies: { th: string; en: string; count: number }[];
  // Price band
  priceBand: PriceBandId;
  onPriceBandChange: (val: PriceBandId) => void;
  // Time period
  effectiveStartMonth: string;
  effectiveEndMonth: string;
  defaultStartMonth: string;
  defaultEndMonth: string;
  onStartMonthChange: (val: string) => void;
  onEndMonthChange: (val: string) => void;
  availableMonths: { key: string; labelTh: string; labelEn: string; quarter: string }[];
  hasActiveFilters: boolean;
  onResetFilters: () => void;
};

const STATUS_ITEMS: { id: Status; labelTh: string; labelEn: string }[] = [
  { id: "Open", labelTh: "เปิดรับซอง (Open)", labelEn: "Open for bidding" },
  { id: "Draft", labelTh: "ร่างรับฟัง (Draft)", labelEn: "Public hearing" },
  { id: "Awarded", labelTh: "ได้ผู้ชนะแล้ว (Awarded)", labelEn: "Awarded" },
  { id: "Closed", labelTh: "ปิดแล้ว (Closed)", labelEn: "Closed" },
];

const RISK_ITEMS: { id: RiskLevel; labelTh: string; labelEn: string; color: string }[] = [
  { id: "high", labelTh: "เสี่ยงสูง (High)", labelEn: "High Risk", color: "text-risk" },
  { id: "medium", labelTh: "ปานกลาง (Medium)", labelEn: "Medium Risk", color: "text-amend" },
  { id: "low", labelTh: "เปิดกว้าง (Low)", labelEn: "Low Risk", color: "text-open" },
];

export function WatchdogFilterBar({
  lang,
  selectedStatuses,
  onToggleStatus,
  onSelectAllStatuses,
  selectedRiskLevels,
  onToggleRiskLevel,
  onSelectAllRiskLevels,
  selectedComplexities,
  onToggleComplexity,
  onSelectAllComplexities,
  selectedCategories,
  onToggleCategory,
  onSelectAllCategories,
  onClearCategories,
  selectedArchetypes,
  onToggleArchetype,
  onSelectAllArchetypes,
  onClearArchetypes,
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
  hasActiveFilters,
  onResetFilters,
}: WatchdogFilterBarProps) {
  const [catOpen, setCatOpen] = useState(false);
  const [archOpen, setArchOpen] = useState(false);

  const catRef = useRef<HTMLDivElement>(null);
  const archRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (catRef.current && !catRef.current.contains(e.target as Node)) {
        setCatOpen(false);
      }
      if (archRef.current && !archRef.current.contains(e.target as Node)) {
        setArchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const allCategories = CATEGORY_OPTIONS.filter((c) => c.id !== "all");
  const allArchetypes = ARCHETYPE_OPTIONS.filter((a) => a.id !== "all");

  return (
    <Panel className="mb-6 p-4">
      {/* Top Header Label */}
      <div className="mb-3.5 flex items-center justify-between border-b border-line pb-2.5">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <Filter className="h-4 w-4 text-ink-2" />
          <span>{lang === "th" ? "กำหนดขอบเขตข้อมูลที่ต้องการวิเคราะห์ (Filters)" : "Analytical Scope & Filters"}</span>
        </div>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onResetFilters}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-2 hover:text-ink cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{lang === "th" ? "ล้างตัวกรองทั้งหมด" : "Reset all filters"}</span>
          </button>
        ) : null}
      </div>

      {/* Row 1: Pill Button Multi-Selects (Status, Lock-Spec Risk, Complexity) */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Status Multi-select */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>{lang === "th" ? "สถานะประกาศ (Status)" : "Tender status"}</Label>
            {selectedStatuses.length < STATUS_ITEMS.length ? (
              <button
                type="button"
                onClick={onSelectAllStatuses}
                className="text-[11px] text-ink-3 hover:text-ink cursor-pointer"
              >
                {lang === "th" ? "เลือกทั้งหมด" : "Select all"}
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_ITEMS.map((item) => {
              const active = selectedStatuses.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onToggleStatus(item.id)}
                  className={`inline-flex items-center gap-1 rounded-[3px] border px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
                    active
                      ? "border-ink bg-surface-3 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                      : "border-line bg-surface text-ink-3 hover:border-line-2 hover:text-ink"
                  }`}
                >
                  {active ? <Check className="h-3 w-3 text-ink" /> : null}
                  <span>{lang === "th" ? item.labelTh : item.labelEn}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Lock-Spec Risk Multi-select */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>{lang === "th" ? "ระดับความเสี่ยงล็อกสเปก (Lock-Spec Risk)" : "Lock-spec risk level"}</Label>
            {selectedRiskLevels.length < RISK_ITEMS.length ? (
              <button
                type="button"
                onClick={onSelectAllRiskLevels}
                className="text-[11px] text-ink-3 hover:text-ink cursor-pointer"
              >
                {lang === "th" ? "เลือกทั้งหมด" : "Select all"}
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {RISK_ITEMS.map((item) => {
              const active = selectedRiskLevels.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onToggleRiskLevel(item.id)}
                  className={`inline-flex items-center gap-1 rounded-[3px] border px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
                    active
                      ? "border-ink bg-surface-3 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                      : "border-line bg-surface text-ink-3 hover:border-line-2 hover:text-ink"
                  }`}
                >
                  {active ? <Check className="h-3 w-3 text-ink" /> : null}
                  <span className={active ? item.color : ""}>
                    {lang === "th" ? item.labelTh : item.labelEn}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Complexity Tier Multi-select */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>{lang === "th" ? "ขนาดความซับซ้อน (Complexity Tier)" : "Complexity tier"}</Label>
            {selectedComplexities.length < 3 ? (
              <button
                type="button"
                onClick={onSelectAllComplexities}
                className="text-[11px] text-ink-3 hover:text-ink cursor-pointer"
              >
                {lang === "th" ? "เลือกทั้งหมด" : "Select all"}
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: "basic" as ComplexityTier, th: "พื้นฐาน (Basic)", en: "Basic" },
                { id: "standard" as ComplexityTier, th: "มาตรฐาน (Standard)", en: "Standard" },
                { id: "enterprise" as ComplexityTier, th: "องค์กรใหญ่ (Enterprise)", en: "Enterprise" },
              ] as const
            ).map((item) => {
              const active = selectedComplexities.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onToggleComplexity(item.id)}
                  className={`inline-flex items-center gap-1 rounded-[3px] border px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
                    active
                      ? "border-ink bg-surface-3 text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                      : "border-line bg-surface text-ink-3 hover:border-line-2 hover:text-ink"
                  }`}
                >
                  {active ? <Check className="h-3 w-3 text-ink" /> : null}
                  <span>{lang === "th" ? item.th : item.en}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 2: Dropdowns (Category Multi-Select, Archetype Multi-Select, Agency, Price Band, Time Period) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {/* Category Popover Multi-Select */}
        <div className="relative flex flex-col gap-1.5" ref={catRef}>
          <Label htmlFor="wd-category-btn">
            {lang === "th" ? "หมวดหมู่งาน IT" : "IT categories"}
          </Label>
          <button
            id="wd-category-btn"
            type="button"
            onClick={() => setCatOpen((prev) => !prev)}
            className="flex h-9 w-full items-center justify-between rounded-[3px] border border-line-2 bg-surface px-2.5 text-left text-[12.5px] text-ink hover:border-ink cursor-pointer"
          >
            <span className="truncate">
              {selectedCategories.length === 0
                ? lang === "th"
                  ? "ทุกหมวดหมู่งาน IT"
                  : "All categories"
                : lang === "th"
                  ? `เลือก ${selectedCategories.length} หมวดหมู่`
                  : `${selectedCategories.length} categories`}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
          </button>

          {/* Category Dropdown Popover */}
          {catOpen ? (
            <div className="absolute top-[62px] left-0 z-30 w-72 rounded-[4px] border border-line-2 bg-surface p-2 shadow-lg">
              <div className="mb-2 flex items-center justify-between border-b border-line pb-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={onSelectAllCategories}
                  className="text-ink-2 hover:text-ink cursor-pointer"
                >
                  {lang === "th" ? "เลือกทั้งหมด" : "Select all"}
                </button>
                <button
                  type="button"
                  onClick={onClearCategories}
                  className="text-ink-3 hover:text-ink cursor-pointer"
                >
                  {lang === "th" ? "ล้างการเลือก" : "Clear"}
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
                {allCategories.map((opt) => {
                  const checked = selectedCategories.includes(opt.id as ProjectCategory);
                  return (
                    <label
                      key={opt.id}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] text-ink hover:bg-surface-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleCategory(opt.id as ProjectCategory)}
                        className="rounded border-line"
                      />
                      <span className="truncate">{pick(opt.label, lang)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Archetype Popover Multi-Select */}
        <div className="relative flex flex-col gap-1.5" ref={archRef}>
          <Label htmlFor="wd-archetype-btn">
            {lang === "th" ? "รูปแบบสถาปัตยกรรม" : "System archetypes"}
          </Label>
          <button
            id="wd-archetype-btn"
            type="button"
            onClick={() => setArchOpen((prev) => !prev)}
            className="flex h-9 w-full items-center justify-between rounded-[3px] border border-line-2 bg-surface px-2.5 text-left text-[12.5px] text-ink hover:border-ink cursor-pointer"
          >
            <span className="truncate">
              {selectedArchetypes.length === 0
                ? lang === "th"
                  ? "ทุกรูปแบบระบบ"
                  : "All archetypes"
                : lang === "th"
                  ? `เลือก ${selectedArchetypes.length} รูปแบบ`
                  : `${selectedArchetypes.length} archetypes`}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
          </button>

          {/* Archetype Dropdown Popover */}
          {archOpen ? (
            <div className="absolute top-[62px] left-0 z-30 w-72 rounded-[4px] border border-line-2 bg-surface p-2 shadow-lg">
              <div className="mb-2 flex items-center justify-between border-b border-line pb-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={onSelectAllArchetypes}
                  className="text-ink-2 hover:text-ink cursor-pointer"
                >
                  {lang === "th" ? "เลือกทั้งหมด" : "Select all"}
                </button>
                <button
                  type="button"
                  onClick={onClearArchetypes}
                  className="text-ink-3 hover:text-ink cursor-pointer"
                >
                  {lang === "th" ? "ล้างการเลือก" : "Clear"}
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
                {allArchetypes.map((opt) => {
                  const checked = selectedArchetypes.includes(opt.id as SystemArchetype);
                  return (
                    <label
                      key={opt.id}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] text-ink hover:bg-surface-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleArchetype(opt.id as SystemArchetype)}
                        className="rounded border-line"
                      />
                      <span className="truncate">{pick(opt.label, lang)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Agency Filter */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wd-agency">
            {lang === "th" ? "หน่วยงานผู้จัดซื้อ" : "Procuring agency"}
          </Label>
          <select
            id="wd-agency"
            value={agencyFilter}
            onChange={(e) => onAgencyChange(e.target.value)}
            className={input}
          >
            <option value="all">
              {lang === "th"
                ? `ทุกหน่วยงาน (${agencies.length})`
                : `All agencies (${agencies.length})`}
            </option>
            {agencies.map((ag) => (
              <option key={ag.th} value={ag.th}>
                {lang === "th" ? ag.th : ag.en} ({ag.count})
              </option>
            ))}
          </select>
        </div>

        {/* Price Band Filter */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wd-price-band">
            {lang === "th" ? "ช่วงราคากลาง" : "Reference price range"}
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

        {/* Time Period Filter */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="wd-start-month">
            {lang === "th" ? "ช่วงเวลาประกาศ" : "Time period"}
          </Label>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
            <select
              id="wd-start-month"
              aria-label={lang === "th" ? "ตั้งแต่เดือน" : "Start month"}
              value={effectiveStartMonth}
              onChange={(e) => onStartMonthChange(e.target.value)}
              className="h-9 rounded-[3px] border border-line-2 bg-surface px-1.5 text-[11.5px] text-ink"
            >
              {availableMonths.map((m) => (
                <option key={m.key} value={m.key}>
                  {lang === "th" ? m.labelTh : m.labelEn}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-ink-3 text-center">–</span>
            <select
              id="wd-end-month"
              aria-label={lang === "th" ? "ถึงเดือน" : "End month"}
              value={effectiveEndMonth}
              onChange={(e) => onEndMonthChange(e.target.value)}
              className="h-9 rounded-[3px] border border-line-2 bg-surface px-1.5 text-[11.5px] text-ink"
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

      {/* Active Filter Chips & Summary */}
      {hasActiveFilters ? (
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            <span className="text-ink-3">
              {lang === "th" ? "ตัวกรองที่ใช้งานอยู่:" : "Active filters:"}
            </span>
            {selectedStatuses.length < STATUS_ITEMS.length ? (
              <Chip>
                {lang === "th" ? `สถานะ: ${selectedStatuses.join(", ")}` : `Status: ${selectedStatuses.join(", ")}`}
              </Chip>
            ) : null}
            {selectedRiskLevels.length < RISK_ITEMS.length ? (
              <Chip>
                {lang === "th" ? `ความเสี่ยง: ${selectedRiskLevels.join(", ").toUpperCase()}` : `Risk: ${selectedRiskLevels.join(", ").toUpperCase()}`}
              </Chip>
            ) : null}
            {selectedComplexities.length < 3 ? (
              <Chip>
                {lang === "th"
                  ? `ความซับซ้อน: ${selectedComplexities.map((c) => getComplexityLabel(c, lang)).join(", ")}`
                  : `Complexity: ${selectedComplexities.join(", ")}`}
              </Chip>
            ) : null}
            {selectedCategories.length > 0 ? (
              <Chip>
                {lang === "th"
                  ? `หมวดหมู่ (${selectedCategories.length}): ${selectedCategories.map((c) => getCategoryLabel(c, lang)).join(", ")}`
                  : `Categories (${selectedCategories.length})`}
              </Chip>
            ) : null}
            {selectedArchetypes.length > 0 ? (
              <Chip>
                {lang === "th"
                  ? `รูปแบบ (${selectedArchetypes.length}): ${selectedArchetypes.map((a) => getArchetypeLabel(a, lang)).join(", ")}`
                  : `Archetypes (${selectedArchetypes.length})`}
              </Chip>
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
          </div>
          <button
            type="button"
            onClick={onResetFilters}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-2 underline hover:text-ink cursor-pointer"
          >
            <X className="h-3 w-3" />
            <span>{lang === "th" ? "ล้างตัวกรอง" : "Reset"}</span>
          </button>
        </div>
      ) : null}
    </Panel>
  );
}
