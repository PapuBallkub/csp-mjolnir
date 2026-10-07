"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatTHB, pick, type Bi, type Lang } from "../../_data/tors";
import {
  listTors,
  torFacets,
  type ApiError,
  type ApiResult,
  type TorFacets,
  type TorInsightSummary,
  type TorListParams,
  type TorStatus,
} from "../../_lib/api";
import { matchFor } from "../../_lib/match";
import { useAuth } from "../../_components/auth";
import { useLang, useProfile } from "../../_components/prefs";
import { CatalogRow, CatalogRowSkeleton } from "../../_components/catalog-row";
import { formatThaiDate } from "../../_components/deadline";
import { isDead, lifecycleLabel, RiskMeter } from "../../_components/verdict";
import {
  btn,
  Chip,
  EmptyState,
  input,
  Label,
  Panel,
  SectionHeading,
} from "../../_components/ui";

/**
 * Browse (FR-10, FR-11, FR-13). One list, two ways of narrowing it: filters
 * the user drives by hand, or the ranking their profile implies. The catalog
 * is public; ranking needs a signed-in profile, and says so rather than hiding.
 *
 * Filtering, sorting and paging happen in the API, so the page holds up when
 * the catalog is thousands of TORs rather than a few dozen.
 */
type Mode = "filter" | "match";
type Sort = NonNullable<TorListParams["sort"]>;

const PAGE_SIZE = 20;
/** Matched mode ranks at most this many TORs that use one of the user's skills */
const MATCH_LIMIT = 100;

const BUDGET_BANDS: { id: string; label: Bi; min?: number; max?: number }[] = [
  { id: "any", label: { th: "ทุกช่วง", en: "Any" } },
  { id: "u1", label: { th: "ต่ำกว่า 1 ล้าน", en: "Under ฿1M" }, max: 1_000_000 },
  { id: "1-5", label: { th: "1–5 ล้าน", en: "฿1M–5M" }, min: 1_000_000, max: 5_000_000 },
  { id: "5-20", label: { th: "5–20 ล้าน", en: "฿5M–20M" }, min: 5_000_000, max: 20_000_000 },
  { id: "20+", label: { th: "เกิน 20 ล้าน", en: "Over ฿20M" }, min: 20_000_000 },
];

const DEADLINE_BANDS: { id: string; label: Bi; days?: number }[] = [
  { id: "any", label: { th: "ไม่จำกัด", en: "Any" } },
  { id: "7", label: { th: "ปิดรับภายใน 7 วัน", en: "Closing within 7 days" }, days: 7 },
  { id: "14", label: { th: "ปิดรับภายใน 14 วัน", en: "Closing within 14 days" }, days: 14 },
  { id: "30", label: { th: "ปิดรับภายใน 30 วัน", en: "Closing within 30 days" }, days: 30 },
];

const STATUSES: TorStatus[] = ["Draft", "Open", "Awarded", "Closed", "Cancelled"];

const SORTS: { id: Sort; label: Bi }[] = [
  { id: "newest", label: { th: "ประกาศล่าสุด", en: "Newest" } },
  { id: "deadline", label: { th: "ใกล้ปิดรับที่สุด", en: "Closing soonest" } },
  { id: "budget-desc", label: { th: "ราคากลางสูงสุด", en: "Highest price" } },
  { id: "budget-asc", label: { th: "ราคากลางต่ำสุด", en: "Lowest price" } },
];

const SCORE_FLOORS = [
  { id: 0, label: { th: "ทุกคะแนน", en: "Any score" } },
  { id: 50, label: { th: "50 ขึ้นไป", en: "50 and up" } },
  { id: 70, label: { th: "70 ขึ้นไป — ตรงจริง", en: "70+ — real fits" } },
  { id: 85, label: { th: "85 ขึ้นไป — ตรงมาก", en: "85+ — strong fits" } },
] as const;

const HIGH_RISK = 70;
const isHighRisk = (tor: TorInsightSummary) => (tor.analytics.lockSpec?.riskScore ?? 0) >= HIGH_RISK;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Waits for typing to pause, so a search box doesn't send a request per keystroke. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

/** "1 ต.ค. 2569 14:05", in Thai time */
function formatUpdated(iso: string, lang: Lang): string {
  const bangkok = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  const time = bangkok.toISOString().slice(11, 16);
  return `${formatThaiDate(iso, lang)} ${time}`;
}

function failureText(error: ApiError, lang: Lang): string {
  if (error.status === 0) {
    return lang === "th"
      ? "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองอีกครั้งในอีกสักครู่"
      : "We couldn't reach the server. Try again in a moment.";
  }
  return lang === "th"
    ? `เซิร์ฟเวอร์ตอบกลับผิดพลาด (${error.status}) ลองอีกครั้งในอีกสักครู่`
    : `The server returned an error (${error.status}). Try again in a moment.`;
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-line px-3 py-3.5 last:border-b-0">
      <h3 className="mb-2.5 text-[12px] font-semibold text-ink">{title}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
  count,
  trailing,
  title,
}: {
  checked: boolean;
  onChange: () => void;
  label: ReactNode;
  count?: number;
  trailing?: ReactNode;
  title?: string;
}) {
  return (
    <label
      className="flex cursor-pointer items-center gap-2 text-[13px] leading-thai text-ink-2 hover:text-ink"
      title={title}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 shrink-0 accent-ink"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
      {count !== undefined ? (
        <span className="font-mono tnum text-[11px] text-ink-3">{count}</span>
      ) : null}
    </label>
  );
}

function Radio({
  checked,
  onChange,
  label,
  name,
}: {
  checked: boolean;
  onChange: () => void;
  label: ReactNode;
  name: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2 hover:text-ink">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 shrink-0 accent-ink"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </label>
  );
}

/** A filter group whose options come from the API: loading and failure said in place. */
function FacetList({
  facets,
  onRetry,
  lang,
  children,
}: {
  facets: ApiResult<TorFacets> | null;
  onRetry: () => void;
  lang: Lang;
  children: (data: TorFacets) => ReactNode;
}) {
  if (!facets) {
    return (
      <div className="flex animate-pulse flex-col gap-2.5 py-0.5" aria-hidden="true">
        <div className="h-3 w-4/5 rounded-[2px] bg-surface-3" />
        <div className="h-3 w-3/5 rounded-[2px] bg-surface-3" />
        <div className="h-3 w-2/3 rounded-[2px] bg-surface-3" />
      </div>
    );
  }
  if (!facets.ok) {
    return (
      <p className="text-[12px] leading-thai text-ink-3">
        {lang === "th" ? "โหลดตัวเลือกไม่สำเร็จ " : "Couldn't load the options. "}
        <button type="button" onClick={onRetry} className="underline underline-offset-2 hover:text-ink">
          {lang === "th" ? "ลองอีกครั้ง" : "Try again"}
        </button>
      </p>
    );
  }
  return <>{children(facets.data)}</>;
}

type Page = {
  key: string;
  page: number;
  tors: TorInsightSummary[];
  total: number;
  pages: number;
  /** When it arrived: the "now" the API used to decide what is Closed */
  at: Date;
};

export default function BrowsePage() {
  const { lang } = useLang();
  const { profile } = useProfile();
  const { status: authStatus } = useAuth();

  const [mode, setMode] = useState<Mode>("filter");
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<TorStatus[]>([]);
  const [amendedOnly, setAmendedOnly] = useState(false);
  const [techFilter, setTechFilter] = useState<string[]>([]);
  const [agencyFilter, setAgencyFilter] = useState<string[]>([]);
  const [budgetBand, setBudgetBand] = useState("any");
  const [deadlineBand, setDeadlineBand] = useState("any");
  const [hideHighRisk, setHideHighRisk] = useState(false);
  const [sort, setSort] = useState<Sort>("newest");
  const [scoreFloor, setScoreFloor] = useState<number>(0);
  const [hideClosed, setHideClosed] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const debouncedQuery = useDebounced(query, 300);

  const activeCount =
    statuses.length +
    (amendedOnly ? 1 : 0) +
    techFilter.length +
    agencyFilter.length +
    (budgetBand === "any" ? 0 : 1) +
    (deadlineBand === "any" ? 0 : 1) +
    (hideHighRisk ? 1 : 0);

  function clearAll() {
    setQuery("");
    setStatuses([]);
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
      limit: PAGE_SIZE,
    };
  }, [debouncedQuery, statuses, amendedOnly, techFilter, agencyFilter, budgetBand, deadlineBand, hideHighRisk, sort]);
  const key = useMemo(() => JSON.stringify(params), [params]);

  // Any change of filters starts again from page 1, without an effect to reset it
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

  /* ------------------------------- matching ------------------------------- */

  const skillsKey = profile.skills.join("\n");
  const canMatch = authStatus === "authenticated" && profile.skills.length > 0;
  const [matchList, setMatchList] = useState<{ key: string; result: ApiResult<Page> } | null>(null);
  const [matchTry, setMatchTry] = useState(0);

  useEffect(() => {
    if (!canMatch) return;
    let cancelled = false;
    // Only TORs that use at least one of the skills can rank anywhere useful
    listTors({ tech: skillsKey.split("\n"), sort: "deadline", limit: MATCH_LIMIT }).then((result) => {
      if (cancelled) return;
      setMatchList({
        key: skillsKey,
        result: result.ok
          ? { ok: true, data: { key: skillsKey, ...result.data, at: new Date() } }
          : result,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [canMatch, skillsKey, matchTry]);

  const matchResult = matchList?.key === skillsKey ? matchList.result : null;
  const ranked = useMemo(() => {
    if (!matchResult?.ok) return [];
    return matchResult.data.tors
      .map((tor) => ({ tor, match: matchFor(tor, profile) }))
      .sort((a, b) => b.match.score - a.match.score);
  }, [matchResult, profile]);

  const strongCount = ranked.filter((row) => row.match.score >= 70 && !isDead(row.tor.identification.status)).length;
  const matchResults = ranked
    .filter((row) => row.match.score >= scoreFloor)
    .filter((row) => (hideClosed ? !isDead(row.tor.identification.status) : true))
    .filter((row) => (hideHighRisk ? !isHighRisk(row.tor) : true));

  /* -------------------------------- rails --------------------------------- */

  const filterRail = (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3 py-2.5">
        <h2 className="text-[12px] font-semibold text-ink">
          {lang === "th" ? "ตัวกรอง" : "Filters"}
        </h2>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] text-ink-2 underline underline-offset-2 hover:text-ink"
          >
            {lang === "th" ? `ล้างทั้งหมด (${activeCount})` : `Clear all (${activeCount})`}
          </button>
        ) : null}
      </div>

      <FilterGroup title={lang === "th" ? "สถานะ" : "Status"}>
        {STATUSES.map((status) => (
          <Check
            key={status}
            checked={statuses.includes(status)}
            onChange={() => setStatuses(toggle(statuses, status))}
            label={lifecycleLabel(status, lang)}
            count={facets?.ok ? facets.data.statuses[status] : undefined}
          />
        ))}
        <div className="mt-0.5 border-t border-line pt-2.5">
          <Check
            checked={amendedOnly}
            onChange={() => setAmendedOnly(!amendedOnly)}
            label={lang === "th" ? "เฉพาะที่มีเอกสารแก้ไข" : "Amended only"}
            count={facets?.ok ? facets.data.amended : undefined}
          />
        </div>
      </FilterGroup>

      <FilterGroup title={lang === "th" ? "คัดกรองความเสี่ยง" : "Risk"}>
        <Check
          checked={hideHighRisk}
          onChange={() => setHideHighRisk(!hideHighRisk)}
          label={lang === "th" ? "ซ่อนงานเสี่ยงล็อกสเปกสูง" : "Hide high lock-spec risk"}
          trailing={<RiskMeter level="high" />}
        />
      </FilterGroup>

      <FilterGroup title={lang === "th" ? "ราคากลาง" : "Reference price"}>
        {BUDGET_BANDS.map((b) => (
          <Radio
            key={b.id}
            name="budget"
            checked={budgetBand === b.id}
            onChange={() => setBudgetBand(b.id)}
            label={pick(b.label, lang)}
          />
        ))}
      </FilterGroup>

      <FilterGroup title={lang === "th" ? "กำหนดยื่นข้อเสนอ" : "Deadline"}>
        {DEADLINE_BANDS.map((b) => (
          <Radio
            key={b.id}
            name="deadline"
            checked={deadlineBand === b.id}
            onChange={() => setDeadlineBand(b.id)}
            label={pick(b.label, lang)}
          />
        ))}
      </FilterGroup>

      <FilterGroup title={lang === "th" ? "เทคโนโลยี" : "Tech stack"}>
        <FacetList facets={facets} onRetry={() => setFacetsTry((n) => n + 1)} lang={lang}>
          {(data) =>
            data.technologies.length === 0 ? (
              <p className="text-[12px] text-ink-3">{lang === "th" ? "ยังไม่มีข้อมูล" : "None yet"}</p>
            ) : (
              <div className="-mr-1 flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
                {data.technologies.map((term) => (
                  <Check
                    key={term.name}
                    checked={techFilter.includes(term.name)}
                    onChange={() => setTechFilter(toggle(techFilter, term.name))}
                    label={<span className="font-mono text-[12px]">{term.name}</span>}
                    count={term.count}
                  />
                ))}
              </div>
            )
          }
        </FacetList>
      </FilterGroup>

      <FilterGroup title={lang === "th" ? "หน่วยงาน" : "Agency"}>
        <FacetList facets={facets} onRetry={() => setFacetsTry((n) => n + 1)} lang={lang}>
          {(data) =>
            data.agencies.length === 0 ? (
              <p className="text-[12px] text-ink-3">{lang === "th" ? "ยังไม่มีข้อมูล" : "None yet"}</p>
            ) : (
              <div className="-mr-1 flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
                {data.agencies.map((agency) => (
                  <Check
                    key={agency.name}
                    checked={agencyFilter.includes(agency.name)}
                    onChange={() => setAgencyFilter(toggle(agencyFilter, agency.name))}
                    label={agency.name}
                    title={agency.name}
                    count={agency.count}
                  />
                ))}
              </div>
            )
          }
        </FacetList>
      </FilterGroup>
    </Panel>
  );

  const matchRail = (
    <div className="flex flex-col gap-4">
      <Panel className="overflow-hidden">
        <div className="border-b border-line bg-surface-2 px-3 py-2.5">
          <h2 className="text-[12px] font-semibold text-ink">
            {lang === "th" ? "จับคู่จากโปรไฟล์ของคุณ" : "Ranked from your profile"}
          </h2>
        </div>

        <div className="flex flex-col gap-3.5 px-3 py-3.5">
          <div>
            <Label>{lang === "th" ? "ทักษะ" : "Skills"}</Label>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {profile.skills.length === 0 ? (
                <span className="text-[12px] text-ink-3">
                  {lang === "th" ? "ยังไม่ได้เลือก" : "None selected"}
                </span>
              ) : (
                profile.skills.map((skill) => <Chip key={skill}>{skill}</Chip>)
              )}
            </div>
          </div>

          <div className="border-t border-line pt-3">
            <Label>{lang === "th" ? "ช่วงงบที่รับได้" : "Budget range"}</Label>
            <p className="mt-1 font-mono tnum text-[12px] text-ink">
              {formatTHB(profile.budgetMin)} – {formatTHB(profile.budgetMax)}
            </p>
          </div>

          <Link href="/profile" className={`${btn.secondary} w-full`}>
            {lang === "th" ? "แก้ไขโปรไฟล์" : "Edit your profile"}
          </Link>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="border-b border-line bg-surface-2 px-3 py-2.5">
          <h2 className="text-[12px] font-semibold text-ink">
            {lang === "th" ? "ปรับผลลัพธ์" : "Refine"}
          </h2>
        </div>
        <FilterGroup title={lang === "th" ? "คะแนนขั้นต่ำ" : "Minimum score"}>
          {SCORE_FLOORS.map((floor) => (
            <Radio
              key={floor.id}
              name="floor"
              checked={scoreFloor === floor.id}
              onChange={() => setScoreFloor(floor.id)}
              label={pick(floor.label, lang)}
            />
          ))}
        </FilterGroup>
        <FilterGroup title={lang === "th" ? "ซ่อน" : "Hide"}>
          <Check
            checked={hideClosed}
            onChange={() => setHideClosed(!hideClosed)}
            label={lang === "th" ? "งานที่ปิดรับแล้ว" : "Projects already closed"}
          />
          <Check
            checked={hideHighRisk}
            onChange={() => setHideHighRisk(!hideHighRisk)}
            label={lang === "th" ? "งานเสี่ยงล็อกสเปกสูง" : "High lock-spec risk"}
            trailing={<RiskMeter level="high" />}
          />
        </FilterGroup>
      </Panel>
    </div>
  );

  /* ------------------------------- results -------------------------------- */

  const skeleton = (
    <div aria-busy="true">
      <span className="sr-only">{lang === "th" ? "กำลังโหลดประกาศ" : "Loading postings"}</span>
      <div className="flex flex-col gap-3.5">
        {Array.from({ length: 5 }, (_, i) => (
          <CatalogRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );

  function filterResults() {
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

    // First load: shaped skeletons. A filter change keeps the old rows, dimmed.
    const shown = current ?? list;
    if (!shown) return skeleton;

    if (current && current.total === 0) {
      return activeCount === 0 && !debouncedQuery.trim() ? (
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
    return (
      <>
        <div aria-busy={!current}>
          <div className={`flex flex-col gap-3.5 transition-opacity ${current ? "" : "opacity-60"}`}>
            {shown.tors.map((tor) => (
              <CatalogRow key={tor.projectId} tor={tor} now={shown.at} />
            ))}
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

  function matchResultsView() {
    if (authStatus === "loading") return skeleton;

    if (profile.skills.length === 0) {
      return (
        <EmptyState
          headline={
            lang === "th"
              ? "ยังจับคู่ไม่ได้ เพราะโปรไฟล์ยังไม่มีทักษะ"
              : "We can't rank anything until your profile lists some skills"
          }
          body={
            lang === "th"
              ? "เลือกเทคโนโลยีที่คุณทำได้ในหน้าโปรไฟล์ แล้วรายการนี้จะเรียงใหม่ให้ทันที"
              : "Pick the technologies you can build with on your profile and this list re-ranks immediately."
          }
          action={
            <Link href="/profile" className={btn.secondary}>
              {lang === "th" ? "ไปตั้งค่าโปรไฟล์" : "Set up your profile"}
            </Link>
          }
        />
      );
    }

    if (!matchResult) return skeleton;

    if (!matchResult.ok) {
      return (
        <EmptyState
          headline={lang === "th" ? "จัดอันดับไม่สำเร็จ" : "Couldn't rank the postings"}
          body={failureText(matchResult.error, lang)}
          action={
            <button type="button" onClick={() => setMatchTry((n) => n + 1)} className={btn.secondary}>
              {lang === "th" ? "ลองอีกครั้ง" : "Try again"}
            </button>
          }
        />
      );
    }

    if (matchResult.data.total === 0) {
      return (
        <EmptyState
          headline={
            lang === "th"
              ? "ยังไม่มีประกาศที่ใช้ทักษะในโปรไฟล์ของคุณ"
              : "No posting uses the skills on your profile yet"
          }
          body={
            lang === "th"
              ? "ประกาศที่มีอยู่ตอนนี้ไม่ได้ระบุเทคโนโลยีที่คุณเลือกไว้ ลองเพิ่มทักษะในโปรไฟล์ หรือค้นหาเองจากทุกประกาศ"
              : "None of the current postings name a technology you picked. Add skills to your profile, or search every posting yourself."
          }
          action={
            <button type="button" onClick={() => setMode("filter")} className={btn.secondary}>
              {lang === "th" ? "ค้นหาเองจากทุกประกาศ" : "Search every posting"}
            </button>
          }
        />
      );
    }

    if (matchResults.length === 0) {
      return (
        <EmptyState
          headline={lang === "th" ? "ไม่มีประกาศที่ผ่านเงื่อนไขนี้" : "Nothing passes these settings"}
          body={
            lang === "th"
              ? "ลองลดคะแนนขั้นต่ำ แสดงงานที่ปิดรับแล้ว หรือเอาตัวกรองความเสี่ยงออก"
              : "Try a lower score floor, showing closed projects, or dropping the risk filter."
          }
          action={
            <button type="button" onClick={() => setScoreFloor(0)} className={btn.secondary}>
              {lang === "th" ? "แสดงทุกคะแนน" : "Show every score"}
            </button>
          }
        />
      );
    }

    return (
      <div className="flex flex-col gap-3.5">
        {matchResults.map(({ tor, match }) => (
          <CatalogRow key={tor.projectId} tor={tor} now={matchResult.data.at} match={match} />
        ))}
      </div>
    );
  }

  /* -------------------------------- layout -------------------------------- */

  // Signed out, matching is explained instead of shown (AGENTS.md §3)
  const signedOutMatch = mode === "match" && authStatus === "anonymous";
  const rail = mode === "filter" ? filterRail : matchRail;

  const MODES: { id: Mode; label: Bi; badge?: number }[] = [
    { id: "filter", label: { th: "ค้นหาและกรอง", en: "Search & filter" } },
    {
      id: "match",
      label: { th: "ตรงกับโปรไฟล์ฉัน", en: "Matched to me" },
      badge: matchResult?.ok ? strongCount : undefined,
    },
  ];

  let countLine: string | null = null;
  if (mode === "filter" && current) {
    countLine =
      lang === "th"
        ? `แสดง ${current.tors.length} จาก ${current.total} ประกาศ`
        : `${current.tors.length} of ${current.total} postings`;
  } else if (mode === "filter" && list) {
    countLine = lang === "th" ? "กำลังค้นหา…" : "Searching…";
  } else if (mode === "match" && matchResult?.ok && matchResults.length > 0) {
    const { tors, total } = matchResult.data;
    countLine =
      lang === "th"
        ? `แสดง ${matchResults.length} จาก ${tors.length} ประกาศที่ใช้ทักษะของคุณ${total > tors.length ? ` (จัดอันดับ ${tors.length} รายการที่ใกล้ปิดรับที่สุดจากทั้งหมด ${total})` : ""}`
        : `${matchResults.length} of ${tors.length} postings that use your skills${total > tors.length ? ` (the ${tors.length} closing soonest, of ${total})` : ""}`;
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6">
      <header className="mb-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">
              {lang === "th" ? "ประกาศจัดซื้อจัดจ้างไอทีภาครัฐ" : "Thai government IT procurement"}
            </h1>
            <p className="mt-1 max-w-2xl text-[14px] leading-thai text-ink-2">
              {lang === "th"
                ? "สรุปสาระสำคัญจากเอกสาร TOR ของหน่วยงานรัฐทั่วประเทศ อ่านจบได้โดยไม่ต้องเปิดไฟล์ PDF"
                : "Plain-language summaries of TOR documents from government agencies across Thailand. Read them without opening the PDF."}
            </p>
          </div>
          {facets?.ok ? (
            <p className="font-mono text-[11px] text-ink-3">
              {facets.data.total} {lang === "th" ? "ประกาศ" : "postings"}
              {facets.data.lastUpdated ? (
                <>
                  {" · "}
                  {lang === "th" ? "อัปเดตล่าสุด" : "updated"} {formatUpdated(facets.data.lastUpdated, lang)}
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        {/* The one decision this page asks for, made explicit. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div
            className="inline-flex rounded-[3px] border border-line bg-surface-2 p-[3px]"
            role="group"
            aria-label={lang === "th" ? "วิธีเลือกดูประกาศ" : "How to narrow the list"}
          >
            {MODES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setMode(option.id)}
                aria-pressed={mode === option.id}
                className={`flex items-center justify-center gap-2 rounded-[2px] px-3 py-1.5 text-[13px] font-medium transition-all duration-150 ${
                  option.id === "filter" ? "min-w-[110px]" : "min-w-[165px]"
                } ${
                  mode === option.id
                    ? "bg-surface text-ink shadow-sm"
                    : "text-ink-3 hover:text-ink"
                }`}
              >
                <span>{pick(option.label, lang)}</span>
                {option.badge !== undefined ? (
                  <span
                    className={`rounded-[2px] px-1 font-mono tnum text-[11px] ${
                      mode === option.id ? "bg-open-bg text-open" : "bg-surface-3 text-ink-3"
                    }`}
                  >
                    {option.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <p className="text-[12px] leading-thai text-ink-3">
            {mode === "filter"
              ? lang === "th"
                ? "กรองเองตามเทคโนโลยี ราคากลาง กำหนดยื่น และหน่วยงาน"
                : "Narrow it yourself by technology, price, deadline and agency."
              : lang === "th"
                ? "เรียงจากทักษะและช่วงงบที่คุณบันทึกไว้ในโปรไฟล์"
                : "Ranked from the skills and budget range saved on your profile."}
          </p>
        </div>
      </header>

      {signedOutMatch ? (
        <EmptyState
          headline={
            lang === "th"
              ? "ลงชื่อเข้าใช้ แล้วระบบจะจัดอันดับประกาศตามทักษะของคุณ"
              : "Sign in and we'll rank postings by your skills"
          }
          body={
            lang === "th"
              ? "บันทึกเทคโนโลยีที่คุณทำได้และช่วงงบที่รับไหวไว้ในโปรไฟล์ แล้วประกาศที่ตรงกับคุณที่สุดจะขึ้นมาก่อน ส่วนการค้นหาและอ่านประกาศทุกรายการไม่ต้องลงชื่อเข้าใช้"
              : "Save the technologies you build with and the budget you can take on, and the postings that fit you best come first. Searching and reading every posting needs no account."
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/auth" className={btn.primary}>
                {lang === "th" ? "ลงชื่อเข้าใช้" : "Sign in"}
              </Link>
              <button type="button" onClick={() => setMode("filter")} className={btn.secondary}>
                {lang === "th" ? "ค้นหาเองแทน" : "Search by hand instead"}
              </button>
            </div>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[248px_minmax(0,1fr)]">
          <div className="lg:hidden">
            <button
              type="button"
              onClick={() => setFiltersOpen(!filtersOpen)}
              aria-expanded={filtersOpen}
              className={`${btn.secondary} w-full justify-between`}
            >
              <span>
                {mode === "filter"
                  ? `${lang === "th" ? "ตัวกรอง" : "Filters"}${activeCount > 0 ? ` (${activeCount})` : ""}`
                  : lang === "th"
                    ? "โปรไฟล์และการปรับผลลัพธ์"
                    : "Profile and refinements"}
              </span>
              <span className="font-mono text-[11px] text-ink-3">{filtersOpen ? "−" : "+"}</span>
            </button>
            {filtersOpen ? <div className="mt-3">{rail}</div> : null}
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-[76px] max-h-[calc(100vh-90px)] overflow-y-auto overscroll-contain pr-1.5 [scrollbar-width:thin] [scrollbar-color:var(--line)_transparent]">
              {rail}
            </div>
          </aside>

          <div className="min-w-0">
            {mode === "filter" ? (
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
                    {SORTS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {pick(option.label, lang)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <div className="mb-3">
                <SectionHeading
                  sub={
                    lang === "th"
                      ? "คะแนนคิดจากเทคโนโลยีที่ตรงกับทักษะของคุณ (70) และราคากลางที่อยู่ในช่วงงบที่คุณรับได้ (30) เครื่องหมาย ✓ คือเทคโนโลยีที่คุณมีแล้ว"
                      : "Scored on technologies that match your skills (70) and a price inside your budget range (30). A ✓ marks a technology you already have."
                  }
                >
                  {matchResult?.ok
                    ? lang === "th"
                      ? `ตรงกับคุณมาก ${strongCount} งาน`
                      : `${strongCount} strong matches for you`
                    : lang === "th"
                      ? "งานที่ตรงกับคุณ"
                      : "Postings that fit you"}
                </SectionHeading>
              </div>
            )}

            <p className="mb-2 min-h-[16px] font-mono text-[11px] text-ink-3" aria-live="polite">
              {countLine}
            </p>

            {mode === "filter" ? filterResults() : matchResultsView()}
          </div>
        </div>
      )}
    </div>
  );
}
