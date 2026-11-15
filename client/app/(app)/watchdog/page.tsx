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
import { type RiskLevel } from "../../_data/tors";
import { listTors, type TorInsightSummary } from "../../_lib/api";
import { LockSpecBreakdown } from "./_components/LockSpecBreakdown";
import { PriceTrendLineChart } from "./_components/PriceTrendLineChart";
import { WatchdogEvidenceTable } from "./_components/WatchdogEvidenceTable";
import { WatchdogFilterBar } from "./_components/WatchdogFilterBar";
import { WatchdogKpiStrip } from "./_components/WatchdogKpiStrip";
import {
  NORMAL_BAND_PCT,
  PRICE_BAND_OPTIONS,
  type PriceBandId,
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

  // Dynamic timeline months derived from the active dataset
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

  // Global Filter State
  const [category, setCategory] = useState<ProjectCategory | "all">("all");
  const [archetype, setArchetype] = useState<SystemArchetype | "all">("all");
  const [complexity, setComplexity] = useState<ComplexityTier | "all">("all");
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

  // Interactive drill-down filters from charts/cards
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [selectedTrigger, setSelectedTrigger] = useState<LockSpecTriggerId | null>(null);
  const [selectedRiskTier, setSelectedRiskTier] = useState<RiskLevel | null>(null);

  // Bottom Table State
  const [tableTab, setTableTab] = useState<TableTab>("flagged");
  const [rowLimit, setRowLimit] = useState<number>(10);

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

  // 1. Filter projects by top global filter bar
  const filteredByTopBar = useMemo(() => {
    const band = PRICE_BAND_OPTIONS.find((b) => b.id === priceBand);
    return allProjects.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (archetype !== "all" && p.archetype !== archetype) return false;
      if (complexity !== "all" && p.complexity !== complexity) return false;
      if (agencyFilter !== "all" && p.agency.th !== agencyFilter) return false;
      if (band?.min !== undefined && p.referencePriceTHB < band.min) return false;
      if (band?.max !== undefined && p.referencePriceTHB > band.max) return false;
      if (p.month < effectiveStartMonth || p.month > effectiveEndMonth) return false;
      return true;
    });
  }, [
    allProjects,
    category,
    archetype,
    complexity,
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

  // 3. Summary KPI metrics for the current slice
  const kpis = useMemo(() => {
    const extractedCount = filteredByTopBar.length;
    const activeCount = filteredByTopBar.filter(
      (p) => p.status === "Open" || p.status === "Draft",
    ).length;
    const completedCount = extractedCount - activeCount;

    const overallMedian = computeMedian(filteredByTopBar.map((p) => p.peerMedianTHB));
    const overallAverage = computeAverage(filteredByTopBar.map((p) => p.peerAverageTHB));

    const lowCount = filteredByTopBar.filter((p) => p.lockSpecLevel === "low").length;
    const medCount = filteredByTopBar.filter((p) => p.lockSpecLevel === "medium").length;
    const highCount = filteredByTopBar.filter((p) => p.lockSpecLevel === "high").length;

    const flaggedRiskCount = medCount + highCount;
    const riskRatePct =
      extractedCount > 0 ? Math.round((flaggedRiskCount / extractedCount) * 100) : 0;

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
      activeCount,
      completedCount,
      overallMedian,
      overallAverage,
      lowCount,
      medCount,
      highCount,
      flaggedRiskCount,
      riskRatePct,
      triggerCounts,
    };
  }, [filteredByTopBar]);

  // 4. Filter projects for the bottom table
  const tableProjects = useMemo(() => {
    let list = [...filteredByTopBar];

    if (selectedBucket) {
      if (timeGrain === "monthly") {
        list = list.filter((p) => p.month === selectedBucket);
      } else {
        const monthKeys = availableMonths
          .filter((m) => m.quarter === selectedBucket)
          .map((m) => m.key);
        list = list.filter((p) => monthKeys.includes(p.month));
      }
    }

    if (selectedRiskTier) {
      list = list.filter((p) => p.lockSpecLevel === selectedRiskTier);
    }

    if (selectedTrigger) {
      list = list.filter((p) => p.triggers.some((t) => t.category === selectedTrigger));
    }

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
  }, [
    availableMonths,
    filteredByTopBar,
    selectedBucket,
    selectedRiskTier,
    selectedTrigger,
    tableTab,
    timeGrain,
  ]);

  const hasActiveFilters =
    category !== "all" ||
    archetype !== "all" ||
    complexity !== "all" ||
    agencyFilter !== "all" ||
    priceBand !== "all" ||
    effectiveStartMonth !== defaultStartMonth ||
    effectiveEndMonth !== defaultEndMonth ||
    selectedBucket !== null ||
    selectedTrigger !== null ||
    selectedRiskTier !== null;

  function resetAllFilters() {
    setCategory("all");
    setArchetype("all");
    setComplexity("all");
    setAgencyFilter("all");
    setPriceBand("all");
    setStartMonth(defaultStartMonth);
    setEndMonth(defaultEndMonth);
    setSelectedBucket(null);
    setSelectedTrigger(null);
    setSelectedRiskTier(null);
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
          {/* 1. Global Filter Bar */}
          <WatchdogFilterBar
            lang={lang}
            category={category}
            onCategoryChange={(val) => {
              setCategory(val);
              setSelectedBucket(null);
            }}
            archetype={archetype}
            onArchetypeChange={(val) => {
              setArchetype(val);
              setSelectedBucket(null);
            }}
            complexity={complexity}
            onComplexityChange={(val) => {
              setComplexity(val);
              setSelectedBucket(null);
            }}
            agencyFilter={agencyFilter}
            onAgencyChange={(val) => {
              setAgencyFilter(val);
              setSelectedBucket(null);
            }}
            agencies={agencies}
            priceBand={priceBand}
            onPriceBandChange={(val) => {
              setPriceBand(val);
              setSelectedBucket(null);
            }}
            effectiveStartMonth={effectiveStartMonth}
            effectiveEndMonth={effectiveEndMonth}
            defaultStartMonth={defaultStartMonth}
            defaultEndMonth={defaultEndMonth}
            onStartMonthChange={(val) => {
              setStartMonth(val);
              if (val > effectiveEndMonth) setEndMonth(val);
              setSelectedBucket(null);
            }}
            onEndMonthChange={(val) => {
              setEndMonth(val);
              if (val < effectiveStartMonth) setStartMonth(val);
              setSelectedBucket(null);
            }}
            availableMonths={availableMonths}
            selectedBucket={selectedBucket}
            selectedTrigger={selectedTrigger}
            selectedRiskTier={selectedRiskTier}
            hasActiveFilters={hasActiveFilters}
            onResetFilters={resetAllFilters}
          />

          {/* 2. Main Time-Series Visualization */}
          <section className="mb-5">
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
                    onClick={() => {
                      setTimeGrain("monthly");
                      setSelectedBucket(null);
                    }}
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
                    onClick={() => {
                      setTimeGrain("quarterly");
                      setSelectedBucket(null);
                    }}
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
                : "Historical price trend & market band"}
            </SectionHeading>

            <Panel className="p-4">
              <PriceTrendLineChart
                series={timeSeries}
                lang={lang}
                activeBucket={selectedBucket}
                onSelectBucket={setSelectedBucket}
              />
            </Panel>
          </section>

          {/* 3. KPI Summary Strip */}
          <WatchdogKpiStrip kpis={kpis} lang={lang} />

          {/* 4. Macro Lock-Spec Risk Breakdown */}
          <LockSpecBreakdown
            lang={lang}
            extractedCount={kpis.extractedCount}
            lowCount={kpis.lowCount}
            medCount={kpis.medCount}
            highCount={kpis.highCount}
            triggerCounts={kpis.triggerCounts}
            selectedRiskTier={selectedRiskTier}
            onSelectRiskTier={(level) => {
              setSelectedRiskTier(level);
              if (level) setTableTab("all");
            }}
            selectedTrigger={selectedTrigger}
            onSelectTrigger={(trig) => {
              setSelectedTrigger(trig);
              if (trig) setTableTab("lockspec");
            }}
          />

          {/* 5. Notable & Flagged Projects Table */}
          <WatchdogEvidenceTable
            lang={lang}
            tableProjects={tableProjects}
            tableTab={tableTab}
            onTabChange={setTableTab}
            rowLimit={rowLimit}
            onRowLimitChange={setRowLimit}
            onResetFilters={resetAllFilters}
            dataSource={dataSource}
            totalProjectsCount={allProjects.length}
          />
        </>
      )}
    </div>
  );
}
