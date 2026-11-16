"use client";

import { useEffect, useMemo, useState } from "react";
import { useLang } from "../../_components/prefs";
import { btn, EmptyState, Panel, SectionHeading } from "../../_components/ui";
import {
  ARCHETYPE_OPTIONS,
  calcPriceDeltaPct,
  CATEGORY_OPTIONS,
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
  type PriceRealityMetrics,
  type TimeGrain,
  type TimePoint,
} from "./_lib/types";
import {
  computeAverage,
  computeMedian,
  formatMonthBucket,
  generateMonthRange,
  mapApiTorToWatchdog,
} from "./_lib/watchdog-helpers";

const ALL_STATUSES: Status[] = ["Open", "Draft", "Awarded", "Closed", "Cancelled"];
const ALL_RISK_LEVELS: RiskLevel[] = ["high", "medium", "low"];
const ALL_COMPLEXITIES: ComplexityTier[] = ["basic", "standard", "enterprise"];
const ALL_CATEGORIES: ProjectCategory[] = CATEGORY_OPTIONS.filter((c) => c.id !== "all").map(
  (c) => c.id as ProjectCategory,
);
const ALL_ARCHETYPES: SystemArchetype[] = ARCHETYPE_OPTIONS.filter((a) => a.id !== "all").map(
  (a) => a.id as SystemArchetype,
);

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

  const allProjects = useMemo(() => liveProjects ?? [], [liveProjects]);

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
  const [selectedCategories, setSelectedCategories] = useState<ProjectCategory[]>(ALL_CATEGORIES);
  const [selectedArchetypes, setSelectedArchetypes] = useState<SystemArchetype[]>(ALL_ARCHETYPES);
  const [selectedAgencies, setSelectedAgencies] = useState<string[]>([]);
  const [minPriceTHB, setMinPriceTHB] = useState<number>(0);
  const [maxPriceTHB, setMaxPriceTHB] = useState<number>(0);
  const [startMonth, setStartMonth] = useState<string>("");
  const [endMonth, setEndMonth] = useState<string>("");
  const [timeGrain, setTimeGrain] = useState<TimeGrain>("monthly");
  const [showOnlyExistingProjects, setShowOnlyExistingProjects] = useState<boolean>(false);

  const effectiveStartMonth = startMonth || defaultStartMonth;
  const effectiveEndMonth = endMonth || defaultEndMonth;

  // Validation: end date must not be before start date
  const isDateRangeInvalid = Boolean(
    effectiveStartMonth && effectiveEndMonth && effectiveStartMonth > effectiveEndMonth,
  );

  // Toggle Handlers
  function toggleStatus(st: Status) {
    setSelectedStatuses((prev) =>
      prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st],
    );
  }

  function toggleRiskLevel(level: RiskLevel) {
    setSelectedRiskLevels((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level],
    );
  }

  function toggleComplexity(tier: ComplexityTier) {
    setSelectedComplexities((prev) =>
      prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier],
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

  function toggleAgency(agency: string) {
    setSelectedAgencies((prev) =>
      prev.includes(agency) ? prev.filter((a) => a !== agency) : [...prev, agency],
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

  // Initialize selectedAgencies to all agencies by default
  const [prevAgenciesCount, setPrevAgenciesCount] = useState(0);
  if (agencies.length > 0 && prevAgenciesCount === 0) {
    setPrevAgenciesCount(agencies.length);
    setSelectedAgencies(agencies.map((a) => a.th));
  }

  // 1. Single Top Filter Bar drives the entire dataset
  const filteredByTopBar = useMemo(() => {
    return allProjects.filter((p) => {
      // Status
      if (!selectedStatuses.includes(p.status)) return false;
      // Lock-Spec Risk Level
      if (!selectedRiskLevels.includes(p.lockSpecLevel)) return false;
      // Complexity Tier
      if (!selectedComplexities.includes(p.complexity)) return false;
      // Category
      if (!selectedCategories.includes(p.category)) return false;
      // System Archetype
      if (!selectedArchetypes.includes(p.archetype)) return false;
      // Agency (Multi-select)
      if (agencies.length > 0 && !selectedAgencies.includes(p.agency.th)) return false;
      // Price Range (min and max)
      if (minPriceTHB > 0 && p.referencePriceTHB < minPriceTHB) return false;
      if (maxPriceTHB > 0 && p.referencePriceTHB > maxPriceTHB) return false;
      // Time Period (only filter if date range is valid)
      if (!isDateRangeInvalid) {
        if (effectiveStartMonth && p.month < effectiveStartMonth) return false;
        if (effectiveEndMonth && p.month > effectiveEndMonth) return false;
      }
      return true;
    });
  }, [
    allProjects,
    selectedStatuses,
    selectedRiskLevels,
    selectedComplexities,
    selectedCategories,
    selectedArchetypes,
    selectedAgencies,
    agencies.length,
    minPriceTHB,
    maxPriceTHB,
    effectiveStartMonth,
    effectiveEndMonth,
    isDateRangeInvalid,
  ]);

  // 2. Build time-series points (Monthly or Quarterly) from filteredByTopBar
  const timeSeries = useMemo<TimePoint[]>(() => {
    let activeMonths: Array<{
      key: string;
      labelTh: string;
      labelEn: string;
      quarter: string;
    }>;

    if (showOnlyExistingProjects) {
      // Data-driven compressed mode: only buckets with existing projects
      activeMonths = isDateRangeInvalid
        ? availableMonths
        : availableMonths.filter(
            (m) =>
              (!effectiveStartMonth || m.key >= effectiveStartMonth) &&
              (!effectiveEndMonth || m.key <= effectiveEndMonth),
          );
    } else {
      // Continuous timeline mode (Option A default): full span from start to end
      const continuous =
        !isDateRangeInvalid && effectiveStartMonth && effectiveEndMonth
          ? generateMonthRange(effectiveStartMonth, effectiveEndMonth)
          : [];
      activeMonths =
        continuous.length > 0
          ? continuous
          : isDateRangeInvalid
            ? availableMonths
            : availableMonths.filter(
                (m) =>
                  (!effectiveStartMonth || m.key >= effectiveStartMonth) &&
                  (!effectiveEndMonth || m.key <= effectiveEndMonth),
              );
    }

    if (timeGrain === "monthly") {
      return activeMonths.map((m) => {
        const inMonth = filteredByTopBar.filter((p) => p.month === m.key);
        const prices = inMonth.map((p) => p.referencePriceTHB);
        const med = computeMedian(prices);
        const avg = computeAverage(prices);

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
      const prices = inQuarter.map((p) => p.referencePriceTHB);
      const med = computeMedian(prices);
      const avg = computeAverage(prices);

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
    isDateRangeInvalid,
    showOnlyExistingProjects,
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

    const overallMedian = computeMedian(prices);
    const overallAverage = computeAverage(prices);
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

  const hasActiveFilters =
    selectedStatuses.length < ALL_STATUSES.length ||
    selectedRiskLevels.length < ALL_RISK_LEVELS.length ||
    selectedComplexities.length < ALL_COMPLEXITIES.length ||
    selectedCategories.length < ALL_CATEGORIES.length ||
    selectedArchetypes.length < ALL_ARCHETYPES.length ||
    (agencies.length > 0 && selectedAgencies.length < agencies.length) ||
    minPriceTHB > 0 ||
    maxPriceTHB > 0 ||
    effectiveStartMonth !== defaultStartMonth ||
    effectiveEndMonth !== defaultEndMonth;

  function resetAllFilters() {
    setSelectedStatuses(ALL_STATUSES);
    setSelectedRiskLevels(ALL_RISK_LEVELS);
    setSelectedComplexities(ALL_COMPLEXITIES);
    setSelectedCategories(ALL_CATEGORIES);
    setSelectedArchetypes(ALL_ARCHETYPES);
    setSelectedAgencies(agencies.map((a) => a.th));
    setMinPriceTHB(0);
    setMaxPriceTHB(0);
    setStartMonth(defaultStartMonth);
    setEndMonth(defaultEndMonth);
    setShowOnlyExistingProjects(false);
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 sm:px-6 py-6">
      {/* Page Header */}
      <header className="mb-5">
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">
          {lang === "th"
            ? "ภาพรวมราคาและความเสี่ยง"
            : "Market Pricing & Risk Overview"}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-thai text-ink-2">
          {lang === "th"
            ? "วิเคราะห์ภาพรวมราคากลางเปรียบเทียบกับราคาตลาด และตรวจดูข้อกำหนดที่อาจจำกัดการแข่งขัน"
            : "Analyze macro reference price trends against market baselines and inspect procurement risk signals."}
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
              ? "ยังไม่พบประกาศจัดซื้อจัดจ้างในระบบ เมื่อมีข้อมูลประกาศเข้ามาแดชบอร์ดจะสรุปภาพรวมราคาและความเสี่ยงโดยอัตโนมัติ"
              : "No procurement projects have been ingested yet. Trends and risk signals will appear automatically once data is available."
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
            onClearStatuses={() => setSelectedStatuses([])}
            selectedRiskLevels={selectedRiskLevels}
            onToggleRiskLevel={toggleRiskLevel}
            onSelectAllRiskLevels={() => setSelectedRiskLevels(ALL_RISK_LEVELS)}
            onClearRiskLevels={() => setSelectedRiskLevels([])}
            selectedComplexities={selectedComplexities}
            onToggleComplexity={toggleComplexity}
            onSelectAllComplexities={() => setSelectedComplexities(ALL_COMPLEXITIES)}
            onClearComplexities={() => setSelectedComplexities([])}
            selectedCategories={selectedCategories}
            onToggleCategory={toggleCategory}
            onSelectAllCategories={() => setSelectedCategories(ALL_CATEGORIES)}
            onClearCategories={() => setSelectedCategories([])}
            selectedArchetypes={selectedArchetypes}
            onToggleArchetype={toggleArchetype}
            onSelectAllArchetypes={() => setSelectedArchetypes(ALL_ARCHETYPES)}
            onClearArchetypes={() => setSelectedArchetypes([])}
            selectedAgencies={selectedAgencies}
            onToggleAgency={toggleAgency}
            onSelectAllAgencies={() => setSelectedAgencies(agencies.map((a) => a.th))}
            onClearAgencies={() => setSelectedAgencies([])}
            agencies={agencies}
            minPriceTHB={minPriceTHB}
            maxPriceTHB={maxPriceTHB}
            onPriceRangeChange={(min, max) => {
              setMinPriceTHB(min);
              setMaxPriceTHB(max);
            }}
            effectiveStartMonth={effectiveStartMonth}
            effectiveEndMonth={effectiveEndMonth}
            defaultStartMonth={defaultStartMonth}
            defaultEndMonth={defaultEndMonth}
            onStartMonthChange={(val) => setStartMonth(val)}
            onEndMonthChange={(val) => setEndMonth(val)}
            availableMonths={availableMonths}
            hasActiveFilters={hasActiveFilters}
            onResetFilters={resetAllFilters}
          />

          {/* SECTION 2: Macro Trend Line Chart */}
          <section className="mb-8">
            <SectionHeading
              sub={
                lang === "th"
                  ? "เปรียบเทียบแนวโน้มราคากลางผ่านค่ามัธยฐาน (เส้นทึบ) และค่าเฉลี่ย (เส้นประ) ตามตัวกรองข้อมูล พร้อมจุดแสดงโครงการจริงในแต่ละช่วงเวลา"
                  : "Compare reference price trends via historical median (solid) and average (dashed) lines across active filters, with individual project dots plotted over time."
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
                ? "แนวโน้มราคากลางภายในตลาด (Market Reference Price Trends)"
                : "Market Reference Price Trends"}
            </SectionHeading>

            <Panel className="p-4">
              <PriceTrendLineChart
                series={timeSeries}
                lang={lang}
                activeBucket={null}
                onSelectBucket={() => {}}
                showOnlyExisting={showOnlyExistingProjects}
                onToggleShowOnlyExisting={setShowOnlyExistingProjects}
                filterMinPrice={minPriceTHB}
                filterMaxPrice={maxPriceTHB}
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
            tableProjects={filteredByTopBar}
            onResetFilters={resetAllFilters}
            dataSource={dataSource}
            totalProjectsCount={filteredByTopBar.length}
          />
        </>
      )}
    </div>
  );
}
