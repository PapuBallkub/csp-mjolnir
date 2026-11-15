"use client";

import { useEffect, useMemo, useState } from "react";
import { useLang } from "../../_components/prefs";
import { btn, EmptyState, Panel, SectionHeading } from "../../_components/ui";
import {
  calcPriceDeltaPct,
  TIMELINE_MONTHS,
  type ComplexityTier,
  type LockSpecTriggerId,
  type ProjectCategory,
  type SystemArchetype,
  type WatchdogProjectRecord,
} from "../../_data/watchdog";
import { type RiskLevel, type Status } from "../../_data/tors";
import { listTors, type TorInsightSummary } from "../../_lib/api";
import { LockSpecOverview } from "./_components/LockSpecOverview";
import { PriceRealitySummary } from "./_components/PriceRealitySummary";
import { PriceTrendLineChart } from "./_components/PriceTrendLineChart";
import { WatchdogEvidenceTable } from "./_components/WatchdogEvidenceTable";
import { WatchdogFilterBar } from "./_components/WatchdogFilterBar";
import {
  NORMAL_BAND_PCT,
  PRICE_BAND_OPTIONS,
  type PriceBandId,
  type PriceRealityMetrics,
  type TableTab,
  type TimeGrain,
  type TimePoint,
} from "./_lib/types";
import {
  computeAverage,
  computeMedian,
  formatMonthBucket,
  mapApiTorToWatchdog,
} from "./_lib/watchdog-helpers";

const ALL_STATUSES: Status[] = ["Open", "Draft", "Awarded", "Closed"];
const ALL_RISK_LEVELS: RiskLevel[] = ["high", "medium", "low"];
const ALL_COMPLEXITIES: ComplexityTier[] = ["basic", "standard", "enterprise"];

export default function WatchdogPage() {
  const { lang } = useLang();

  // Real Data State (Strictly real data; no mock data fallback)
  const [liveProjects, setLiveProjects] = useState<WatchdogProjectRecord[] | null>(null);
  const [dataSource, setDataSource] = useState<"loading" | "api" | "empty" | "error">("loading");
  const [fetchTrigger, setFetchTrigger] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchAllRealTors() {
      setDataSource("loading");
      try {
        const first = await listTors({ limit: 100, page: 1, sort: "newest" });
        if (cancelled) return;

        if (!first.ok) {
          setDataSource("error");
          return;
        }

        if (first.data.tors.length === 0) {
          setLiveProjects([]);
          setDataSource("empty");
          return;
        }

        const allSummaries: TorInsightSummary[] = [...first.data.tors];
        const totalPages = Math.min(first.data.pages, 5); // fetch up to 500 TORs

        if (totalPages > 1) {
          const pagePromises = [];
          for (let p = 2; p <= totalPages; p++) {
            pagePromises.push(listTors({ limit: 100, page: p, sort: "newest" }));
          }
          const rest = await Promise.all(pagePromises);
          if (cancelled) return;
          for (const res of rest) {
            if (res.ok) {
              allSummaries.push(...res.data.tors);
            }
          }
        }

        const mapped = allSummaries
          .map(mapApiTorToWatchdog)
          .filter((item): item is WatchdogProjectRecord => item !== null);

        if (mapped.length > 0) {
          setLiveProjects(mapped);
          setDataSource("api");
        } else {
          setLiveProjects([]);
          setDataSource("empty");
        }
      } catch {
        if (!cancelled) {
          setDataSource("error");
        }
      }
    }

    fetchAllRealTors();
    return () => {
      cancelled = true;
    };
  }, [fetchTrigger]);

  const allProjects = liveProjects ?? [];

  // Dynamic timeline months derived from active dataset
  const availableMonths = useMemo(() => {
    if (allProjects.length === 0) return TIMELINE_MONTHS;
    const uniqueKeys = Array.from(new Set(allProjects.map((p) => p.month))).sort();
    if (uniqueKeys.length === 0) return TIMELINE_MONTHS;
    return uniqueKeys.map(formatMonthBucket);
  }, [allProjects]);

  const defaultStartMonth = availableMonths[0]?.key ?? TIMELINE_MONTHS[0].key;
  const defaultEndMonth =
    availableMonths[availableMonths.length - 1]?.key ??
    TIMELINE_MONTHS[TIMELINE_MONTHS.length - 1].key;

  // Universal Section 1 Filter States
  const [selectedStatuses, setSelectedStatuses] = useState<Status[]>(ALL_STATUSES);
  const [selectedRiskLevels, setSelectedRiskLevels] = useState<RiskLevel[]>(ALL_RISK_LEVELS);
  const [selectedComplexities, setSelectedComplexities] = useState<ComplexityTier[]>(ALL_COMPLEXITIES);
  const [selectedCategories, setSelectedCategories] = useState<ProjectCategory[]>([]);
  const [selectedArchetypes, setSelectedArchetypes] = useState<SystemArchetype[]>([]);
  const [agencyFilter, setAgencyFilter] = useState<string>("all");
  const [priceBand, setPriceBand] = useState<PriceBandId>("all");
  const [startMonth, setStartMonth] = useState<string>("");
  const [endMonth, setEndMonth] = useState<string>("");
  const [timeGrain, setTimeGrain] = useState<TimeGrain>("monthly");

  const effectiveStartMonth =
    startMonth && availableMonths.some((m) => m.key === startMonth)
      ? startMonth
      : defaultStartMonth;
  const effectiveEndMonth =
    endMonth && availableMonths.some((m) => m.key === endMonth)
      ? endMonth
      : defaultEndMonth;

  // Bottom Table View Mode State
  const [tableTab, setTableTab] = useState<TableTab>("flagged");
  const [rowLimit, setRowLimit] = useState<number>(10);

  // Toggle Handlers
  function toggleStatus(st: Status) {
    setSelectedStatuses((prev) =>
      prev.includes(st) ? (prev.length > 1 ? prev.filter((s) => s !== st) : prev) : [...prev, st],
    );
  }

  function toggleRiskLevel(level: RiskLevel) {
    setSelectedRiskLevels((prev) =>
      prev.includes(level) ? (prev.length > 1 ? prev.filter((l) => l !== level) : prev) : [...prev, level],
    );
  }

  function toggleComplexity(tier: ComplexityTier) {
    setSelectedComplexities((prev) =>
      prev.includes(tier) ? (prev.length > 1 ? prev.filter((t) => t !== tier) : prev) : [...prev, tier],
    );
  }

  function toggleCategory(cat: ProjectCategory) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  function toggleArchetype(arch: SystemArchetype) {
    setSelectedArchetypes((prev) =>
      prev.includes(arch) ? prev.filter((a) => a !== arch) : [...prev, arch],
    );
  }

  // Unique agencies for dropdown
  const agencies = useMemo(() => {
    const map = new Map<string, { th: string; en: string; count: number }>();
    for (const p of allProjects) {
      const key = p.agency.th;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { th: p.agency.th, en: p.agency.en, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [allProjects]);

  // 1. Single Top Filter Bar drives the entire dataset
  const filteredByTopBar = useMemo(() => {
    const band = PRICE_BAND_OPTIONS.find((b) => b.id === priceBand);
    return allProjects.filter((p) => {
      // Status
      if (!selectedStatuses.includes(p.status)) return false;
      // Lock-Spec Risk Level
      if (!selectedRiskLevels.includes(p.lockSpecLevel)) return false;
      // Complexity Tier
      if (!selectedComplexities.includes(p.complexity)) return false;
      // Category
      if (selectedCategories.length > 0 && !selectedCategories.includes(p.category)) return false;
      // System Archetype
      if (selectedArchetypes.length > 0 && !selectedArchetypes.includes(p.archetype)) return false;
      // Agency
      if (agencyFilter !== "all" && p.agency.th !== agencyFilter) return false;
      // Price Band
      if (band?.min !== undefined && p.referencePriceTHB < band.min) return false;
      if (band?.max !== undefined && p.referencePriceTHB > band.max) return false;
      // Time Period
      if (p.month < effectiveStartMonth || p.month > effectiveEndMonth) return false;
      return true;
    });
  }, [
    allProjects,
    selectedStatuses,
    selectedRiskLevels,
    selectedComplexities,
    selectedCategories,
    selectedArchetypes,
    agencyFilter,
    priceBand,
    effectiveStartMonth,
    effectiveEndMonth,
  ]);

  // 2. Build time-series points (Monthly or Quarterly) from filteredByTopBar
  const timeSeries = useMemo<TimePoint[]>(() => {
    const activeMonths = availableMonths.filter(
      (m) => m.key >= effectiveStartMonth && m.key <= effectiveEndMonth,
    );

    if (timeGrain === "monthly") {
      return activeMonths.map((m) => {
        const inMonth = filteredByTopBar.filter((p) => p.month === m.key);
        const medians = inMonth.map((p) => p.peerMedianTHB);
        const averages = inMonth.map((p) => p.peerAverageTHB);
        const med = computeMedian(medians);
        const avg = computeAverage(averages);

        return {
          key: m.key,
          label: lang === "th" ? m.labelTh : m.labelEn,
          torCount: inMonth.length,
          medianTHB: med,
          averageTHB: avg,
          bandLowTHB: Math.round(med * (1 - NORMAL_BAND_PCT / 100)),
          bandHighTHB: Math.round(med * (1 + NORMAL_BAND_PCT / 100)),
          highRiskCount: inMonth.filter((p) => p.lockSpecLevel === "high").length,
          projects: inMonth,
        };
      });
    }

    // Quarterly aggregation
    const quarters = Array.from(new Set(activeMonths.map((m) => m.quarter)));
    return quarters.map((q) => {
      const monthKeys = activeMonths.filter((m) => m.quarter === q).map((m) => m.key);
      const inQuarter = filteredByTopBar.filter((p) => monthKeys.includes(p.month));
      const medians = inQuarter.map((p) => p.peerMedianTHB);
      const averages = inQuarter.map((p) => p.peerAverageTHB);
      const med = computeMedian(medians);
      const avg = computeAverage(averages);

      return {
        key: q,
        label: q,
        torCount: inQuarter.length,
        medianTHB: med,
        averageTHB: avg,
        bandLowTHB: Math.round(med * (1 - NORMAL_BAND_PCT / 100)),
        bandHighTHB: Math.round(med * (1 + NORMAL_BAND_PCT / 100)),
        highRiskCount: inQuarter.filter((p) => p.lockSpecLevel === "high").length,
        projects: inQuarter,
      };
    });
  }, [
    availableMonths,
    filteredByTopBar,
    timeGrain,
    lang,
    effectiveStartMonth,
    effectiveEndMonth,
  ]);

  // 3. Financial Metrics for Section 3 (Price Reality Check Summary)
  const priceMetrics = useMemo<PriceRealityMetrics>(() => {
    const torCount = filteredByTopBar.length;
    if (torCount === 0) {
      return {
        torCount: 0,
        overallMedian: 0,
        overallAverage: 0,
        avgDeltaPct: 0,
        outlierCount: 0,
        outlierRatePct: 0,
        highOutlierCount: 0,
        lowOutlierCount: 0,
        minPrice: 0,
        maxPrice: 0,
      };
    }

    const prices = filteredByTopBar.map((p) => p.referencePriceTHB);
    const medians = filteredByTopBar.map((p) => p.peerMedianTHB);
    const averages = filteredByTopBar.map((p) => p.peerAverageTHB);

    const overallMedian = computeMedian(medians);
    const overallAverage = computeAverage(averages);
    const avgDeltaPct = overallMedian > 0
      ? Number((((overallAverage - overallMedian) / overallMedian) * 100).toFixed(1))
      : 0;

    let highOutlierCount = 0;
    let lowOutlierCount = 0;
    for (const p of filteredByTopBar) {
      const delta = calcPriceDeltaPct(p);
      if (delta > NORMAL_BAND_PCT) highOutlierCount += 1;
      else if (delta < -NORMAL_BAND_PCT) lowOutlierCount += 1;
    }

    const outlierCount = highOutlierCount + lowOutlierCount;
    const outlierRatePct = Math.round((outlierCount / torCount) * 100);

    return {
      torCount,
      overallMedian,
      overallAverage,
      avgDeltaPct,
      outlierCount,
      outlierRatePct,
      highOutlierCount,
      lowOutlierCount,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
    };
  }, [filteredByTopBar]);

  // 4. Compliance and Statutory Metrics for Section 4 (Lock-Spec Overview)
  const lockSpecMetrics = useMemo(() => {
    const extractedCount = filteredByTopBar.length;
    const lowCount = filteredByTopBar.filter((p) => p.lockSpecLevel === "low").length;
    const medCount = filteredByTopBar.filter((p) => p.lockSpecLevel === "medium").length;
    const highCount = filteredByTopBar.filter((p) => p.lockSpecLevel === "high").length;

    const triggerCounts: Record<LockSpecTriggerId, number> = {
      "Specification Tailoring": 0,
      "Qualification Barrier": 0,
      "Vendor Lock-in": 0,
    };
    for (const p of filteredByTopBar) {
      for (const t of p.triggers) {
        triggerCounts[t.category] += 1;
      }
    }

    return {
      extractedCount,
      lowCount,
      medCount,
      highCount,
      triggerCounts,
    };
  }, [filteredByTopBar]);

  // 5. Projects for Section 5 (Evidence Board Table)
  const tableProjects = useMemo(() => {
    let list = [...filteredByTopBar];

    if (tableTab === "flagged") {
      list = list
        .filter(
          (p) =>
            Math.abs(calcPriceDeltaPct(p)) > NORMAL_BAND_PCT || p.lockSpecScore >= 35,
        )
        .sort((a, b) => {
          const scoreDiff = b.lockSpecScore - a.lockSpecScore;
          if (scoreDiff !== 0) return scoreDiff;
          return Math.abs(calcPriceDeltaPct(b)) - Math.abs(calcPriceDeltaPct(a));
        });
    } else if (tableTab === "price") {
      list = list.sort(
        (a, b) => Math.abs(calcPriceDeltaPct(b)) - Math.abs(calcPriceDeltaPct(a)),
      );
    } else if (tableTab === "lockspec") {
      list = list
        .filter((p) => p.lockSpecScore > 0)
        .sort((a, b) => b.lockSpecScore - a.lockSpecScore);
    } else {
      list = list.sort((a, b) => b.postedAt.localeCompare(a.postedAt));
    }

    return list;
  }, [filteredByTopBar, tableTab]);

  const hasActiveFilters =
    selectedStatuses.length < ALL_STATUSES.length ||
    selectedRiskLevels.length < ALL_RISK_LEVELS.length ||
    selectedComplexities.length < ALL_COMPLEXITIES.length ||
    selectedCategories.length > 0 ||
    selectedArchetypes.length > 0 ||
    agencyFilter !== "all" ||
    priceBand !== "all" ||
    effectiveStartMonth !== defaultStartMonth ||
    effectiveEndMonth !== defaultEndMonth;

  function resetAllFilters() {
    setSelectedStatuses(ALL_STATUSES);
    setSelectedRiskLevels(ALL_RISK_LEVELS);
    setSelectedComplexities(ALL_COMPLEXITIES);
    setSelectedCategories([]);
    setSelectedArchetypes([]);
    setAgencyFilter("all");
    setPriceBand("all");
    setStartMonth(defaultStartMonth);
    setEndMonth(defaultEndMonth);
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6">
      {/* Page Header */}
      <header className="mb-5">
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">
          {lang === "th"
            ? "แนวโน้มราคากลางและสัญญาณล็อกสเปก"
            : "Reference price trends & lock-spec signals"}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-thai text-ink-2">
          {lang === "th"
            ? "เปรียบเทียบแนวโน้มราคากลางตามประเภทงาน และตรวจดูข้อกำหนดที่อาจจำกัดการแข่งขัน"
            : "Compare reference price trends by project type and inspect requirements that may restrict competition."}
        </p>
      </header>

      {/* Loading State */}
      {dataSource === "loading" ? (
        <Panel className="p-8 text-center">
          <p className="text-[14px] text-ink-2">
            {lang === "th" ? "กำลังดึงข้อมูลโครงการและสถิติราคาจากฐานข้อมูล..." : "Loading procurement data..."}
          </p>
        </Panel>
      ) : dataSource === "error" ? (
        <EmptyState
          headline={
            lang === "th"
              ? "ไม่สามารถเชื่อมต่อฐานข้อมูลได้ในขณะนี้"
              : "Unable to connect to database"
          }
          body={
            lang === "th"
              ? "เกิดข้อผิดพลาดในการดึงข้อมูลประกาศจัดซื้อจัดจ้าง กรุณาตรวจสอบว่าเซิร์ฟเวอร์เปิดทำงานอยู่แล้วลองใหม่อีกครั้ง"
              : "Failed to fetch procurement opportunities. Please check if the server is running."
          }
          action={
            <button
              type="button"
              onClick={() => setFetchTrigger((prev) => prev + 1)}
              className={btn.primary}
            >
              {lang === "th" ? "ลองใหม่อีกครั้ง" : "Retry"}
            </button>
          }
        />
      ) : allProjects.length === 0 ? (
        <EmptyState
          headline={
            lang === "th"
              ? "ยังไม่มีข้อมูลโครงการสำหรับการวิเคราะห์"
              : "No procurement data available yet"
          }
          body={
            lang === "th"
              ? "ยังไม่พบประกาศจัดซื้อจัดจ้างในระบบ เมื่อมีข้อมูลประกาศเข้ามาแดชบอร์ดจะสรุปแนวโน้มราคากลางและสัญญาณล็อกสเปกโดยอัตโนมัติ"
              : "No procurement projects have been ingested yet. Trends and lock-spec signals will appear automatically once data is available."
          }
          action={
            <button
              type="button"
              onClick={() => setFetchTrigger((prev) => prev + 1)}
              className={btn.secondary}
            >
              {lang === "th" ? "รีเฟรชข้อมูล" : "Refresh"}
            </button>
          }
        />
      ) : (
        <>
          {/* SECTION 1: Universal Top Filter Bar (The only place to influence data) */}
          <WatchdogFilterBar
            lang={lang}
            selectedStatuses={selectedStatuses}
            onToggleStatus={toggleStatus}
            onSelectAllStatuses={() => setSelectedStatuses(ALL_STATUSES)}
            selectedRiskLevels={selectedRiskLevels}
            onToggleRiskLevel={toggleRiskLevel}
            onSelectAllRiskLevels={() => setSelectedRiskLevels(ALL_RISK_LEVELS)}
            selectedComplexities={selectedComplexities}
            onToggleComplexity={toggleComplexity}
            onSelectAllComplexities={() => setSelectedComplexities(ALL_COMPLEXITIES)}
            selectedCategories={selectedCategories}
            onToggleCategory={toggleCategory}
            onSelectAllCategories={() => setSelectedCategories(allProjects.map((p) => p.category))}
            onClearCategories={() => setSelectedCategories([])}
            selectedArchetypes={selectedArchetypes}
            onToggleArchetype={toggleArchetype}
            onSelectAllArchetypes={() => setSelectedArchetypes(allProjects.map((p) => p.archetype))}
            onClearArchetypes={() => setSelectedArchetypes([])}
            agencyFilter={agencyFilter}
            onAgencyChange={setAgencyFilter}
            agencies={agencies}
            priceBand={priceBand}
            onPriceBandChange={setPriceBand}
            effectiveStartMonth={effectiveStartMonth}
            effectiveEndMonth={effectiveEndMonth}
            defaultStartMonth={defaultStartMonth}
            defaultEndMonth={defaultEndMonth}
            onStartMonthChange={(val) => {
              setStartMonth(val);
              if (val > effectiveEndMonth) setEndMonth(val);
            }}
            onEndMonthChange={(val) => {
              setEndMonth(val);
              if (val < effectiveStartMonth) setStartMonth(val);
            }}
            availableMonths={availableMonths}
            hasActiveFilters={hasActiveFilters}
            onResetFilters={resetAllFilters}
          />

          {/* SECTION 2: Macro Trend Line Chart */}
          <section className="mb-8">
            <SectionHeading
              sub={
                lang === "th"
                  ? "เปรียบเทียบแนวโน้มค่ามัธยฐาน (เส้นทึบ) และค่าเฉลี่ย (เส้นประ) ของราคากลางตามช่วงเวลา พร้อมจุดแสดงโครงการจริงในกลุ่มที่เลือก"
                  : "Historical median (solid) and average (dashed) reference price trend over time, with individual TORs plotted against the ±15% normal band."
              }
              right={
                <div className="inline-flex rounded-[3px] border border-line bg-surface-2 p-0.5">
                  <button
                    type="button"
                    onClick={() => setTimeGrain("monthly")}
                    className={`rounded-[2px] px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
                      timeGrain === "monthly"
                        ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                        : "text-ink-3 hover:text-ink"
                    }`}
                  >
                    {lang === "th" ? "รายเดือน" : "Monthly"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeGrain("quarterly")}
                    className={`rounded-[2px] px-2.5 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
                      timeGrain === "quarterly"
                        ? "bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                        : "text-ink-3 hover:text-ink"
                    }`}
                  >
                    {lang === "th" ? "รายไตรมาส" : "Quarterly"}
                  </button>
                </div>
              }
            >
              {lang === "th"
                ? "แนวโน้มราคากลางและกรอบราคาตลาดย้อนหลัง"
                : "Historical Price Trend & Market Band"}
            </SectionHeading>

            <Panel className="p-4">
              <PriceTrendLineChart
                series={timeSeries}
                lang={lang}
                activeBucket={null}
                onSelectBucket={() => {}}
              />
            </Panel>
          </section>

          {/* SECTION 3: Price Reality Check Summary (Clearly emphasizes Reference Price vs Budget) */}
          <PriceRealitySummary lang={lang} metrics={priceMetrics} />

          {/* SECTION 4: Lock-Spec Statutory Overview (Read-Only Status Gauge) */}
          <LockSpecOverview
            lang={lang}
            extractedCount={lockSpecMetrics.extractedCount}
            lowCount={lockSpecMetrics.lowCount}
            medCount={lockSpecMetrics.medCount}
            highCount={lockSpecMetrics.highCount}
            triggerCounts={lockSpecMetrics.triggerCounts}
          />

          {/* SECTION 5: Evidence Board Table (Audit Trail) */}
          <WatchdogEvidenceTable
            lang={lang}
            tableProjects={tableProjects}
            tableTab={tableTab}
            onTabChange={setTableTab}
            rowLimit={rowLimit}
            onRowLimitChange={setRowLimit}
            onResetFilters={resetAllFilters}
            dataSource={dataSource}
            totalProjectsCount={filteredByTopBar.length}
          />
        </>
      )}
    </div>
  );
}
