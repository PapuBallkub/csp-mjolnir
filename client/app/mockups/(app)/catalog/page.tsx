"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  agencies,
  daysUntil,
  formatDate,
  formatTHB,
  isDead,
  matchScore,
  pick,
  techTerms,
  tors,
  TODAY,
  type ScopeSize,
  type Status,
} from "../../_data/tors";
import { useLang, useProfile } from "../../_components/prefs";
import { TorList, TorRow } from "../../_components/tor-row";
import { AmendedFlag, RiskMeter, ScopeBadge, SmeBadge, StatusBadge } from "../../_components/verdict";
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
 * Browse. One list, two ways of narrowing it — filters the user drives by
 * hand, or the ranking their profile already implies. They were separate
 * screens and shared almost everything: the same rows, the same risk filters,
 * the same empty states. Splitting them only forced the user to guess which
 * page held the projects they wanted.
 */
type Mode = "filter" | "match";

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

/**
 * The five lifecycle states, in the order a project moves through them, so the
 * filter list doubles as an explanation of the badge system (FR09).
 */
const STATUS_OPTIONS: { id: Status; label: { th: string; en: string } }[] = [
  { id: "draft", label: { th: "ร่าง TOR", en: "Draft" } },
  { id: "open", label: { th: "เปิดรับข้อเสนอ", en: "Open" } },
  { id: "awarded", label: { th: "ประกาศผู้ชนะแล้ว", en: "Awarded" } },
  { id: "closed", label: { th: "เลยกำหนดยื่นแล้ว", en: "Closed" } },
  { id: "cancelled", label: { th: "ยกเลิกประกาศ", en: "Cancelled" } },
];

const SCOPE_OPTIONS: { id: ScopeSize; label: { th: string; en: string } }[] = [
  { id: "small-team", label: { th: "ทีมเล็ก 2–5 คน", en: "Small team" } },
  { id: "firm", label: { th: "ต้องใช้บริษัท", en: "Firm-sized" } },
];

const SORTS = [
  { id: "deadline", label: { th: "ใกล้ปิดรับที่สุด", en: "Closing soonest" } },
  { id: "newest", label: { th: "ประกาศล่าสุด", en: "Newest" } },
  { id: "budget-desc", label: { th: "งบสูงสุด", en: "Highest budget" } },
  { id: "budget-asc", label: { th: "งบต่ำสุด", en: "Lowest budget" } },
] as const;

const SCORE_FLOORS = [
  { id: 0, label: { th: "ทุกคะแนน", en: "Any score" } },
  { id: 50, label: { th: "50 ขึ้นไป", en: "50 and up" } },
  { id: 70, label: { th: "70 ขึ้นไป — ตรงจริง", en: "70+ — real fits" } },
  { id: 85, label: { th: "85 ขึ้นไป — ตรงมาก", en: "85+ — strong fits" } },
] as const;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-line px-3 py-3.5 last:border-b-0">
      <h3 className="mb-2.5 text-[14px] font-semibold text-ink">{title}</h3>
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
}: {
  checked: boolean;
  onChange: () => void;
  label: ReactNode;
  count?: number;
  trailing?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[14px] leading-thai text-ink-2 hover:text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 shrink-0 accent-ink"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
      {count !== undefined ? (
        <span className="font-mono tnum text-[13px] text-ink-3">{count}</span>
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
    <label className="flex cursor-pointer items-center gap-2 text-[14px] text-ink-2 hover:text-ink">
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

export default function BrowsePage() {
  const { lang } = useLang();
  const { profile } = useProfile();

  const [mode, setMode] = useState<Mode>("filter");
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [scopes, setScopes] = useState<ScopeSize[]>([]);
  const [techFilter, setTechFilter] = useState<string[]>([]);
  const [agencyFilter, setAgencyFilter] = useState<string[]>([]);
  const [budgetBand, setBudgetBand] = useState<string>("any");
  const [deadlineBand, setDeadlineBand] = useState<string>("any");
  const [hideHighRisk, setHideHighRisk] = useState(false);
  const [amendedOnly, setAmendedOnly] = useState(false);
  const [smeOnly, setSmeOnly] = useState(false);
  const [sort, setSort] = useState<string>("deadline");
  const [scoreFloor, setScoreFloor] = useState<number>(0);
  const [hideClosed, setHideClosed] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const activeCount =
    statuses.length +
    scopes.length +
    techFilter.length +
    agencyFilter.length +
    (budgetBand === "any" ? 0 : 1) +
    (deadlineBand === "any" ? 0 : 1) +
    (hideHighRisk ? 1 : 0) +
    (amendedOnly ? 1 : 0) +
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
    setAmendedOnly(false);
    setSmeOnly(false);
  }

  /** Ranked by profile fit. Always computed, so the tab count is honest. */
  const ranked = useMemo(
    () =>
      tors
        .map((tor) => ({ tor, score: matchScore(tor, profile) }))
        .sort((a, b) => b.score - a.score),
    [profile],
  );
  const strongCount = ranked.filter(
    (row) => row.score >= 70 && !isDead(row.tor.status),
  ).length;

  const results = useMemo(() => {
    if (mode === "match") {
      return ranked
        .filter((row) => row.score >= scoreFloor)
        .filter((row) => (hideClosed ? !isDead(row.tor.status) : true))
        .filter((row) => (hideHighRisk ? row.tor.lockSpec.level !== "high" : true))
        .map((row) => row.tor);
    }

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
      if (amendedOnly && !tor.amended) return false;
      if (smeOnly && !tor.smeAdvantage) return false;
      return true;
    });

    const dead = (status: Status) => (isDead(status) ? 1 : 0);
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case "newest":
          return b.postedAt.localeCompare(a.postedAt);
        case "budget-desc":
          return b.budget - a.budget;
        case "budget-asc":
          return a.budget - b.budget;
        default: {
          // Dead listings sink, whatever their date — that is the whole point.
          const rank = dead(a.status) - dead(b.status);
          if (rank !== 0) return rank;
          return daysUntil(a.deadline) - daysUntil(b.deadline);
        }
      }
    });
  }, [
    mode,
    ranked,
    scoreFloor,
    hideClosed,
    query,
    statuses,
    scopes,
    techFilter,
    agencyFilter,
    budgetBand,
    deadlineBand,
    hideHighRisk,
    amendedOnly,
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
      <div className="flex items-center justify-between border-b border-line bg-surface-2 px-3 py-2.5">
        <h2 className="text-[14px] font-semibold text-ink">
          {lang === "th" ? "ตัวกรอง" : "Filters"}
        </h2>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="text-[13px] text-ink-2 underline underline-offset-2 hover:text-ink"
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
            label={<StatusBadge status={option.id} lang={lang} />}
            count={statusCounts[option.id]}
          />
        ))}
        {/* A revision is not a status — it can happen in any of the five. */}
        <div className="mt-1 border-t border-line pt-2.5">
          <Check
            checked={amendedOnly}
            onChange={() => setAmendedOnly(!amendedOnly)}
            label={<AmendedFlag lang={lang} />}
            count={tors.filter((t) => t.amended).length}
          />
        </div>
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
        <div className="-mr-1 flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
          {techTerms.map((term) => (
            <Check
              key={term}
              checked={techFilter.includes(term)}
              onChange={() => setTechFilter(toggle(techFilter, term))}
              label={<span className="font-mono text-[14px]">{term}</span>}
            />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title={lang === "th" ? "หน่วยงาน" : "Agency"}>
        <div className="-mr-1 flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
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

  const matchRail = (
    <div className="flex flex-col gap-4">
      <Panel className="overflow-hidden">
        <div className="border-b border-line bg-surface-2 px-3 py-2.5">
          <h2 className="text-[14px] font-semibold text-ink">
            {lang === "th" ? "จับคู่จากโปรไฟล์ของคุณ" : "Ranked from your profile"}
          </h2>
        </div>

        <div className="flex flex-col gap-3.5 px-3 py-3.5">
          <div>
            <Label>{lang === "th" ? "ทักษะ" : "Skills"}</Label>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {profile.skills.length === 0 ? (
                <span className="text-[14px] text-ink-2">
                  {lang === "th" ? "ยังไม่ได้เลือก" : "None selected"}
                </span>
              ) : (
                profile.skills.map((skill) => <Chip key={skill}>{skill}</Chip>)
              )}
            </div>
          </div>

          <div className="border-t border-line pt-3">
            <Label>{lang === "th" ? "ช่วงงบ" : "Budget range"}</Label>
            <p className="mt-1 font-mono tnum text-[14px] text-ink">
              {formatTHB(profile.budgetMin)} – {formatTHB(profile.budgetMax)}
            </p>
          </div>

          <div className="border-t border-line pt-3">
            <Label>{lang === "th" ? "ขนาดงานที่ไหว" : "Scope you can take"}</Label>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {profile.scopeSizes.map((size) => (
                <ScopeBadge key={size} size={size} lang={lang} />
              ))}
              {profile.smeRegistered ? <SmeBadge lang={lang} /> : null}
            </div>
          </div>

          <Link href="/mockups/profile" className={`${btn.secondary} w-full`}>
            {lang === "th" ? "แก้ไขโปรไฟล์" : "Edit your profile"}
          </Link>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="border-b border-line bg-surface-2 px-3 py-2.5">
          <h2 className="text-[14px] font-semibold text-ink">
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
            label={lang === "th" ? "งานที่ยื่นไม่ได้แล้ว" : "Projects you can no longer bid on"}
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

  const rail = mode === "filter" ? filterRail : matchRail;

  const MODES: { id: Mode; label: { th: string; en: string }; badge?: number }[] = [
    { id: "filter", label: { th: "ค้นหาและกรอง", en: "Search & filter" } },
    { id: "match", label: { th: "ตรงกับโปรไฟล์ฉัน", en: "Matched to me" }, badge: strongCount },
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6">
      <header className="mb-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
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
          <p className="font-mono text-[13px] text-ink-3">
            {tors.length} {lang === "th" ? "ประกาศ" : "postings"} ·{" "}
            {lang === "th" ? "อัปเดตล่าสุด" : "last crawl"} {formatDate(TODAY, lang)} 06:33
          </p>
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
                className={`flex items-center gap-2 rounded-[2px] px-3 py-1.5 text-[14px] font-medium transition-colors ${
                  mode === option.id
                    ? "bg-surface text-ink shadow-sm"
                    : "text-ink-3 hover:text-ink"
                }`}
              >
                {pick(option.label, lang)}
                {option.badge !== undefined ? (
                  <span
                    className={`rounded-[2px] px-1 font-mono tnum text-[13px] ${
                      mode === option.id
                        ? "bg-open-bg text-open"
                        : "bg-surface-3 text-ink-3"
                    }`}
                  >
                    {option.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <p className="text-[14px] leading-thai text-ink-2">
            {mode === "filter"
              ? lang === "th"
                ? "กรองเองตามเทคโนโลยี งบ กำหนดยื่น และหน่วยงาน"
                : "Narrow it yourself by technology, budget, deadline and agency."
              : lang === "th"
                ? "เรียงจากทักษะและเงื่อนไขที่คุณบันทึกไว้ในโปรไฟล์"
                : "Ranked from the skills and limits saved on your profile."}
          </p>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[248px_minmax(0,1fr)]">
        <div className="lg:hidden">
          <button
            type="button"
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`${btn.secondary} w-full justify-between`}
          >
            <span>
              {mode === "filter"
                ? `${lang === "th" ? "ตัวกรอง" : "Filters"}${activeCount > 0 ? ` (${activeCount})` : ""}`
                : lang === "th"
                  ? "โปรไฟล์และการปรับผลลัพธ์"
                  : "Profile and refinements"}
            </span>
            <span className="font-mono text-[13px] text-ink-3">{filtersOpen ? "−" : "+"}</span>
          </button>
          {filtersOpen ? <div className="mt-3">{rail}</div> : null}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-[70px]">{rail}</div>
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
                  <circle
                    cx="7"
                    cy="7"
                    r="4.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    fill="none"
                  />
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
                <Label>{lang === "th" ? "เรียงตาม" : "Sort"}</Label>
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
          ) : (
            <div className="mb-3">
              <SectionHeading
                sub={
                  lang === "th"
                    ? "คะแนนคิดจากทักษะที่ตรง ช่วงงบ และขนาดงาน แต่ละแถวแสดงเทคโนโลยีที่คุณมีอยู่แล้ว"
                    : "Scored on matching skills, budget range and scope size. Each row marks the technologies you already have."
                }
              >
                {lang === "th"
                  ? `ตรงกับคุณมาก ${strongCount} งาน`
                  : `${strongCount} strong matches for you`}
              </SectionHeading>
            </div>
          )}

          <p className="mb-2 font-mono text-[13px] text-ink-3">
            {lang === "th"
              ? `แสดง ${results.length} จาก ${tors.length} ประกาศ`
              : `${results.length} of ${tors.length} postings`}
          </p>

          {results.length === 0 ? (
            mode === "match" && profile.skills.length === 0 ? (
              <EmptyState
                headline={
                  lang === "th"
                    ? "ยังจับคู่ไม่ได้ เพราะโปรไฟล์ยังไม่มีทักษะ"
                    : "We cannot rank anything until your profile lists some skills"
                }
                body={
                  lang === "th"
                    ? "เลือกเทคโนโลยีที่คุณทำได้ในหน้าโปรไฟล์ แล้วรายการนี้จะเรียงใหม่ให้ทันที"
                    : "Pick the technologies you can build with on your profile and this list re-ranks immediately."
                }
                action={
                  <Link href="/mockups/profile" className={btn.secondary}>
                    {lang === "th" ? "ไปตั้งค่าโปรไฟล์" : "Set up your profile"}
                  </Link>
                }
              />
            ) : (
              <EmptyState
                headline={
                  lang === "th"
                    ? "ไม่มีประกาศที่ตรงกับเงื่อนไขนี้"
                    : "Nothing matches these settings yet"
                }
                body={
                  lang === "th"
                    ? "กทม. ประกาศงานไอทีเฉลี่ยสัปดาห์ละ 4–6 รายการ ลองลดคะแนนขั้นต่ำ ขยายช่วงงบประมาณ หรือเอาตัวกรองความเสี่ยงออกก่อน"
                    : "The BMA posts 4–6 IT projects a week. Try lowering the score floor, widening the budget band, or dropping the risk filter."
                }
                action={
                  mode === "filter" ? (
                    <button type="button" onClick={clearAll} className={btn.secondary}>
                      {lang === "th" ? "ล้างตัวกรองทั้งหมด" : "Clear all filters"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setScoreFloor(0)}
                      className={btn.secondary}
                    >
                      {lang === "th" ? "แสดงทุกคะแนน" : "Show every score"}
                    </button>
                  )
                }
              />
            )
          ) : (
            <TorList>
              {results.map((tor) => (
                <TorRow key={tor.id} tor={tor} showMatch={mode === "match"} />
              ))}
            </TorList>
          )}
        </div>
      </div>
    </div>
  );
}
