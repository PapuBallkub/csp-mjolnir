"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  agencies,
  daysUntil,
  formatDate,
  pick,
  techTerms,
  tors,
  TODAY,
  type ScopeSize,
  type Status,
} from "../../_data/tors";
import { useLang } from "../../_components/prefs";
import { TorRow } from "../../_components/tor-row";
import { RiskMeter } from "../../_components/verdict";
import { btn, EmptyState, input, Panel } from "../../_components/ui";

const BUDGET_BANDS = [
  { id: "any", label: { th: "ทุกช่วง", en: "Any" }, min: 0, max: Infinity },
  { id: "u1", label: { th: "ต่ำกว่า 1 ล้าน", en: "Under ฿1M" }, min: 0, max: 1_000_000 },
  { id: "1-5", label: { th: "1–5 ล้าน", en: "฿1M–5M" }, min: 1_000_000, max: 5_000_000 },
  { id: "5-20", label: { th: "5–20 ล้าน", en: "฿5M–20M" }, min: 5_000_000, max: 20_000_000 },
  { id: "20+", label: { th: "เกิน 20 ล้าน", en: "Over ฿20M" }, min: 20_000_000, max: Infinity },
] as const;

const DEADLINE_BANDS = [
  { id: "any", label: { th: "ไม่จำกัด", en: "Any" }, days: Infinity },
  { id: "7", label: { th: "ภายใน 7 วัน", en: "Within 7 days" }, days: 7 },
  { id: "14", label: { th: "ภายใน 14 วัน", en: "Within 14 days" }, days: 14 },
  { id: "30", label: { th: "ภายใน 30 วัน", en: "Within 30 days" }, days: 30 },
] as const;

const STATUS_OPTIONS: { id: Status; label: { th: string; en: string } }[] = [
  { id: "open", label: { th: "เปิดรับข้อเสนอ", en: "Open" } },
  { id: "amended", label: { th: "แก้ไขแล้ว", en: "Amended" } },
  { id: "closed", label: { th: "ประกาศผู้ชนะแล้ว", en: "Closed — awarded" } },
];

const SCOPE_OPTIONS: { id: ScopeSize; label: { th: string; en: string } }[] = [
  { id: "solo", label: { th: "ทำคนเดียวไหว", en: "Solo-sized" } },
  { id: "small-team", label: { th: "ทีมเล็ก 2–5 คน", en: "Small team" } },
  { id: "firm", label: { th: "ต้องใช้บริษัท", en: "Firm-sized" } },
];

const SORTS = [
  { id: "deadline", label: { th: "ใกล้ปิดรับที่สุด", en: "Closing soonest" } },
  { id: "match", label: { th: "ตรงกับโปรไฟล์", en: "Best match" } },
  { id: "newest", label: { th: "ประกาศล่าสุด", en: "Newest" } },
  { id: "budget-desc", label: { th: "งบสูงสุด", en: "Highest budget" } },
  { id: "budget-asc", label: { th: "งบต่ำสุด", en: "Lowest budget" } },
] as const;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-line px-3 py-3 last:border-b-0">
      <h3 className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-3">
        {title}
      </h3>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Check({
  checked,
  onChange,
  label,
  count,
  trailing,
}: {
  checked: boolean;
  onChange: () => void;
  label: ReactNode;
  count?: number;
  trailing?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] leading-thai text-ink-2 hover:text-ink">
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

export default function CatalogPage() {
  const { lang } = useLang();

  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [scopes, setScopes] = useState<ScopeSize[]>([]);
  const [techFilter, setTechFilter] = useState<string[]>([]);
  const [agencyFilter, setAgencyFilter] = useState<string[]>([]);
  const [budgetBand, setBudgetBand] = useState<string>("any");
  const [deadlineBand, setDeadlineBand] = useState<string>("any");
  const [hideHighRisk, setHideHighRisk] = useState(false);
  const [smeOnly, setSmeOnly] = useState(false);
  const [sort, setSort] = useState<string>("deadline");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeCount =
    statuses.length +
    scopes.length +
    techFilter.length +
    agencyFilter.length +
    (budgetBand === "any" ? 0 : 1) +
    (deadlineBand === "any" ? 0 : 1) +
    (hideHighRisk ? 1 : 0) +
    (smeOnly ? 1 : 0);

  function clearAll() {
    setQuery("");
    setStatuses([]);
    setScopes([]);
    setTechFilter([]);
    setAgencyFilter([]);
    setBudgetBand("any");
    setDeadlineBand("any");
    setHideHighRisk(false);
    setSmeOnly(false);
  }

  const results = useMemo(() => {
    const band = BUDGET_BANDS.find((b) => b.id === budgetBand)!;
    const within = DEADLINE_BANDS.find((b) => b.id === deadlineBand)!.days;
    const q = query.trim().toLowerCase();

    const filtered = tors.filter((tor) => {
      if (q) {
        const haystack = [
          tor.id,
          tor.title.th,
          tor.title.en,
          tor.agency.th,
          tor.agency.en,
          ...tor.techStack,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (statuses.length && !statuses.includes(tor.status)) return false;
      if (scopes.length && !scopes.includes(tor.scopeSize)) return false;
      if (techFilter.length && !techFilter.some((t) => tor.techStack.includes(t))) return false;
      if (agencyFilter.length && !agencyFilter.includes(tor.agency.th)) return false;
      if (tor.budget < band.min || tor.budget > band.max) return false;
      if (within !== Infinity) {
        const left = daysUntil(tor.deadline);
        if (left < 0 || left > within) return false;
      }
      if (hideHighRisk && tor.lockSpec.level === "high") return false;
      if (smeOnly && !tor.smeAdvantage) return false;
      return true;
    });

    const live = (id: string) => (id === "closed" ? 1 : 0);
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "match":
          return b.matchScore - a.matchScore;
        case "newest":
          return b.postedAt.localeCompare(a.postedAt);
        case "budget-desc":
          return b.budget - a.budget;
        case "budget-asc":
          return a.budget - b.budget;
        default: {
          // Dead listings sink, whatever their date — that is the whole point.
          const rank = live(a.status) - live(b.status);
          if (rank !== 0) return rank;
          return daysUntil(a.deadline) - daysUntil(b.deadline);
        }
      }
    });
  }, [
    query,
    statuses,
    scopes,
    techFilter,
    agencyFilter,
    budgetBand,
    deadlineBand,
    hideHighRisk,
    smeOnly,
    sort,
  ]);

  const statusCounts = useMemo(
    () =>
      STATUS_OPTIONS.reduce<Record<string, number>>((acc, option) => {
        acc[option.id] = tors.filter((t) => t.status === option.id).length;
        return acc;
      }, {}),
    [],
  );

  const filterRail = (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3 py-2">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-3">
          {lang === "th" ? "ตัวกรอง" : "Filters"}
        </span>
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
        {STATUS_OPTIONS.map((option) => (
          <Check
            key={option.id}
            checked={statuses.includes(option.id)}
            onChange={() => setStatuses(toggle(statuses, option.id))}
            label={pick(option.label, lang)}
            count={statusCounts[option.id]}
          />
        ))}
      </FilterGroup>

      <FilterGroup title={lang === "th" ? "ขนาดงาน" : "Scope size"}>
        {SCOPE_OPTIONS.map((option) => (
          <Check
            key={option.id}
            checked={scopes.includes(option.id)}
            onChange={() => setScopes(toggle(scopes, option.id))}
            label={pick(option.label, lang)}
          />
        ))}
      </FilterGroup>

      <FilterGroup title={lang === "th" ? "คัดกรองความเสี่ยง" : "Risk"}>
        <Check
          checked={hideHighRisk}
          onChange={() => setHideHighRisk(!hideHighRisk)}
          label={lang === "th" ? "ซ่อนงานเสี่ยงล็อกสเปกสูง" : "Hide high lock-spec risk"}
          trailing={<RiskMeter level="high" />}
        />
        <Check
          checked={smeOnly}
          onChange={() => setSmeOnly(!smeOnly)}
          label={lang === "th" ? "เฉพาะงานที่มีแต้มต่อ SME" : "SME advantage only"}
        />
      </FilterGroup>

      <FilterGroup title={lang === "th" ? "งบประมาณ" : "Budget"}>
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
        <div className="-mr-1 flex max-h-52 flex-col gap-1.5 overflow-y-auto pr-1">
          {techTerms.map((term) => (
            <Check
              key={term}
              checked={techFilter.includes(term)}
              onChange={() => setTechFilter(toggle(techFilter, term))}
              label={<span className="font-mono text-[12px]">{term}</span>}
            />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title={lang === "th" ? "หน่วยงาน" : "Agency"}>
        <div className="-mr-1 flex max-h-52 flex-col gap-1.5 overflow-y-auto pr-1">
          {agencies.map((agency) => (
            <Check
              key={agency.th}
              checked={agencyFilter.includes(agency.th)}
              onChange={() => setAgencyFilter(toggle(agencyFilter, agency.th))}
              label={pick(agency, lang)}
            />
          ))}
        </div>
      </FilterGroup>
    </Panel>
  );

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">
            {lang === "th" ? "ประกาศงานไอทีของ กทม." : "Bangkok IT procurement"}
          </h1>
          <p className="mt-1 max-w-2xl text-[14px] leading-thai text-ink-2">
            {lang === "th"
              ? "สรุปสาระสำคัญจากเอกสาร TOR ที่ผ่านการถอดความแล้ว อ่านจบได้โดยไม่ต้องเปิดไฟล์ PDF"
              : "Normalized summaries of every posted TOR — read the whole thing without opening the PDF."}
          </p>
        </div>
        <p className="font-mono text-[11px] text-ink-3">
          {tors.length} {lang === "th" ? "ประกาศ" : "postings"} ·{" "}
          {lang === "th" ? "อัปเดตล่าสุด" : "last crawl"} {formatDate(TODAY, lang)} 06:33
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[248px_minmax(0,1fr)]">
        <div className="lg:hidden">
          <button
            type="button"
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`${btn.secondary} w-full justify-between`}
          >
            <span>
              {lang === "th" ? "ตัวกรอง" : "Filters"}
              {activeCount > 0 ? ` (${activeCount})` : ""}
            </span>
            <span className="font-mono text-[11px] text-ink-3">{filtersOpen ? "−" : "+"}</span>
          </button>
          {filtersOpen ? <div className="mt-3">{filterRail}</div> : null}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-[70px]">{filterRail}</div>
        </aside>

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
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  lang === "th"
                    ? "ค้นหาชื่อโครงการ หน่วยงาน หรือเทคโนโลยี เช่น Next.js"
                    : "Search a title, agency or technology — e.g. Next.js"
                }
                className={`${input} pl-8`}
                aria-label={lang === "th" ? "ค้นหาประกาศ" : "Search postings"}
              />
            </div>
            <label className="flex items-center gap-2 whitespace-nowrap">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
                {lang === "th" ? "เรียงตาม" : "Sort"}
              </span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
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

          <p className="mb-2 font-mono text-[11px] text-ink-3">
            {lang === "th"
              ? `พบ ${results.length} จาก ${tors.length} ประกาศ`
              : `${results.length} of ${tors.length} postings`}
          </p>

          {results.length === 0 ? (
            <EmptyState
              headline={
                lang === "th"
                  ? "ไม่มีประกาศที่ตรงกับเงื่อนไขนี้"
                  : "Nothing matches these filters yet"
              }
              body={
                lang === "th"
                  ? "กทม. ประกาศงานไอทีเฉลี่ยสัปดาห์ละ 4–6 รายการ ลองขยายช่วงงบประมาณ หรือเอาตัวกรองความเสี่ยงออกก่อน แล้วบันทึกเงื่อนไขนี้ไว้รับแจ้งเตือนเมื่อมีงานใหม่เข้ามา"
                  : "The BMA posts 4–6 IT projects a week. Widen the budget band or drop the risk filter — or save this search and we will email you when something matching appears."
              }
              action={
                <button type="button" onClick={clearAll} className={btn.secondary}>
                  {lang === "th" ? "ล้างตัวกรองทั้งหมด" : "Clear all filters"}
                </button>
              }
            />
          ) : (
            <Panel className="overflow-hidden">
              {results.map((tor) => (
                <TorRow key={tor.id} tor={tor} showMatch={sort === "match"} />
              ))}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
