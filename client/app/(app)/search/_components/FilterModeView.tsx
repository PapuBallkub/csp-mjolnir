"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { listTors, torFacets, type ApiError, type ApiResult, type TorFacets, type TorListParams, type TorStatus } from "../../../_lib/api";
import { matchFor } from "../../../_lib/match";
import { useAuth } from "../../../_components/auth";
import { useProfile } from "../../../_components/prefs";
import { CatalogRow, CatalogRowSkeleton } from "../../../_components/catalog-row";
import { DEFAULT_STATUSES, STATUSES, showsEveryStatus, statusChanges } from "../../../_lib/catalog";
import { btn, EmptyState, input, Label } from "../../../_components/ui";
import {
  BUDGET_BANDS,
  DEADLINE_BANDS,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  SORTS,
  type Page,
  type Sort,
} from "../_lib/types";
import {
  buildFilterQueryString,
  parseFilterParams,
  syncUrlToBrowser,
} from "../_lib/search-params";
import { failureText, useDebounced } from "./SearchCommon";
import { FilterRail } from "./FilterRail";
import { Pagination } from "./Pagination";

export function FilterModeView() {
  const { profile } = useProfile();
  const { status: authStatus } = useAuth();
  const searchParams = useSearchParams();

  const initialParsed = useMemo(() => parseFilterParams(searchParams), [searchParams]);

  const [query, setQuery] = useState(() => initialParsed.query);
  const [statuses, setStatuses] = useState<TorStatus[]>(() => initialParsed.statuses);
  const [amendedOnly, setAmendedOnly] = useState(() => initialParsed.amendedOnly);
  const [techFilter, setTechFilter] = useState<string[]>(() => initialParsed.techFilter);
  const [agencyFilter, setAgencyFilter] = useState<string[]>(() => initialParsed.agencyFilter);
  const [budgetBand, setBudgetBand] = useState(() => initialParsed.budgetBand);
  const [deadlineBand, setDeadlineBand] = useState(() => initialParsed.deadlineBand);
  const [hideHighRisk, setHideHighRisk] = useState(() => initialParsed.hideHighRisk);
  const [rawSort, setSort] = useState<Sort>(() => initialParsed.sort);
  const [page, setPage] = useState<number>(() => initialParsed.page ?? 1);
  const [pageSize, setPageSize] = useState<number>(() => initialParsed.pageSize ?? DEFAULT_PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const sort: Sort =
    authStatus === "anonymous" && (rawSort === "match-desc" || rawSort === "match-asc")
      ? "newest"
      : rawSort;

  // Handle browser Back / Forward buttons (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const sp = new URLSearchParams(window.location.search);
      const parsed = parseFilterParams(sp);
      setQuery(parsed.query);
      setSort(parsed.sort);
      setBudgetBand(parsed.budgetBand);
      setDeadlineBand(parsed.deadlineBand);
      setTechFilter(parsed.techFilter);
      setAgencyFilter(parsed.agencyFilter);
      setStatuses(parsed.statuses);
      setAmendedOnly(parsed.amendedOnly);
      setHideHighRisk(parsed.hideHighRisk);
      setPage(parsed.page ?? 1);
      setPageSize(parsed.pageSize ?? DEFAULT_PAGE_SIZE);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const debouncedQuery = useDebounced(query, 300);

  // Reset to page 1 when search filters change
  const filterSignature = useMemo(
    () => `${debouncedQuery}:${statuses.join(",")}:${amendedOnly}:${techFilter.join(",")}:${agencyFilter.join(",")}:${budgetBand}:${deadlineBand}:${hideHighRisk}:${sort}`,
    [debouncedQuery, statuses, amendedOnly, techFilter, agencyFilter, budgetBand, deadlineBand, hideHighRisk, sort]
  );
  const prevFilterSig = useRef(filterSignature);
  useEffect(() => {
    if (prevFilterSig.current !== filterSignature) {
      prevFilterSig.current = filterSignature;
      setPage(1);
    }
  }, [filterSignature]);

  const isInitialMount = useRef(true);

  // Sync state changes to URL query string without reloading
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const qs = buildFilterQueryString({
      query: debouncedQuery,
      statuses,
      amendedOnly,
      techFilter,
      agencyFilter,
      budgetBand,
      deadlineBand,
      hideHighRisk,
      sort,
      page,
      pageSize,
    });
    syncUrlToBrowser(qs);
  }, [
    debouncedQuery,
    statuses,
    amendedOnly,
    techFilter,
    agencyFilter,
    budgetBand,
    deadlineBand,
    hideHighRisk,
    sort,
    page,
    pageSize,
  ]);

  const activeCount =
    statusChanges(statuses) +
    (amendedOnly ? 1 : 0) +
    techFilter.length +
    agencyFilter.length +
    (budgetBand === "any" ? 0 : 1) +
    (deadlineBand === "any" ? 0 : 1) +
    (hideHighRisk ? 1 : 0);

  function clearAll() {
    setQuery("");
    setStatuses(DEFAULT_STATUSES);
    setAmendedOnly(false);
    setTechFilter([]);
    setAgencyFilter([]);
    setBudgetBand("any");
    setDeadlineBand("any");
    setHideHighRisk(false);
    setPage(1);
  }

  /* ---------------------------- filter options ---------------------------- */

  const [facets, setFacets] = useState<ApiResult<TorFacets> | null>(null);
  const [facetsTry, setFacetsTry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    torFacets().then((result) => {
      if (!cancelled) setFacets(result);
    });
    return () => {
      cancelled = true;
    };
  }, [facetsTry]);

  /* ------------------------------ search list ----------------------------- */

  const isMatchSort = sort === "match-desc" || sort === "match-asc";

  const params = useMemo<TorListParams>(() => {
    const band = BUDGET_BANDS.find((b) => b.id === budgetBand);
    return {
      q: debouncedQuery.trim(),
      status: statuses,
      amended: amendedOnly,
      tech: techFilter,
      agency: agencyFilter,
      minBudget: band?.min,
      maxBudget: band?.max,
      closingWithin: DEADLINE_BANDS.find((b) => b.id === deadlineBand)?.days,
      excludeHighRisk: hideHighRisk,
      sort,
      limit: isMatchSort ? 100 : pageSize,
      page: isMatchSort ? 1 : page,
    };
  }, [debouncedQuery, statuses, amendedOnly, techFilter, agencyFilter, budgetBand, deadlineBand, hideHighRisk, sort, pageSize, page, isMatchSort]);

  const key = useMemo(() => JSON.stringify(params), [params]);

  const [list, setList] = useState<Page | null>(null);
  const [listError, setListError] = useState<{ key: string; error: ApiError } | null>(null);
  const [listTry, setListTry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listTors(params).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setListError({ key, error: result.error });
        return;
      }
      setListError(null);
      const { tors, total, pages } = result.data;
      setList({
        key,
        page,
        pageSize,
        total,
        pages,
        at: new Date(),
        tors,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [params, key, page, pageSize, listTry]);

  const current = list?.key === key ? list : null;
  const failed = listError?.key === key ? listError.error : null;
  const canMatch = authStatus === "authenticated";

  /* ------------------------------- results -------------------------------- */

  const skeleton = (
    <div aria-busy="true">
      <span className="sr-only">กำลังโหลดประกาศ</span>
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: Math.min(pageSize, 5) }, (_, i) => (
          <CatalogRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );

  function renderResults() {
    if (failed && !current) {
      return (
        <EmptyState
          headline="โหลดรายการประกาศไม่สำเร็จ"
          body={failureText(failed, "th")}
          action={
            <button type="button" onClick={() => setListTry((n) => n + 1)} className={btn.secondary}>
              ลองอีกครั้ง
            </button>
          }
        />
      );
    }

    const shown = current ?? list;
    if (!shown) return skeleton;

    if (current && current.total === 0) {
      const searched = Boolean(debouncedQuery.trim());
      const otherFilters = activeCount - statusChanges(statuses);
      if (!searched && activeCount === 0) {
        return (
          <EmptyState
            headline="ตอนนี้ไม่มีประกาศที่ยังยื่นได้"
            body="หน้านี้เริ่มต้นแสดงเฉพาะร่างประกาศและประกาศเชิญชวนที่ยังเปิดรับข้อเสนอ โครงการที่ปิดรับแล้ว ได้ผู้ชนะแล้ว หรือยกเลิก ดูได้จากตัวกรองสถานะ"
            action={
              <button type="button" onClick={() => setStatuses(STATUSES)} className={btn.secondary}>
                แสดงทุกสถานะ
              </button>
            }
          />
        );
      }
      return !searched && otherFilters === 0 && showsEveryStatus(statuses) ? (
        <EmptyState
          headline="ยังไม่มีประกาศในระบบ"
          body="ยังไม่มีประกาศที่สรุปเสร็จและพร้อมเผยแพร่ ลองกลับมาใหม่ภายหลัง ระหว่างนี้ประกาศต้นฉบับทั้งหมดยังอยู่ที่ e-GP"
        />
      ) : (
        <EmptyState
          headline="ไม่มีประกาศที่ตรงกับเงื่อนไขนี้"
          body="ลองค้นด้วยคำที่สั้นลง ขยายช่วงราคากลางหรือกำหนดยื่น หรือเอาตัวกรองบางข้อออก"
          action={
            <button type="button" onClick={clearAll} className={btn.secondary}>
              ล้างตัวกรองทั้งหมด
            </button>
          }
        />
      );
    }

    let displayedTors = shown.tors;
    let effectiveTotal = shown.total;
    let effectivePages = shown.pages;

    if (isMatchSort) {
      const sorted = [...shown.tors].sort((a, b) => {
        const scoreA = matchFor(a, profile).score;
        const scoreB = matchFor(b, profile).score;
        return sort === "match-desc" ? scoreB - scoreA : scoreA - scoreB;
      });
      effectiveTotal = sorted.length;
      effectivePages = Math.ceil(effectiveTotal / pageSize);
      displayedTors = sorted.slice((page - 1) * pageSize, page * pageSize);
    }

    return (
      <>
        <div aria-busy={!current}>
          <div className={`flex flex-col gap-3 transition-opacity ${current ? "" : "opacity-60"}`}>
            {displayedTors.map((tor) => {
              const match =
                canMatch || isMatchSort
                  ? matchFor(tor, profile)
                  : undefined;
              return <CatalogRow key={tor.projectId} tor={tor} now={shown.at} match={match} />;
            })}
          </div>
        </div>

        {current && failed ? (
          <p className="mt-3 text-center text-[12.5px] leading-thai text-ink-2">
            {failureText(failed, "th")}{" "}
            <button
              type="button"
              onClick={() => setListTry((n) => n + 1)}
              className="underline underline-offset-2 hover:text-ink cursor-pointer"
            >
              ลองอีกครั้ง
            </button>
          </p>
        ) : null}

        <Pagination
          page={page}
          pages={effectivePages}
          total={effectiveTotal}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageChange={(nextPage) => {
            setPage(nextPage);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onPageSizeChange={(newPageSize) => {
            setPageSize(newPageSize);
            setPage(1);
          }}
          disabled={!current}
        />
      </>
    );
  }

  const rail = (
    <FilterRail
      lang="th"
      statuses={statuses}
      setStatuses={setStatuses}
      amendedOnly={amendedOnly}
      setAmendedOnly={setAmendedOnly}
      techFilter={techFilter}
      setTechFilter={setTechFilter}
      agencyFilter={agencyFilter}
      setAgencyFilter={setAgencyFilter}
      budgetBand={budgetBand}
      setBudgetBand={setBudgetBand}
      deadlineBand={deadlineBand}
      setDeadlineBand={setDeadlineBand}
      hideHighRisk={hideHighRisk}
      setHideHighRisk={setHideHighRisk}
      activeCount={activeCount}
      clearAll={clearAll}
      facets={facets}
      onRetryFacets={() => setFacetsTry((n) => n + 1)}
    />
  );

  const countLine = (() => {
    if (!current) return "กำลังค้นหา…";
    const totalStr = current.total.toLocaleString();
    const searched = Boolean(debouncedQuery.trim());
    if (current.total === 0) return "ไม่พบประกาศ";
    if (activeCount === 0 && !searched && showsEveryStatus(statuses)) {
      return `ทั้งหมด ${totalStr} ประกาศ`;
    }
    return `พบ ${totalStr} ประกาศที่ตรงกับเงื่อนไข`;
  })();

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
      {/* Mobile Filters Toggle & Drawer */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className={`flex w-full items-center justify-between rounded-[3px] border border-line bg-surface px-3 py-2 text-[13px] font-medium text-ink cursor-pointer`}
          aria-expanded={filtersOpen}
        >
          <span className="flex items-center gap-2">
            <span>ตัวกรองการค้นหา</span>
            {activeCount > 0 ? (
              <span className="rounded-full bg-ink px-1.5 py-0.2 text-[11px] font-mono text-surface">
                {activeCount}
              </span>
            ) : null}
          </span>
          <span className="text-ink-3">{filtersOpen ? "▲ ซ่อน" : "▼ แสดง"}</span>
        </button>
        {filtersOpen ? <div className="mt-3">{rail}</div> : null}
      </div>

      {/* Desktop Sticky Rail */}
      <aside className="hidden lg:block">
        <div className="sticky top-[76px] max-h-[calc(100vh-90px)] overflow-y-auto overscroll-contain pr-1.5 [scrollbar-width:thin] [scrollbar-color:var(--line)_transparent]">
          {rail}
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <svg
              viewBox="0 0 16 16"
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3"
              aria-hidden="true"
            >
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
              <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาชื่อโครงการ หน่วยงาน หรือเทคโนโลยี เช่น Windows Server, Cloud"
              className={`${input} pl-8`}
              aria-label="ค้นหาประกาศ"
            />
          </div>
          <label className="flex items-center gap-2 whitespace-nowrap">
            <Label>เรียงตาม</Label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className={`${input} w-auto pr-6`}
            >
              {SORTS.filter((option) =>
                authStatus === "authenticated"
                  ? true
                  : option.id !== "match-desc" && option.id !== "match-asc"
              ).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label.th}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="mb-2 min-h-[16px] tnum text-[12.5px] text-ink-3" aria-live="polite">
          {countLine}
        </p>

        {renderResults()}
      </div>
    </div>
  );
}
