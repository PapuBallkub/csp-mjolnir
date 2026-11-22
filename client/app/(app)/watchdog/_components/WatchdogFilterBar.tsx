"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { formatTHBCompact, type RiskLevel, type Status } from "../../../_data/tors";
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
  // Multi-select status
  selectedStatuses: Status[];
  onToggleStatus: (status: Status) => void;
  onSelectAllStatuses: () => void;
  onClearStatuses?: () => void;
  // Multi-select lock-spec risk level
  selectedRiskLevels: RiskLevel[];
  onToggleRiskLevel: (level: RiskLevel) => void;
  onSelectAllRiskLevels: () => void;
  onClearRiskLevels?: () => void;
  // Multi-select complexity
  selectedComplexities: ComplexityTier[];
  onToggleComplexity: (tier: ComplexityTier) => void;
  onSelectAllComplexities: () => void;
  onClearComplexities?: () => void;
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
  availableMonths: Array<{ key: string; label: string; labelTh?: string }>;
  // Reset
  hasActiveFilters: boolean;
  onResetFilters: () => void;
};

const STATUS_ITEMS: Array<{ id: Status; labelTh: string }> = [
  { id: "Open", labelTh: "เปิดรับซอง (Open)" },
  { id: "Draft", labelTh: "ร่างรับฟัง (Draft)" },
  { id: "Awarded", labelTh: "ได้ผู้ชนะ (Awarded)" },
  { id: "Closed", labelTh: "ปิดแล้ว (Closed)" },
  { id: "Cancelled", labelTh: "ยกเลิก (Cancelled)" },
];

const RISK_ITEMS: Array<{ id: RiskLevel; labelTh: string; color: string }> = [
  { id: "high", labelTh: "เสี่ยงสูง (High Risk)", color: "text-risk" },
  { id: "medium", labelTh: "ปานกลาง (Medium Risk)", color: "text-amend" },
  { id: "low", labelTh: "เปิดกว้าง (Low Risk)", color: "text-open" },
];

const COMPLEXITY_ITEMS: Array<{ id: ComplexityTier; th: string }> = [
  { id: "basic", th: "พื้นฐาน (Basic)" },
  { id: "standard", th: "มาตรฐาน (Standard)" },
  { id: "enterprise", th: "องค์กรใหญ่ (Enterprise)" },
];

const ALL_MONTHS = [
  { value: "01", th: "ม.ค." },
  { value: "02", th: "ก.พ." },
  { value: "03", th: "มี.ค." },
  { value: "04", th: "เม.ย." },
  { value: "05", th: "พ.ค." },
  { value: "06", th: "มิ.ย." },
  { value: "07", th: "ก.ค." },
  { value: "08", th: "ส.ค." },
  { value: "09", th: "ก.ย." },
  { value: "10", th: "ต.ค." },
  { value: "11", th: "พ.ย." },
  { value: "12", th: "ธ.ค." },
];

/** Available years in dropdown: current and upcoming budget year down to the past 10 years */
const BASE_AVAILABLE_YEARS_CE = [
  2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016,
];

export function WatchdogFilterBar({
  selectedStatuses,
  onToggleStatus,
  onSelectAllStatuses,
  onClearStatuses,
  selectedRiskLevels,
  onToggleRiskLevel,
  onSelectAllRiskLevels,
  onClearRiskLevels,
  selectedComplexities,
  onToggleComplexity,
  onSelectAllComplexities,
  onClearComplexities,
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
  onStartMonthChange,
  onEndMonthChange,
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

  // Month & Year parsing for dropdown selects
  const [startYearStr, startMonthStr] = (effectiveStartMonth || "2023-10").split("-");
  const [endYearStr, endMonthStr] = (effectiveEndMonth || "2024-09").split("-");

  const startYearNum = Number(startYearStr) || 2023;
  const endYearNum = Number(endYearStr) || 2024;
  const startMonthVal = startMonthStr || "10";
  const endMonthVal = endMonthStr || "09";

  const availableYears = useMemo<number[]>(() => {
    const set = new Set<number>(BASE_AVAILABLE_YEARS_CE);
    if (startYearNum) set.add(startYearNum);
    if (endYearNum) set.add(endYearNum);
    return Array.from(set).sort((a, b) => b - a);
  }, [startYearNum, endYearNum]);

  const [lastEditedField, setLastEditedField] = useState<"start" | "end">("start");

  // Validation: end date must not be before start date
  const isDateRangeInvalid = Boolean(
    startYearNum &&
    endYearNum &&
    (endYearNum < startYearNum || (endYearNum === startYearNum && Number(endMonthVal) < Number(startMonthVal)))
  );
  const isStartInvalid = isDateRangeInvalid && lastEditedField === "start";
  const isEndInvalid = isDateRangeInvalid && lastEditedField === "end";

  // Filtered state flags to give buttons subtle gray background when actively selected
  const isCatFiltered = selectedCategories.length < allCategories.length;
  const isArchFiltered = selectedArchetypes.length < allArchetypes.length;
  const isAgencyFiltered = agencies.length > 0 && selectedAgencies.length < agencies.length;
  const isStatusFiltered = selectedStatuses.length < STATUS_ITEMS.length;
  const isRiskFiltered = selectedRiskLevels.length < RISK_ITEMS.length;
  const isCompFiltered = selectedComplexities.length < COMPLEXITY_ITEMS.length;

  return (
    <Panel className="mb-6 p-4">
      {/* Top Header */}
      <div className="mb-3.5 flex items-center justify-between border-b border-line pb-2.5">
        <h2 className="text-[15px] font-semibold text-ink">
          ตัวกรองข้อมูลสำหรับวิเคราะห์ (Analysis Filters)
        </h2>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onResetFilters}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-ink-2 underline hover:text-ink cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" />
            <span>ล้างตัวกรองทั้งหมด</span>
          </button>
        ) : null}
      </div>

      {/* Row 1: 3 Main Selectors Grid (Expanded width for popups) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* 1. Category Popover Multi-Select */}
        <div className="relative flex flex-col gap-1.5" ref={catRef}>
          <Label htmlFor="wd-category-btn">
            หมวดหมู่งาน IT
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
            className={`flex h-9 w-full items-center justify-between rounded-[3px] border border-line-2 px-2.5 text-[12.5px] hover:border-ink cursor-pointer transition-colors ${
              isCatFiltered || catOpen ? "bg-surface-2/80 text-ink font-medium" : "bg-surface text-ink"
            }`}
          >
            {selectedCategories.length === allCategories.length ? (
              <span className="truncate flex-1 text-center font-medium text-ink-2">
                -- ทุกหมวดหมู่งาน IT --
              </span>
            ) : selectedCategories.length === 0 ? (
              <span className="truncate flex-1 text-center font-medium text-ink-3">
                ไม่ได้เลือกหมวดหมู่
              </span>
            ) : (
              <span className="truncate text-left text-ink">
                {selectedCategories.length === 1
                  ? (allCategories.find((c) => c.id === selectedCategories[0])?.label ?? selectedCategories[0])
                  : `เลือก ${selectedCategories.length} หมวดหมู่`}
              </span>
            )}
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3 ml-1.5" />
          </button>

          {catOpen ? (
            <div className="absolute top-[62px] left-0 z-30 w-full min-w-[280px] rounded-[4px] border border-line-2 bg-surface p-2 shadow-lg">
              <div className="mb-2 flex items-center justify-between border-b border-line pb-1.5 text-[11px]">
                <span className="text-ink-3 font-normal">
                  เลือกเจาะจง...
                </span>
                {selectedCategories.length === allCategories.length ? (
                  <button
                    type="button"
                    onClick={onClearCategories}
                    className="text-ink-2 hover:text-ink underline cursor-pointer"
                  >
                    ล้างทั้งหมด
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSelectAllCategories}
                    className="text-ink-2 hover:text-ink underline cursor-pointer"
                  >
                    เลือกทั้งหมด
                  </button>
                )}
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
                      <span className="truncate">{opt.label}</span>
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
            รูปแบบสถาปัตยกรรมระบบ
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
            className={`flex h-9 w-full items-center justify-between rounded-[3px] border border-line-2 px-2.5 text-[12.5px] hover:border-ink cursor-pointer transition-colors ${
              isArchFiltered || archOpen ? "bg-surface-2/80 text-ink font-medium" : "bg-surface text-ink"
            }`}
          >
            {selectedArchetypes.length === allArchetypes.length ? (
              <span className="truncate flex-1 text-center font-medium text-ink-2">
                -- ทุกรูปแบบระบบ --
              </span>
            ) : selectedArchetypes.length === 0 ? (
              <span className="truncate flex-1 text-center font-medium text-ink-3">
                ไม่ได้เลือกรูปแบบ
              </span>
            ) : (
              <span className="truncate text-left text-ink">
                {selectedArchetypes.length === 1
                  ? (allArchetypes.find((a) => a.id === selectedArchetypes[0])?.label ?? selectedArchetypes[0])
                  : `เลือก ${selectedArchetypes.length} รูปแบบ`}
              </span>
            )}
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3 ml-1.5" />
          </button>

          {archOpen ? (
            <div className="absolute top-[62px] left-0 z-30 w-full min-w-[280px] rounded-[4px] border border-line-2 bg-surface p-2 shadow-lg">
              <div className="mb-2 flex items-center justify-between border-b border-line pb-1.5 text-[11px]">
                <span className="text-ink-3 font-normal">
                  เลือกเจาะจง...
                </span>
                {selectedArchetypes.length === allArchetypes.length ? (
                  <button
                    type="button"
                    onClick={onClearArchetypes}
                    className="text-ink-2 hover:text-ink underline cursor-pointer"
                  >
                    ล้างทั้งหมด
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSelectAllArchetypes}
                    className="text-ink-2 hover:text-ink underline cursor-pointer"
                  >
                    เลือกทั้งหมด
                  </button>
                )}
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
                      <span className="truncate">{opt.label}</span>
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
            หน่วยงานผู้จัดซื้อ
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
            className={`flex h-9 w-full items-center justify-between rounded-[3px] border border-line-2 px-2.5 text-[12.5px] hover:border-ink cursor-pointer transition-colors ${
              isAgencyFiltered || agencyOpen ? "bg-surface-2/80 text-ink font-medium" : "bg-surface text-ink"
            }`}
          >
            {agencies.length === 0 || selectedAgencies.length === agencies.length ? (
              <span className="truncate flex-1 text-center font-medium text-ink-2">
                -- ทุกหน่วยงาน --
              </span>
            ) : selectedAgencies.length === 0 ? (
              <span className="truncate flex-1 text-center font-medium text-ink-3">
                ไม่ได้เลือกหน่วยงาน
              </span>
            ) : (
              <span className="truncate text-left text-ink">
                {selectedAgencies.length === 1 ? selectedAgencies[0] : `เลือก ${selectedAgencies.length} หน่วยงาน`}
              </span>
            )}
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3 ml-1.5" />
          </button>

          {agencyOpen ? (
            <div className="absolute top-[62px] left-0 z-30 w-full min-w-[320px] rounded-[4px] border border-line-2 bg-surface p-2 shadow-lg">
              <input
                type="text"
                placeholder="ค้นหาหน่วยงาน..."
                value={agencySearch}
                onChange={(e) => setAgencySearch(e.target.value)}
                className="mb-1.5 w-full rounded border border-line-2 bg-surface px-2 py-1 text-[11.5px] text-ink focus:outline-none focus:border-ink"
              />
              <div className="mb-1.5 flex items-center justify-between border-b border-line pb-1 text-[11px]">
                <span className="text-ink-3 font-normal">
                  เลือกเจาะจง...
                </span>
                {agencies.length > 0 && selectedAgencies.length === agencies.length ? (
                  <button
                    type="button"
                    onClick={onClearAgencies}
                    className="text-ink-2 hover:text-ink underline cursor-pointer"
                  >
                    ล้างทั้งหมด
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSelectAllAgencies}
                    className="text-ink-2 hover:text-ink underline cursor-pointer"
                  >
                    เลือกทั้งหมด
                  </button>
                )}
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
                      <span className="truncate">{agency.th}</span>
                    </div>
                    <span className="font-mono text-[10.5px] text-ink-3 shrink-0">
                      ({agency.count})
                    </span>
                  </label>
                ))}
                {filteredAgencies.length === 0 ? (
                  <span className="py-2 text-center text-[11.5px] text-ink-3">
                    ไม่พบหน่วยงาน
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
              ช่วงราคากลางที่เลือก:
            </Label>
            <span className="font-mono font-semibold text-ink">
              {minPriceTHB === 0 && maxPriceTHB === 0
                ? "ทุกช่วงราคา (฿0 – ไม่จำกัด)"
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
                aria-label="ราคากลางเริ่มต้น"
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
                aria-label="ราคากลางสูงสุด"
              />
            </div>
            <span className="font-mono text-[10.5px] text-ink-3 shrink-0">฿50M+</span>
          </div>
        </div>

        {/* Right: Time Period Filter with Typeable Year & Month Select (30% width, outside gray box) */}
        <div className="w-full lg:w-[30%] shrink-0 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="wd-start-month-select">
              ช่วงเวลาประกาศ
            </Label>
            {isDateRangeInvalid ? (
              <span className="text-[10px] text-risk font-semibold animate-pulse">
                ช่วงเวลาไม่ถูกต้อง
              </span>
            ) : (
              <span className="text-[10.5px] text-ink-3">
                (พ.ศ.)
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-nowrap h-9">
            {/* Start Month + Year Dropdowns */}
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <select
                id="wd-start-month-select"
                aria-label="ตั้งแต่เดือน"
                value={startMonthVal}
                onChange={(e) => {
                  setLastEditedField("start");
                  onStartMonthChange(`${startYearNum}-${e.target.value}`);
                }}
                className={`h-9 rounded-[3px] border bg-surface px-1.5 text-[11.5px] cursor-pointer focus:outline-none flex-1 min-w-0 ${
                  isStartInvalid
                    ? "border-risk text-risk bg-risk/5 focus:border-risk ring-1 ring-risk/40 font-semibold"
                    : "border-line-2 text-ink hover:border-ink"
                }`}
              >
                {ALL_MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.th}
                  </option>
                ))}
              </select>

              <select
                id="wd-start-year-select"
                aria-label="ปีเริ่มต้น"
                value={startYearNum}
                onChange={(e) => {
                  setLastEditedField("start");
                  onStartMonthChange(`${e.target.value}-${startMonthVal}`);
                }}
                className={`h-9 rounded-[3px] border bg-surface px-1.5 text-[11.5px] cursor-pointer focus:outline-none w-[68px] shrink-0 font-mono ${
                  isStartInvalid
                    ? "border-risk text-risk bg-risk/5 focus:border-risk ring-1 ring-risk/40 font-semibold"
                    : "border-line-2 text-ink hover:border-ink"
                }`}
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y + 543}
                  </option>
                ))}
              </select>
            </div>

            <span
              className={`text-[11.5px] shrink-0 font-medium ${
                isDateRangeInvalid ? "text-risk" : "text-ink-3"
              }`}
            >
              –
            </span>

            {/* End Month + Year Dropdowns */}
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <select
                id="wd-end-month-select"
                aria-label="ถึงเดือน"
                value={endMonthVal}
                onChange={(e) => {
                  setLastEditedField("end");
                  onEndMonthChange(`${endYearNum}-${e.target.value}`);
                }}
                className={`h-9 rounded-[3px] border bg-surface px-1.5 text-[11.5px] cursor-pointer focus:outline-none flex-1 min-w-0 ${
                  isEndInvalid
                    ? "border-risk text-risk bg-risk/5 focus:border-risk ring-1 ring-risk/40 font-semibold"
                    : "border-line-2 text-ink hover:border-ink"
                }`}
              >
                {ALL_MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.th}
                  </option>
                ))}
              </select>

              <select
                id="wd-end-year-select"
                aria-label="ปีสิ้นสุด"
                value={endYearNum}
                onChange={(e) => {
                  setLastEditedField("end");
                  onEndMonthChange(`${e.target.value}-${endMonthVal}`);
                }}
                className={`h-9 rounded-[3px] border bg-surface px-1.5 text-[11.5px] cursor-pointer focus:outline-none w-[68px] shrink-0 font-mono ${
                  isEndInvalid
                    ? "border-risk text-risk bg-risk/5 focus:border-risk ring-1 ring-risk/40 font-semibold"
                    : "border-line-2 text-ink hover:border-ink"
                }`}
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y + 543}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Secondary Multi-Select Dropdowns (Exact Same Width as Popup, Left-Aligned) */}
      <div className="mt-3.5 flex flex-wrap items-end gap-x-4 sm:gap-x-5 gap-y-3">
        {/* Status Multi-Select Popover */}
        <div className="relative flex flex-col gap-1.5 w-52 sm:w-56" ref={statusRef}>
          <Label htmlFor="wd-status-btn">
            สถานะประกาศ
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
            className={`flex h-9 w-full items-center justify-between rounded-[3px] border border-line-2 px-2.5 text-[12.5px] hover:border-ink cursor-pointer transition-colors ${
              isStatusFiltered || statusOpen ? "bg-surface-2/80 text-ink font-medium" : "bg-surface text-ink"
            }`}
          >
            {selectedStatuses.length === STATUS_ITEMS.length ? (
              <span className="truncate flex-1 text-center font-medium text-ink-2">
                -- ทุกสถานะประกาศ --
              </span>
            ) : selectedStatuses.length === 0 ? (
              <span className="truncate flex-1 text-center font-medium text-ink-3">
                ไม่ได้เลือกสถานะ
              </span>
            ) : (
              <span className="truncate text-left text-ink">
                {selectedStatuses.length === 1
                  ? (STATUS_ITEMS.find((s) => s.id === selectedStatuses[0])?.labelTh ?? selectedStatuses[0])
                  : `เลือก ${selectedStatuses.length} สถานะ`}
              </span>
            )}
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3 ml-1.5" />
          </button>

          {statusOpen ? (
            <div className="absolute top-[62px] left-0 z-30 w-full rounded-[4px] border border-line-2 bg-surface p-2 shadow-lg">
              <div className="mb-2 flex items-center justify-between border-b border-line pb-1.5 text-[11px]">
                <span className="text-ink-3 font-normal">
                  เลือกเจาะจง...
                </span>
                {selectedStatuses.length === STATUS_ITEMS.length && onClearStatuses ? (
                  <button
                    type="button"
                    onClick={onClearStatuses}
                    className="text-ink-2 hover:text-ink underline cursor-pointer"
                  >
                    ล้างทั้งหมด
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSelectAllStatuses}
                    className="text-ink-2 hover:text-ink underline cursor-pointer"
                  >
                    เลือกทั้งหมด
                  </button>
                )}
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
                    <span>{item.labelTh}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Risk Level Multi-Select Popover */}
        <div className="relative flex flex-col gap-1.5 w-56 sm:w-60" ref={riskRef}>
          <Label htmlFor="wd-risk-btn">
            ระดับความเสี่ยงล็อกสเปก
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
            className={`flex h-9 w-full items-center justify-between rounded-[3px] border border-line-2 px-2.5 text-[12.5px] hover:border-ink cursor-pointer transition-colors ${
              isRiskFiltered || riskOpen ? "bg-surface-2/80 text-ink font-medium" : "bg-surface text-ink"
            }`}
          >
            {selectedRiskLevels.length === RISK_ITEMS.length ? (
              <span className="truncate flex-1 text-center font-medium text-ink-2">
                -- ทุกระดับความเสี่ยง --
              </span>
            ) : selectedRiskLevels.length === 0 ? (
              <span className="truncate flex-1 text-center font-medium text-ink-3">
                ไม่ได้เลือกระดับ
              </span>
            ) : (
              <span className="truncate text-left text-ink">
                {selectedRiskLevels.length === 1
                  ? (RISK_ITEMS.find((r) => r.id === selectedRiskLevels[0])?.labelTh ?? selectedRiskLevels[0])
                  : `เลือก ${selectedRiskLevels.length} ระดับ`}
              </span>
            )}
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3 ml-1.5" />
          </button>

          {riskOpen ? (
            <div className="absolute top-[62px] left-0 z-30 w-full rounded-[4px] border border-line-2 bg-surface p-2 shadow-lg">
              <div className="mb-2 flex items-center justify-between border-b border-line pb-1.5 text-[11px]">
                <span className="text-ink-3 font-normal">
                  เลือกเจาะจง...
                </span>
                {selectedRiskLevels.length === RISK_ITEMS.length && onClearRiskLevels ? (
                  <button
                    type="button"
                    onClick={onClearRiskLevels}
                    className="text-ink-2 hover:text-ink underline cursor-pointer"
                  >
                    ล้างทั้งหมด
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSelectAllRiskLevels}
                    className="text-ink-2 hover:text-ink underline cursor-pointer"
                  >
                    เลือกทั้งหมด
                  </button>
                )}
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
                      {item.labelTh}
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
            ขนาดความซับซ้อน
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
            className={`flex h-9 w-full items-center justify-between rounded-[3px] border border-line-2 px-2.5 text-[12.5px] hover:border-ink cursor-pointer transition-colors ${
              isCompFiltered || compOpen ? "bg-surface-2/80 text-ink font-medium" : "bg-surface text-ink"
            }`}
          >
            {selectedComplexities.length === COMPLEXITY_ITEMS.length ? (
              <span className="truncate flex-1 text-center font-medium text-ink-2">
                -- ทุกขนาดความซับซ้อน --
              </span>
            ) : selectedComplexities.length === 0 ? (
              <span className="truncate flex-1 text-center font-medium text-ink-3">
                ไม่ได้เลือกขนาด
              </span>
            ) : (
              <span className="truncate text-left text-ink">
                {selectedComplexities.length === 1
                  ? (COMPLEXITY_ITEMS.find((c) => c.id === selectedComplexities[0])?.th ?? selectedComplexities[0])
                  : `เลือก ${selectedComplexities.length} ขนาด`}
              </span>
            )}
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3 ml-1.5" />
          </button>

          {compOpen ? (
            <div className="absolute top-[62px] left-0 z-30 w-full rounded-[4px] border border-line-2 bg-surface p-2 shadow-lg">
              <div className="mb-2 flex items-center justify-between border-b border-line pb-1.5 text-[11px]">
                <span className="text-ink-3 font-normal">
                  เลือกเจาะจง...
                </span>
                {selectedComplexities.length === COMPLEXITY_ITEMS.length && onClearComplexities ? (
                  <button
                    type="button"
                    onClick={onClearComplexities}
                    className="text-ink-2 hover:text-ink underline cursor-pointer"
                  >
                    ล้างทั้งหมด
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSelectAllComplexities}
                    className="text-ink-2 hover:text-ink underline cursor-pointer"
                  >
                    เลือกทั้งหมด
                  </button>
                )}
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
                    <span>{item.th}</span>
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
