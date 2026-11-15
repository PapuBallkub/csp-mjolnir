"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { formatTHBCompact, pick, type Lang, type RiskLevel, type Status } from "../../../_data/tors";
import {
  ARCHETYPE_OPTIONS,
  CATEGORY_OPTIONS,
  type ComplexityTier,
  type ProjectCategory,
  type SystemArchetype,
} from "../../../_data/watchdog";
import { Label, Panel } from "../../../_components/ui";

export const MAX_SLIDER_PRICE = 50_000_000; // 50M ceiling for slider (means 50M+)

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
  // Multi-select agencies
  selectedAgencies: string[];
  onToggleAgency: (agency: string) => void;
  onSelectAllAgencies: () => void;
  onClearAgencies: () => void;
  agencies: Array<{ th: string; en: string; count: number }>;
  // Price range (min and max)
  minPriceTHB: number;
  maxPriceTHB: number; // 0 = unconstrained / 50M+
  onPriceRangeChange: (min: number, max: number) => void;
  // Time window (YYYY-MM)
  effectiveStartMonth: string;
  effectiveEndMonth: string;
  defaultStartMonth: string;
  defaultEndMonth: string;
  onStartMonthChange: (val: string) => void;
  onEndMonthChange: (val: string) => void;
  availableMonths: Array<{ key: string; labelTh: string; labelEn: string }>;
  // Reset
  hasActiveFilters: boolean;
  onResetFilters: () => void;
};

const STATUS_ITEMS: Array<{ id: Status; labelTh: string; labelEn: string }> = [
  { id: "Open", labelTh: "เปิดรับซอง (Open)", labelEn: "Open" },
  { id: "Draft", labelTh: "ร่างรับฟัง (Draft)", labelEn: "Draft" },
  { id: "Awarded", labelTh: "ได้ผู้ชนะ (Awarded)", labelEn: "Awarded" },
  { id: "Closed", labelTh: "ปิดแล้ว (Closed)", labelEn: "Closed" },
  { id: "Cancelled", labelTh: "ยกเลิก (Cancelled)", labelEn: "Cancelled" },
];

const RISK_ITEMS: Array<{ id: RiskLevel; labelTh: string; labelEn: string; color: string }> = [
  { id: "high", labelTh: "เสี่ยงสูง (High Risk)", labelEn: "High Risk", color: "text-risk" },
  { id: "medium", labelTh: "ปานกลาง (Medium Risk)", labelEn: "Medium Risk", color: "text-amend" },
  { id: "low", labelTh: "เปิดกว้าง (Low Risk)", labelEn: "Low Risk", color: "text-open" },
];

const COMPLEXITY_ITEMS: Array<{ id: ComplexityTier; th: string; en: string }> = [
  { id: "basic", th: "พื้นฐาน (Basic)", en: "Basic" },
  { id: "standard", th: "มาตรฐาน (Standard)", en: "Standard" },
  { id: "enterprise", th: "องค์กรใหญ่ (Enterprise)", en: "Enterprise" },
];

const ALL_MONTHS = [
  { value: "01", th: "ม.ค.", en: "Jan" },
  { value: "02", th: "ก.พ.", en: "Feb" },
  { value: "03", th: "มี.ค.", en: "Mar" },
  { value: "04", th: "เม.ย.", en: "Apr" },
  { value: "05", th: "พ.ค.", en: "May" },
  { value: "06", th: "มิ.ย.", en: "Jun" },
  { value: "07", th: "ก.ค.", en: "Jul" },
  { value: "08", th: "ส.ค.", en: "Aug" },
  { value: "09", th: "ก.ย.", en: "Sep" },
  { value: "10", th: "ต.ค.", en: "Oct" },
  { value: "11", th: "พ.ย.", en: "Nov" },
  { value: "12", th: "ธ.ค.", en: "Dec" },
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
  selectedAgencies,
  onToggleAgency,
  onSelectAllAgencies,
  onClearAgencies,
  agencies,
  minPriceTHB,
  maxPriceTHB,
  onPriceRangeChange,
  effectiveStartMonth,
  effectiveEndMonth,
  defaultStartMonth: _defaultStartMonth,
  defaultEndMonth: _defaultEndMonth,
  onStartMonthChange,
  onEndMonthChange,
  availableMonths: _availableMonths,
  hasActiveFilters,
  onResetFilters,
}: WatchdogFilterBarProps) {
  const [catOpen, setCatOpen] = useState(false);
  const [archOpen, setArchOpen] = useState(false);
  const [agencyOpen, setAgencyOpen] = useState(false);
  const [agencySearch, setAgencySearch] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [riskOpen, setRiskOpen] = useState(false);
  const [compOpen, setCompOpen] = useState(false);

  const catRef = useRef<HTMLDivElement>(null);
  const archRef = useRef<HTMLDivElement>(null);
  const agencyRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const riskRef = useRef<HTMLDivElement>(null);
  const compRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (catRef.current && !catRef.current.contains(e.target as Node)) {
        setCatOpen(false);
      }
      if (archRef.current && !archRef.current.contains(e.target as Node)) {
        setArchOpen(false);
      }
      if (agencyRef.current && !agencyRef.current.contains(e.target as Node)) {
        setAgencyOpen(false);
      }
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
      if (riskRef.current && !riskRef.current.contains(e.target as Node)) {
        setRiskOpen(false);
      }
      if (compRef.current && !compRef.current.contains(e.target as Node)) {
        setCompOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const allCategories = CATEGORY_OPTIONS.filter((c) => c.id !== "all");
  const allArchetypes = ARCHETYPE_OPTIONS.filter((a) => a.id !== "all");
  const filteredAgencies = agencies.filter(
    (a) =>
      a.th.toLowerCase().includes(agencySearch.toLowerCase()) ||
      a.en.toLowerCase().includes(agencySearch.toLowerCase()),
  );

  const effectiveMaxSlider = maxPriceTHB === 0 ? MAX_SLIDER_PRICE : maxPriceTHB;
  const minPercent = Math.min(100, Math.max(0, (minPriceTHB / MAX_SLIDER_PRICE) * 100));
  const maxPercent = Math.min(100, Math.max(0, (effectiveMaxSlider / MAX_SLIDER_PRICE) * 100));
  const isMinCloserToMax = minPriceTHB > MAX_SLIDER_PRICE - 3_000_000;

  // Month & Year parsing for flexible typing/selecting
  const [startYearStr, startMonthStr] = (effectiveStartMonth || "2023-10").split("-");
  const [endYearStr, endMonthStr] = (effectiveEndMonth || "2024-09").split("-");

  const startYearNum = Number(startYearStr) || 2023;
  const endYearNum = Number(endYearStr) || 2024;
  const startMonthVal = startMonthStr || "10";
  const endMonthVal = endMonthStr || "09";

  const startYearDisplay = lang === "th" ? startYearNum + 543 : startYearNum;
  const endYearDisplay = lang === "th" ? endYearNum + 543 : endYearNum;

  const [typedStartYear, setTypedStartYear] = useState<string>(String(startYearDisplay));
  const [typedEndYear, setTypedEndYear] = useState<string>(String(endYearDisplay));
  const [lastEditedField, setLastEditedField] = useState<"start" | "end">("start");

  useEffect(() => {
    setTypedStartYear(String(startYearDisplay));
  }, [startYearDisplay]);

  useEffect(() => {
    setTypedEndYear(String(endYearDisplay));
  }, [endYearDisplay]);

  // Validation: end date must not be before start date
  const isDateRangeInvalid = `${endYearStr}-${endMonthVal}` < `${startYearStr}-${startMonthVal}`;
  const isStartInvalid = isDateRangeInvalid && lastEditedField === "start";
  const isEndInvalid = isDateRangeInvalid && lastEditedField === "end";

  function parseYearInput(val: string, currentLang: Lang): number | null {
    const trimmed = val.trim();
    const raw = Number(trimmed);
    if (!raw || isNaN(raw)) return null;

    // 4-digit BE (2400..2600):
    if (raw >= 2400 && raw <= 2600) {
      return raw - 543;
    }

    // 4-digit CE (2000..2100):
    if (raw >= 2000 && raw <= 2100) {
      return raw;
    }

    // 2-digit shortcuts:
    if (raw >= 1 && raw <= 99) {
      if (currentLang === "th") {
        if (raw >= 50) {
          return (2500 + raw) - 543; // e.g. 66..68 -> 2566..2568 -> CE 2023..2025
        }
        return 2000 + raw; // e.g. 26..28 -> CE 2026..2028
      } else {
        return 2000 + raw;
      }
    }

    return null;
  }

  function commitStartYear(val: string) {
    const ceYear = parseYearInput(val, lang);
    if (ceYear) {
      setLastEditedField("start");
      onStartMonthChange(`${ceYear}-${startMonthVal}`);
      const displayYear = lang === "th" ? ceYear + 543 : ceYear;
      setTypedStartYear(String(displayYear));
    } else {
      setTypedStartYear(String(startYearDisplay));
    }
  }

  function commitEndYear(val: string) {
    const ceYear = parseYearInput(val, lang);
    if (ceYear) {
      setLastEditedField("end");
      onEndMonthChange(`${ceYear}-${endMonthVal}`);
      const displayYear = lang === "th" ? ceYear + 543 : ceYear;
      setTypedEndYear(String(displayYear));
    } else {
      setTypedEndYear(String(endYearDisplay));
    }
  }

  return (
    <Panel className="mb-6 p-4">
      {/* Top Header */}
      <div className="mb-3.5 flex items-center justify-between border-b border-line pb-2.5">
        <h2 className="text-[15px] font-semibold text-ink">
          {lang === "th"
            ? "ตัวกรองข้อมูลสำหรับวิเคราะห์ (Analysis Filters)"
            : "Analysis Filters"}
        </h2>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onResetFilters}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-ink-2 underline hover:text-ink cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" />
            <span>{lang === "th" ? "ล้างตัวกรองทั้งหมด" : "Reset all"}</span>
          </button>
        ) : null}
      </div>

      {/* Row 1: 3 Main Selectors Grid (Expanded width for popups) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* 1. Category Popover Multi-Select */}
        <div className="relative flex flex-col gap-1.5" ref={catRef}>
          <Label htmlFor="wd-category-btn">
            {lang === "th" ? "หมวดหมู่งาน IT" : "IT categories"}
          </Label>
          <button
            id="wd-category-btn"
            type="button"
            onClick={() => {
              setCatOpen((prev) => !prev);
              setArchOpen(false);
              setAgencyOpen(false);
              setStatusOpen(false);
              setRiskOpen(false);
              setCompOpen(false);
            }}
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

          {catOpen ? (
            <div className="absolute top-[62px] left-0 z-30 w-full min-w-[280px] rounded-[4px] border border-line-2 bg-surface p-2 shadow-lg">
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

        {/* 2. Archetype Multi-Select Popover */}
        <div className="relative flex flex-col gap-1.5" ref={archRef}>
          <Label htmlFor="wd-archetype-btn">
            {lang === "th" ? "รูปแบบสถาปัตยกรรมระบบ" : "System archetypes"}
          </Label>
          <button
            id="wd-archetype-btn"
            type="button"
            onClick={() => {
              setArchOpen((prev) => !prev);
              setCatOpen(false);
              setAgencyOpen(false);
              setStatusOpen(false);
              setRiskOpen(false);
              setCompOpen(false);
            }}
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

          {archOpen ? (
            <div className="absolute top-[62px] left-0 z-30 w-full min-w-[280px] rounded-[4px] border border-line-2 bg-surface p-2 shadow-lg">
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

        {/* 3. Agency Multi-Select Popover */}
        <div className="relative flex flex-col gap-1.5" ref={agencyRef}>
          <Label htmlFor="wd-agency-btn">
            {lang === "th" ? "หน่วยงานผู้จัดซื้อ" : "Procuring agency"}
          </Label>
          <button
            id="wd-agency-btn"
            type="button"
            onClick={() => {
              setAgencyOpen((prev) => !prev);
              setCatOpen(false);
              setArchOpen(false);
              setStatusOpen(false);
              setRiskOpen(false);
              setCompOpen(false);
            }}
            className="flex h-9 w-full items-center justify-between rounded-[3px] border border-line-2 bg-surface px-2.5 text-left text-[12.5px] text-ink hover:border-ink cursor-pointer"
          >
            <span className="truncate">
              {selectedAgencies.length === 0
                ? lang === "th"
                  ? `ทุกหน่วยงาน (${agencies.length})`
                  : `All agencies (${agencies.length})`
                : selectedAgencies.length === 1
                  ? selectedAgencies[0]
                  : lang === "th"
                    ? `เลือก ${selectedAgencies.length} หน่วยงาน`
                    : `${selectedAgencies.length} agencies`}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
          </button>

          {agencyOpen ? (
            <div className="absolute top-[62px] left-0 z-30 w-full min-w-[320px] rounded-[4px] border border-line-2 bg-surface p-2 shadow-lg">
              <input
                type="text"
                placeholder={lang === "th" ? "ค้นหาหน่วยงาน..." : "Search agency..."}
                value={agencySearch}
                onChange={(e) => setAgencySearch(e.target.value)}
                className="mb-1.5 w-full rounded border border-line-2 bg-surface px-2 py-1 text-[11.5px] text-ink focus:outline-none focus:border-ink"
              />
              <div className="mb-1.5 flex items-center justify-between border-b border-line pb-1 text-[11px]">
                <button
                  type="button"
                  onClick={onSelectAllAgencies}
                  className="text-ink-2 hover:text-ink cursor-pointer"
                >
                  {lang === "th" ? "เลือกทั้งหมด" : "Select all"}
                </button>
                <button
                  type="button"
                  onClick={onClearAgencies}
                  className="text-ink-3 hover:text-ink cursor-pointer"
                >
                  {lang === "th" ? "ล้างการเลือก" : "Clear"}
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto flex flex-col gap-0.5">
                {filteredAgencies.map((agency) => (
                  <label
                    key={agency.th}
                    className="flex items-center justify-between gap-2 rounded px-2 py-1 text-[11.5px] text-ink hover:bg-surface-2 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <input
                        type="checkbox"
                        checked={selectedAgencies.includes(agency.th)}
                        onChange={() => onToggleAgency(agency.th)}
                        className="rounded border-line"
                      />
                      <span className="truncate">{pick(agency, lang)}</span>
                    </div>
                    <span className="font-mono text-[10.5px] text-ink-3 shrink-0">
                      ({agency.count})
                    </span>
                  </label>
                ))}
                {filteredAgencies.length === 0 ? (
                  <span className="py-2 text-center text-[11.5px] text-ink-3">
                    {lang === "th" ? "ไม่พบหน่วยงาน" : "No agency found"}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Row 2: Price Range Box (~78%) on Left + Time Period (~22%) on Right */}
      <div className="mt-3.5 flex flex-col lg:flex-row items-stretch lg:items-end gap-3.5">
        {/* Left: Dedicated Price Range Bar Box */}
        <div className="flex-1 rounded-[3px] border border-line bg-surface-2/60 p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
            <Label>
              {lang === "th" ? "ช่วงราคากลางที่เลือก:" : "Reference price range:"}
            </Label>
            <span className="font-mono font-semibold text-ink">
              {minPriceTHB === 0 && maxPriceTHB === 0
                ? lang === "th"
                  ? "ทุกช่วงราคา (฿0 – ไม่จำกัด)"
                  : "All prices (Unconstrained)"
                : maxPriceTHB === 0 || maxPriceTHB >= MAX_SLIDER_PRICE
                  ? `${formatTHBCompact(minPriceTHB)} ขึ้นไป`
                  : `${formatTHBCompact(minPriceTHB)} – ${formatTHBCompact(maxPriceTHB)}`}
            </span>
          </div>

          {/* Single Continuous Dual-Knob Track */}
          <div className="mt-2.5 flex items-center gap-3">
            <span className="font-mono text-[10.5px] text-ink-3 shrink-0">฿0</span>
            <div className="relative flex-1 h-6 flex items-center select-none">
              {/* Background track */}
              <div className="absolute left-0 right-0 h-1.5 rounded-full bg-line-2 pointer-events-none" />

              {/* Active highlighted fill bar */}
              <div
                className="absolute h-1.5 rounded-full bg-ink pointer-events-none transition-all duration-75"
                style={{
                  left: `${minPercent}%`,
                  width: `${Math.max(0, maxPercent - minPercent)}%`,
                }}
              />

              {/* Min Price Slider Handle */}
              <input
                type="range"
                min={0}
                max={MAX_SLIDER_PRICE}
                step={1_000_000}
                value={minPriceTHB}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  const nextMin = Math.min(val, effectiveMaxSlider - 1_000_000);
                  onPriceRangeChange(nextMin, maxPriceTHB);
                }}
                className={`absolute left-0 top-0 w-full h-full appearance-none bg-transparent pointer-events-none ${
                  isMinCloserToMax ? "z-20" : "z-10"
                }
                  [&::-webkit-slider-thumb]:pointer-events-auto
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-ink
                  [&::-webkit-slider-thumb]:border-2
                  [&::-webkit-slider-thumb]:border-surface
                  [&::-webkit-slider-thumb]:shadow
                  [&::-webkit-slider-thumb]:cursor-pointer
                  [&::-webkit-slider-thumb]:hover:scale-110
                  [&::-moz-range-thumb]:pointer-events-auto
                  [&::-moz-range-thumb]:h-4
                  [&::-moz-range-thumb]:w-4
                  [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-ink
                  [&::-moz-range-thumb]:border-2
                  [&::-moz-range-thumb]:border-surface
                  [&::-moz-range-thumb]:shadow
                  [&::-moz-range-thumb]:cursor-pointer
                  [&::-moz-range-thumb]:hover:scale-110`}
                aria-label={lang === "th" ? "ราคากลางเริ่มต้น" : "Minimum reference price"}
              />

              {/* Max Price Slider Handle */}
              <input
                type="range"
                min={0}
                max={MAX_SLIDER_PRICE}
                step={1_000_000}
                value={effectiveMaxSlider}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  const nextMax = Math.max(val, minPriceTHB + 1_000_000);
                  onPriceRangeChange(minPriceTHB, nextMax >= MAX_SLIDER_PRICE ? 0 : nextMax);
                }}
                className={`absolute left-0 top-0 w-full h-full appearance-none bg-transparent pointer-events-none ${
                  isMinCloserToMax ? "z-10" : "z-20"
                }
                  [&::-webkit-slider-thumb]:pointer-events-auto
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-ink
                  [&::-webkit-slider-thumb]:border-2
                  [&::-webkit-slider-thumb]:border-surface
                  [&::-webkit-slider-thumb]:shadow
                  [&::-webkit-slider-thumb]:cursor-pointer
                  [&::-webkit-slider-thumb]:hover:scale-110
                  [&::-moz-range-thumb]:pointer-events-auto
                  [&::-moz-range-thumb]:h-4
                  [&::-moz-range-thumb]:w-4
                  [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-ink
                  [&::-moz-range-thumb]:border-2
                  [&::-moz-range-thumb]:border-surface
                  [&::-moz-range-thumb]:shadow
                  [&::-moz-range-thumb]:cursor-pointer
                  [&::-moz-range-thumb]:hover:scale-110`}
                aria-label={lang === "th" ? "ราคากลางสูงสุด" : "Maximum reference price"}
              />
            </div>
            <span className="font-mono text-[10.5px] text-ink-3 shrink-0">฿50M+</span>
          </div>
        </div>

        {/* Right: Time Period Filter with Typeable Year & Month Select (30% width, outside gray box) */}
        <div className="w-full lg:w-[30%] shrink-0 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="wd-start-month-select">
              {lang === "th" ? "ช่วงเวลาประกาศ" : "Time period"}
            </Label>
            {isDateRangeInvalid ? (
              <span className="text-[10px] text-risk font-semibold animate-pulse">
                {lang === "th" ? "ช่วงเวลาไม่ถูกต้อง" : "Invalid range"}
              </span>
            ) : (
              <span className="text-[10.5px] text-ink-3">
                {lang === "th" ? "(พ.ศ.)" : "(Year)"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-nowrap h-9">
            {/* Start Month + Typeable Year */}
            <div className="flex items-center gap-0.5 flex-1 min-w-0">
              <select
                id="wd-start-month-select"
                aria-label={lang === "th" ? "ตั้งแต่เดือน" : "Start month"}
                value={startMonthVal}
                onChange={(e) => {
                  setLastEditedField("start");
                  onStartMonthChange(`${startYearStr}-${e.target.value}`);
                }}
                className={`h-9 rounded-[3px] border bg-surface px-1.5 text-[11.5px] cursor-pointer focus:outline-none flex-1 min-w-0 ${
                  isStartInvalid
                    ? "border-risk text-risk bg-risk/5 focus:border-risk ring-1 ring-risk/40 font-semibold"
                    : "border-line-2 text-ink hover:border-ink"
                }`}
              >
                {ALL_MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {lang === "th" ? m.th : m.en}
                  </option>
                ))}
              </select>
              <input
                type="text"
                aria-label={lang === "th" ? "ปี พ.ศ. เริ่มต้น" : "Start year"}
                value={typedStartYear}
                onChange={(e) => {
                  const val = e.target.value;
                  setTypedStartYear(val);
                  setLastEditedField("start");
                  if (val.trim().length === 4) {
                    const ce = parseYearInput(val, lang);
                    if (ce) {
                      onStartMonthChange(`${ce}-${startMonthVal}`);
                    }
                  }
                }}
                onBlur={(e) => {
                  setLastEditedField("start");
                  commitStartYear(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setLastEditedField("start");
                    commitStartYear((e.target as HTMLInputElement).value);
                  }
                }}
                className={`h-9 w-14 rounded-[3px] border bg-surface px-1 text-center font-mono text-[11.5px] focus:outline-none shrink-0 ${
                  isStartInvalid
                    ? "border-risk text-risk bg-risk/5 font-semibold focus:border-risk ring-1 ring-risk/40"
                    : "border-line-2 text-ink focus:border-ink"
                }`}
              />
            </div>

            <span
              className={`text-[11.5px] shrink-0 font-medium ${
                isDateRangeInvalid ? "text-risk" : "text-ink-3"
              }`}
            >
              –
            </span>

            {/* End Month + Typeable Year */}
            <div className="flex items-center gap-0.5 flex-1 min-w-0">
              <select
                id="wd-end-month-select"
                aria-label={lang === "th" ? "ถึงเดือน" : "End month"}
                value={endMonthVal}
                onChange={(e) => {
                  setLastEditedField("end");
                  onEndMonthChange(`${endYearStr}-${e.target.value}`);
                }}
                className={`h-9 rounded-[3px] border bg-surface px-1.5 text-[11.5px] cursor-pointer focus:outline-none flex-1 min-w-0 ${
                  isEndInvalid
                    ? "border-risk text-risk bg-risk/5 focus:border-risk ring-1 ring-risk/40 font-semibold"
                    : "border-line-2 text-ink hover:border-ink"
                }`}
              >
                {ALL_MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {lang === "th" ? m.th : m.en}
                  </option>
                ))}
              </select>
              <input
                type="text"
                aria-label={lang === "th" ? "ปี พ.ศ. สิ้นสุด" : "End year"}
                value={typedEndYear}
                onChange={(e) => {
                  const val = e.target.value;
                  setTypedEndYear(val);
                  setLastEditedField("end");
                  if (val.trim().length === 4) {
                    const ce = parseYearInput(val, lang);
                    if (ce) {
                      onEndMonthChange(`${ce}-${endMonthVal}`);
                    }
                  }
                }}
                onBlur={(e) => {
                  setLastEditedField("end");
                  commitEndYear(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setLastEditedField("end");
                    commitEndYear((e.target as HTMLInputElement).value);
                  }
                }}
                className={`h-9 w-14 rounded-[3px] border bg-surface px-1 text-center font-mono text-[11.5px] focus:outline-none shrink-0 ${
                  isEndInvalid
                    ? "border-risk text-risk bg-risk/5 font-semibold focus:border-risk ring-1 ring-risk/40"
                    : "border-line-2 text-ink focus:border-ink"
                }`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Secondary Multi-Select Dropdowns (Exact Same Width as Popup, Left-Aligned) */}
      <div className="mt-3.5 flex flex-wrap items-end gap-x-4 sm:gap-x-5 gap-y-3">
        {/* Status Multi-Select Popover */}
        <div className="relative flex flex-col gap-1.5 w-52 sm:w-56" ref={statusRef}>
          <Label htmlFor="wd-status-btn">
            {lang === "th" ? "สถานะประกาศ" : "Tender status"}
          </Label>
          <button
            id="wd-status-btn"
            type="button"
            onClick={() => {
              setStatusOpen((prev) => !prev);
              setRiskOpen(false);
              setCompOpen(false);
              setCatOpen(false);
              setArchOpen(false);
              setAgencyOpen(false);
            }}
            className="flex h-9 w-full items-center justify-between rounded-[3px] border border-line-2 bg-surface px-2.5 text-left text-[12.5px] text-ink hover:border-ink cursor-pointer"
          >
            <span className="truncate">
              {selectedStatuses.length === STATUS_ITEMS.length
                ? lang === "th" ? "ทุกสถานะประกาศ (5)" : "All statuses (5)"
                : lang === "th" ? `เลือก ${selectedStatuses.length} สถานะ` : `${selectedStatuses.length} statuses`}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
          </button>

          {statusOpen ? (
            <div className="absolute top-[62px] left-0 z-30 w-full rounded-[4px] border border-line-2 bg-surface p-2 shadow-lg">
              <div className="mb-2 flex items-center justify-between border-b border-line pb-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={onSelectAllStatuses}
                  className="text-ink-2 hover:text-ink cursor-pointer"
                >
                  {lang === "th" ? "เลือกทั้งหมด" : "Select all"}
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {STATUS_ITEMS.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] text-ink hover:bg-surface-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedStatuses.includes(item.id)}
                      onChange={() => onToggleStatus(item.id)}
                      className="rounded border-line"
                    />
                    <span>{lang === "th" ? item.labelTh : item.labelEn}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Risk Level Multi-Select Popover */}
        <div className="relative flex flex-col gap-1.5 w-56 sm:w-60" ref={riskRef}>
          <Label htmlFor="wd-risk-btn">
            {lang === "th" ? "ระดับความเสี่ยงล็อกสเปก" : "Lock-spec risk"}
          </Label>
          <button
            id="wd-risk-btn"
            type="button"
            onClick={() => {
              setRiskOpen((prev) => !prev);
              setStatusOpen(false);
              setCompOpen(false);
              setCatOpen(false);
              setArchOpen(false);
              setAgencyOpen(false);
            }}
            className="flex h-9 w-full items-center justify-between rounded-[3px] border border-line-2 bg-surface px-2.5 text-left text-[12.5px] text-ink hover:border-ink cursor-pointer"
          >
            <span className="truncate">
              {selectedRiskLevels.length === RISK_ITEMS.length
                ? lang === "th" ? "ทุกระดับความเสี่ยง (3)" : "All risk levels (3)"
                : lang === "th" ? `เลือก ${selectedRiskLevels.length} ระดับ` : `${selectedRiskLevels.length} levels`}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
          </button>

          {riskOpen ? (
            <div className="absolute top-[62px] left-0 z-30 w-full rounded-[4px] border border-line-2 bg-surface p-2 shadow-lg">
              <div className="mb-2 flex items-center justify-between border-b border-line pb-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={onSelectAllRiskLevels}
                  className="text-ink-2 hover:text-ink cursor-pointer"
                >
                  {lang === "th" ? "เลือกทั้งหมด" : "Select all"}
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {RISK_ITEMS.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] text-ink hover:bg-surface-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRiskLevels.includes(item.id)}
                      onChange={() => onToggleRiskLevel(item.id)}
                      className="rounded border-line"
                    />
                    <span className={item.color}>
                      {lang === "th" ? item.labelTh : item.labelEn}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Complexity Multi-Select Popover */}
        <div className="relative flex flex-col gap-1.5 w-56 sm:w-60" ref={compRef}>
          <Label htmlFor="wd-comp-btn">
            {lang === "th" ? "ขนาดความซับซ้อน" : "Complexity tier"}
          </Label>
          <button
            id="wd-comp-btn"
            type="button"
            onClick={() => {
              setCompOpen((prev) => !prev);
              setStatusOpen(false);
              setRiskOpen(false);
              setCatOpen(false);
              setArchOpen(false);
              setAgencyOpen(false);
            }}
            className="flex h-9 w-full items-center justify-between rounded-[3px] border border-line-2 bg-surface px-2.5 text-left text-[12.5px] text-ink hover:border-ink cursor-pointer"
          >
            <span className="truncate">
              {selectedComplexities.length === COMPLEXITY_ITEMS.length
                ? lang === "th" ? "ทุกขนาดความซับซ้อน (3)" : "All complexity tiers (3)"
                : lang === "th" ? `เลือก ${selectedComplexities.length} ขนาด` : `${selectedComplexities.length} tiers`}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
          </button>

          {compOpen ? (
            <div className="absolute top-[62px] left-0 z-30 w-full rounded-[4px] border border-line-2 bg-surface p-2 shadow-lg">
              <div className="mb-2 flex items-center justify-between border-b border-line pb-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={onSelectAllComplexities}
                  className="text-ink-2 hover:text-ink cursor-pointer"
                >
                  {lang === "th" ? "เลือกทั้งหมด" : "Select all"}
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {COMPLEXITY_ITEMS.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 text-[12px] text-ink hover:bg-surface-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedComplexities.includes(item.id)}
                      onChange={() => onToggleComplexity(item.id)}
                      className="rounded border-line"
                    />
                    <span>{lang === "th" ? item.th : item.en}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
