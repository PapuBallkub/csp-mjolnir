"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { pick } from "../../../_data/tors";
import {
  listTors,
  torFacets,
  type ApiError,
  type ApiResult,
  type TorFacets,
  type TorListParams,
  type TorStatus,
} from "../../../_lib/api";
import { matchFor } from "../../../_lib/match";
import { useAuth } from "../../../_components/auth";
import { useLang, useProfile } from "../../../_components/prefs";
import { CatalogRow, CatalogRowSkeleton } from "../../../_components/catalog-row";
import { DEFAULT_STATUSES, STATUSES, showsEveryStatus, statusChanges } from "../../../_lib/catalog";
import { btn, EmptyState, input, Label } from "../../../_components/ui";
import {
  BUDGET_BANDS,
  DEADLINE_BANDS,
  MATCH_LIMIT,
  PAGE_SIZE,
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

export function FilterModeView() {
  const { lang } = useLang();
  const { profile } = useProfile();
  const { status: authStatus } = useAuth();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(() => parseFilterParams(searchParams).query);
  const [statuses, setStatuses] = useState<TorStatus[]>(() => parseFilterParams(searchParams).statuses);
  const [amendedOnly, setAmendedOnly] = useState(() => parseFilterParams(searchParams).amendedOnly);
  const [techFilter, setTechFilter] = useState<string[]>(() => parseFilterParams(searchParams).techFilter);
  const [agencyFilter, setAgencyFilter] = useState<string[]>(() => parseFilterParams(searchParams).agencyFilter);
  const [budgetBand, setBudgetBand] = useState(() => parseFilterParams(searchParams).budgetBand);
  const [deadlineBand, setDeadlineBand] = useState(() => parseFilterParams(searchParams).deadlineBand);
  const [hideHighRisk, setHideHighRisk] = useState(() => parseFilterParams(searchParams).hideHighRisk);
  const [rawSort, setSort] = useState<Sort>(() => parseFilterParams(searchParams).sort);
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
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const debouncedQuery = useDebounced(query, 300);

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
      limit: sort === "match-desc" || sort === "match-asc" ? MATCH_LIMIT : PAGE_SIZE,
    };
  }, [debouncedQuery, statuses, amendedOnly, techFilter, agencyFilter, budgetBand, deadlineBand, hideHighRisk, sort]);
  const key = useMemo(() => JSON.stringify(params), [params]);

  const [wanted, setWanted] = useState({ key: "", page: 1 });
  const page = wanted.key === key ? wanted.page : 1;

  const [list, setList] = useState<Page | null>(null);
  const [listError, setListError] = useState<{ key: string; page: number; error: ApiError } | null>(null);
  const [listTry, setListTry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listTors({ ...params, page }).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setListError({ key, page, error: result.error });
        return;
      }
      setListError(null);
      const { tors, total, pages } = result.data;
      setList((prev) => ({
        key,
        page,
        total,
        pages,
        at: new Date(),
        tors: page > 1 && prev?.key === key ? [...prev.tors, ...tors] : tors,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [params, key, page, listTry]);

  const current = list?.key === key ? list : null;
  const failed = listError?.key === key && listError.page === page ? listError.error : null;
  const loadingMore = current !== null && current.page < page && !failed;

  const canMatch = authStatus === "authenticated";

  /* ------------------------------- results -------------------------------- */

  const skeleton = (
    <div aria-busy="true">
      <span className="sr-only">{lang === "th" ? "กำลังโหลดประกาศ" : "Loading postings"}</span>
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 5 }, (_, i) => (
          <CatalogRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );

  function renderResults() {
    if (failed && !current) {
      return (
        <EmptyState
          headline={lang === "th" ? "โหลดรายการประกาศไม่สำเร็จ" : "Couldn't load the postings"}
          body={failureText(failed, lang)}
          action={
            <button type="button" onClick={() => setListTry((n) => n + 1)} className={btn.secondary}>
              {lang === "th" ? "ลองอีกครั้ง" : "Try again"}
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
            headline={lang === "th" ? "ตอนนี้ไม่มีประกาศที่ยังยื่นได้" : "Nothing open or coming up right now"}
            body={
              lang === "th"
                ? "หน้านี้เริ่มต้นแสดงเฉพาะร่างประกาศและประกาศเชิญชวนที่ยังเปิดรับข้อเสนอ โครงการที่ปิดรับแล้ว ได้ผู้ชนะแล้ว หรือยกเลิก ดูได้จากตัวกรองสถานะ"
                : "The catalog starts with drafts and invitations still taking bids. Closed, awarded and cancelled projects are under Status."
            }
            action={
              <button type="button" onClick={() => setStatuses(STATUSES)} className={btn.secondary}>
                {lang === "th" ? "แสดงทุกสถานะ" : "Show every status"}
              </button>
            }
          />
        );
      }
      return !searched && otherFilters === 0 && showsEveryStatus(statuses) ? (
        <EmptyState
          headline={lang === "th" ? "ยังไม่มีประกาศในระบบ" : "No postings yet"}
          body={
            lang === "th"
              ? "ยังไม่มีประกาศที่สรุปเสร็จและพร้อมเผยแพร่ ลองกลับมาใหม่ภายหลัง ระหว่างนี้ประกาศต้นฉบับทั้งหมดยังอยู่ที่ e-GP"
              : "No posting has been summarised and cleared for publishing yet. Check back later; every original is still on e-GP."
          }
        />
      ) : (
        <EmptyState
          headline={lang === "th" ? "ไม่มีประกาศที่ตรงกับเงื่อนไขนี้" : "Nothing matches these filters"}
          body={
            lang === "th"
              ? "ลองค้นด้วยคำที่สั้นลง ขยายช่วงราคากลางหรือกำหนดยื่น หรือเอาตัวกรองบางข้อออก"
              : "Try a shorter search, a wider price or deadline range, or drop a filter or two."
          }
          action={
            <button type="button" onClick={clearAll} className={btn.secondary}>
              {lang === "th" ? "ล้างตัวกรองทั้งหมด" : "Clear all filters"}
            </button>
          }
        />
      );
    }

    const remaining = shown.total - shown.tors.length;
    let displayedTors = shown.tors;
    if (sort === "match-desc") {
      displayedTors = [...shown.tors].sort((a, b) => matchFor(b, profile).score - matchFor(a, profile).score);
    } else if (sort === "match-asc") {
      displayedTors = [...shown.tors].sort((a, b) => matchFor(a, profile).score - matchFor(b, profile).score);
    }

    return (
      <>
        <div aria-busy={!current}>
          <div className={`flex flex-col gap-2.5 transition-opacity ${current ? "" : "opacity-60"}`}>
            {displayedTors.map((tor) => {
              const match =
                canMatch || sort === "match-desc" || sort === "match-asc"
                  ? matchFor(tor, profile)
                  : undefined;
              return <CatalogRow key={tor.projectId} tor={tor} now={shown.at} match={match} />;
            })}
          </div>
        </div>

        {current && failed ? (
          <p className="mt-3 text-center text-[12.5px] leading-thai text-ink-2">
            {failureText(failed, lang)}{" "}
            <button
              type="button"
              onClick={() => setListTry((n) => n + 1)}
              className="underline underline-offset-2 hover:text-ink"
            >
              {lang === "th" ? "ลองอีกครั้ง" : "Try again"}
            </button>
          </p>
        ) : current && current.page < current.pages ? (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => setWanted({ key, page: current.page + 1 })}
              disabled={loadingMore}
              className={btn.secondary}
            >
              {loadingMore
                ? lang === "th" ? "กำลังโหลด…" : "Loading…"
                : lang === "th"
                  ? `แสดงเพิ่มอีก ${Math.min(PAGE_SIZE, remaining)} ประกาศ`
                  : `Show ${Math.min(PAGE_SIZE, remaining)} more`}
            </button>
          </div>
        ) : null}
      </>
    );
  }

  const rail = (
    <FilterRail
      lang={lang}
      statuses={statuses}
      setStatuses={setStatuses}
      amendedOnly={amendedOnly}
      setAmendedOnly={setAmendedOnly}
      hideHighRisk={hideHighRisk}
      setHideHighRisk={setHideHighRisk}
      budgetBand={budgetBand}
      setBudgetBand={setBudgetBand}
      deadlineBand={deadlineBand}
      setDeadlineBand={setDeadlineBand}
      techFilter={techFilter}
      setTechFilter={setTechFilter}
      agencyFilter={agencyFilter}
      setAgencyFilter={setAgencyFilter}
      activeCount={activeCount}
      clearAll={clearAll}
      facets={facets}
      onRetryFacets={() => setFacetsTry((n) => n + 1)}
    />
  );

  const countLine = current
    ? lang === "th"
      ? `แสดง ${current.tors.length} จาก ${current.total} ประกาศ`
      : `Showing ${current.tors.length} of ${current.total} postings`
    : null;

  return (
    <div className="grid gap-5 lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* Mobile Drawer Trigger */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setFiltersOpen(!filtersOpen)}
          aria-expanded={filtersOpen}
          className={`${btn.secondary} w-full justify-between`}
        >
          <span>
            {`${lang === "th" ? "ตัวกรอง" : "Filters"}${activeCount > 0 ? ` (${activeCount})` : ""}`}
          </span>
          <span className="font-mono text-[11px] text-ink-3">{filtersOpen ? "−" : "+"}</span>
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
              placeholder={
                lang === "th"
                  ? "ค้นหาชื่อโครงการ หน่วยงาน หรือเทคโนโลยี เช่น Windows Server"
                  : "Search a title, agency or technology, e.g. Windows Server"
              }
              className={`${input} pl-8`}
              aria-label={lang === "th" ? "ค้นหาประกาศ" : "Search postings"}
            />
          </div>
          <label className="flex items-center gap-2 whitespace-nowrap">
            <Label>{lang === "th" ? "เรียงตาม" : "Sort"}</Label>
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
                  {pick(option.label, lang)}
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
