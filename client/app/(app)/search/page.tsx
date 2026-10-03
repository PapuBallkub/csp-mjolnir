"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  daysUntil,
  formatTHB,
  pick,
  type Profile,
  type ScopeSize,
} from "../../_data/tors";
import { listTors, type TorInsightSummary } from "../../_lib/api";
import { useLang, useProfile } from "../../_components/prefs";
import { useAuth } from "../../_components/auth";
import { TorRow } from "../../_components/tor-row";
import { RiskMeter, ScopeBadge, SmeBadge, type Status } from "../../_components/verdict";
import {
  btn,
  Chip,
  EmptyState,
  input,
  Label,
  Panel,
  SectionHeading,
} from "../../_components/ui";

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

const STATUS_OPTIONS: { id: Status; label: { th: string; en: string } }[] = [
  { id: "Open", label: { th: "เปิดรับข้อเสนอ", en: "Open" } },
  { id: "Draft", label: { th: "ร่างประกาศ / วิจารณ์", en: "Draft TOR" } },
  { id: "Awarded", label: { th: "ประกาศผู้ชนะแล้ว", en: "Awarded" } },
  { id: "Closed", label: { th: "ปิดรับข้อเสนอ", en: "Closed" } },
  { id: "Cancelled", label: { th: "ยกเลิกประกาศ", en: "Cancelled" } },
];

const SCOPE_OPTIONS: { id: ScopeSize; label: { th: string; en: string } }[] = [
  { id: "solo", label: { th: "ทำคนเดียวไหว", en: "Solo-sized" } },
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

function getScopeCategory(budget: number): ScopeSize {
  if (budget < 5_000_000) return "solo";
  if (budget <= 30_000_000) return "small-team";
  return "firm";
}

function computeInsightScore(techStack: string[], budget: number, profile: Profile): number {
  if (!techStack.length) return 50;
  const matched = techStack.filter((t) =>
    profile.skills.some((s) => s.toLowerCase() === t.toLowerCase() || t.toLowerCase().includes(s.toLowerCase())),
  ).length;
  const skillFit = matched / techStack.length;
  const budgetFit = budget >= profile.budgetMin && budget <= profile.budgetMax ? 1 : 0.2;
  const scopeCategory = getScopeCategory(budget);
  const scopeFit = profile.scopeSizes.includes(scopeCategory) ? 1 : 0.2;
  return Math.min(100, Math.round(skillFit * 60 + budgetFit * 25 + scopeFit * 15));
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

export default function BrowsePage() {
  const { lang } = useLang();
  const { profile } = useProfile();
  const { user, status: authStatus } = useAuth();
  const isAuthenticated = authStatus === "authenticated" && !!user;

  // Real API state
  const [torsList, setTorsList] = useState<TorInsightSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Filters state
  const [mode, setMode] = useState<Mode>("filter");
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
  const [scoreFloor, setScoreFloor] = useState<number>(0);
  const [hideClosed, setHideClosed] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Fetch real TORs from MongoDB via Express API
  const fetchTors = useCallback(() => {
    setLoading(true);
    setApiError(null);
    listTors({ limit: 100 })
      .then((res) => {
        if (res.ok) {
          setTorsList(res.data.tors);
        } else {
          setApiError(res.error.message || "Cannot load TOR announcements");
        }
        setLoading(false);
      })
      .catch(() => {
        setApiError("Cannot reach the server");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    let ignore = false;
    listTors({ limit: 100 })
      .then((res) => {
        if (ignore) return;
        if (res.ok) {
          setTorsList(res.data.tors);
        } else {
          setApiError(res.error.message || "Cannot load TOR announcements");
        }
        setLoading(false);
      })
      .catch(() => {
        if (ignore) return;
        setApiError("Cannot reach the server");
        setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  // Extract dynamic agencies from real database records
  const availableAgencies = useMemo(() => {
    const set = new Set<string>();

    for (const t of torsList) {
      if (t.identification.agency) set.add(t.identification.agency);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "th"));
  }, [torsList]);

  // Dynamic agency counts
  const agencyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of torsList) {
      const a = t.identification.agency;
      if (a) counts[a] = (counts[a] || 0) + 1;
    }
    return counts;
  }, [torsList]);

  // Extract dynamic tech terms from real database records
  const availableTechTerms = useMemo(() => {
    const set = new Set<string>();
    for (const t of torsList) {
      for (const tech of t.technicalRequirements?.requiredTechnologies || []) {
        if (tech.name) set.add(tech.name);
      }
    }
    return Array.from(set).sort();
  }, [torsList]);

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

  // Pre-calculate ranked items for match mode
  const ranked = useMemo(() => {
    return torsList
      .map((tor) => {
        const budget = tor.facts.referencePriceTHB || tor.facts.budgetTHB || 0;
        const techStack =
          tor.technicalRequirements?.requiredTechnologies.map((t) => t.name) || [];
        const score = computeInsightScore(techStack, budget, profile);
        return { tor, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [torsList, profile]);

  const strongCount = ranked.filter(
    (row) => row.score >= 70 && row.tor.identification.status !== "Closed" && row.tor.identification.status !== "Cancelled",
  ).length;

  // Filtered and sorted results
  const results = useMemo(() => {
    if (mode === "match") {
      return ranked
        .filter((row) => row.score >= scoreFloor)
        .filter((row) => (hideClosed ? row.tor.identification.status !== "Closed" && row.tor.identification.status !== "Cancelled" : true))
        .filter((row) => (hideHighRisk ? (row.tor.analytics?.lockSpec?.riskScore || 0) < 70 : true))
        .map((row) => row.tor);
    }

    const band = BUDGET_BANDS.find((b) => b.id === budgetBand)!;
    const within = DEADLINE_BANDS.find((b) => b.id === deadlineBand)!.days;
    const q = query.trim().toLowerCase();

    const filtered = torsList.filter((tor) => {
      const budget = tor.facts.referencePriceTHB || tor.facts.budgetTHB || 0;
      const techNames =
        tor.technicalRequirements?.requiredTechnologies.map((t) => t.name) || [];
      const scope = getScopeCategory(budget);

      if (q) {
        const haystack = [
          tor.projectId,
          tor.identification.titleTh,
          tor.identification.titleEn || "",
          tor.identification.agency,
          tor.identification.department || "",
          ...techNames,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (statuses.length && !statuses.includes(tor.identification.status)) return false;
      if (scopes.length && !scopes.includes(scope)) return false;
      if (techFilter.length && !techFilter.some((t) => techNames.includes(t))) return false;
      if (agencyFilter.length && !agencyFilter.includes(tor.identification.agency)) return false;
      if (budget < band.min || budget > band.max) return false;
      if (within !== Infinity && tor.facts.submissionDeadline) {
        const left = daysUntil(tor.facts.submissionDeadline);
        if (left < 0 || left > within) return false;
      }
      if (hideHighRisk && (tor.analytics?.lockSpec?.riskScore || 0) >= 70) return false;
      return true;
    });

    const isClosedOrCancelled = (st: string) =>
      st === "Closed" || st === "Cancelled" || st === "Awarded" ? 1 : 0;

    return [...filtered].sort((a, b) => {
      const budgetA = a.facts.referencePriceTHB || a.facts.budgetTHB || 0;
      const budgetB = b.facts.referencePriceTHB || b.facts.budgetTHB || 0;

      switch (sort) {
        case "newest": {
          const dateA = a.facts.postedDate || a.createdAt || "";
          const dateB = b.facts.postedDate || b.createdAt || "";
          return dateB.localeCompare(dateA);
        }
        case "budget-desc":
          return budgetB - budgetA;
        case "budget-asc":
          return budgetA - budgetB;
        default: {
          // Closed/dead listings sink to the bottom
          const rank = isClosedOrCancelled(a.identification.status) - isClosedOrCancelled(b.identification.status);
          if (rank !== 0) return rank;
          const leftA = a.facts.submissionDeadline ? daysUntil(a.facts.submissionDeadline) : 9999;
          const leftB = b.facts.submissionDeadline ? daysUntil(b.facts.submissionDeadline) : 9999;
          return leftA - leftB;
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
    sort,
    torsList,
  ]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      Open: 0,
      Draft: 0,
      Awarded: 0,
      Closed: 0,
      Cancelled: 0,
    };
    for (const t of torsList) {
      const st = t.identification.status;
      if (st && counts[st] !== undefined) counts[st]++;
    }
    return counts;
  }, [torsList]);

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

      <FilterGroup title={lang === "th" ? "สถานะประกาศ" : "Status"}>
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
      </FilterGroup>

      <FilterGroup title={lang === "th" ? "งบประมาณ / ราคากลาง" : "Budget"}>
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

      <FilterGroup title={lang === "th" ? "เทคโนโลยีที่กำหนด" : "Tech stack"}>
        <div className="-mr-1 flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
          {availableTechTerms.length === 0 ? (
            <span className="text-[12px] text-ink-3">
              {lang === "th" ? "กำลังโหลด..." : "Loading..."}
            </span>
          ) : (
            availableTechTerms.map((term) => (
              <Check
                key={term}
                checked={techFilter.includes(term)}
                onChange={() => setTechFilter(toggle(techFilter, term))}
                label={<span className="font-mono text-[12px]">{term}</span>}
              />
            ))
          )}
        </div>
      </FilterGroup>

      <FilterGroup title={lang === "th" ? "หน่วยงานผู้จัดซื้อ" : "Agency"}>
        <div className="-mr-1 flex max-h-52 flex-col gap-2 overflow-y-auto pr-1">
          {availableAgencies.length === 0 ? (
            <span className="text-[12px] text-ink-3">
              {lang === "th" ? "กำลังโหลด..." : "Loading..."}
            </span>
          ) : (
            availableAgencies.map((agency) => (
              <Check
                key={agency}
                checked={agencyFilter.includes(agency)}
                onChange={() => setAgencyFilter(toggle(agencyFilter, agency))}
                label={agency}
                count={agencyCounts[agency]}
              />
            ))
          )}
        </div>
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
            <Label>{lang === "th" ? "ทักษะของคุณ" : "Your skills"}</Label>
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
            <Label>{lang === "th" ? "ช่วงงบประมาณที่รับได้" : "Budget range"}</Label>
            <p className="mt-1 font-mono tnum text-[12px] text-ink">
              {formatTHB(profile.budgetMin)} – {formatTHB(profile.budgetMax)}
            </p>
          </div>

          <div className="border-t border-line pt-3">
            <Label>{lang === "th" ? "ขนาดงานที่รับได้" : "Scope you can take"}</Label>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {profile.scopeSizes.map((size) => (
                <ScopeBadge key={size} size={size} lang={lang} />
              ))}
              {profile.smeRegistered ? <SmeBadge lang={lang} /> : null}
            </div>
          </div>

          <Link href="/profile" className={`${btn.secondary} w-full text-center`}>
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
            label={lang === "th" ? "งานที่ปิดรับ / สิ้นสุดแล้ว" : "Closed projects"}
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
              {lang === "th" ? "ประกาศจัดซื้อจัดจ้างภาครัฐ (e-GP)" : "Government IT Procurement"}
            </h1>
            <p className="mt-1 max-w-2xl text-[14px] leading-thai text-ink-2">
              {lang === "th"
                ? "สรุปสาระสำคัญจากเอกสาร TOR ที่ผ่านการวิเคราะห์แล้ว อ่านเข้าใจง่าย ตรวจสอบความเสี่ยงล็อกสเปกและราคาได้ทันที"
                : "Normalized summaries of Thai government IT procurement notices — analyze lock-spec and price risks in seconds."}
            </p>
          </div>
          <p className="font-mono text-[11px] text-ink-3">
            {torsList.length} {lang === "th" ? "ประกาศในฐานข้อมูล" : "live postings"} ·{" "}
            {lang === "th" ? "ข้อมูลเชื่อมต่อสดจากระบบ" : "Connected to database"}
          </p>
        </div>

        {/* Mode Selector */}
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
                <span className="transition-opacity duration-150">{pick(option.label, lang)}</span>
                {option.badge !== undefined && option.badge > 0 ? (
                  <span
                    className={`rounded-[2px] px-1 font-mono tnum text-[11px] ${
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

          <p className="text-[12px] leading-thai text-ink-3">
            {mode === "filter"
              ? lang === "th"
                ? "กรองเองตามเทคโนโลยี งบประมาณ สถานะ และหน่วยงานจัดซื้อ"
                : "Narrow down by technology, budget, status and agency."
              : lang === "th"
                ? "เรียงลำดับความเหมาะสมจากทักษะและเงื่อนไขการรับงานของคุณ"
                : "Ranked from skills and preferences saved in your profile."}
          </p>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[248px_minmax(0,1fr)]">
        {/* Mobile Filters Toggle Button */}
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
            <span className="font-mono text-[11px] text-ink-3">{filtersOpen ? "−" : "+"}</span>
          </button>
          {filtersOpen ? <div className="mt-3">{rail}</div> : null}
        </div>

        {/* Desktop Sidebar Rail */}
        <aside className="hidden lg:block">
          <div className="sticky top-[70px]">{rail}</div>
        </aside>

        {/* Main Content Area */}
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
                      ? "ค้นหาชื่อโครงการ, รหัสประกาศ, หน่วยงาน หรือเทคโนโลยี เช่น Linux, PostgreSQL"
                      : "Search project title, ID, agency or technology (e.g. Linux, PostgreSQL)"
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
                    ? "คะแนนประเมินจากทักษะเทคโนโลยีที่ตรงกัน ช่วงงบประมาณ และขนาดของทีมงาน"
                    : "Scored on matching skills, budget capacity and scope size."
                }
              >
                {lang === "th"
                  ? `พบ ${strongCount} โครงการที่ตรงกับทักษะคุณมาก (70%+ score)`
                  : `${strongCount} high-fit matches for you`}
              </SectionHeading>

              {!isAuthenticated ? (
                <div className="mt-2.5 flex items-center justify-between gap-3 rounded-[3px] border border-line bg-surface-2 p-3 text-[12.5px] leading-thai text-ink-2">
                  <span>
                    {lang === "th"
                      ? "💡 คุณกำลังดูผลคะแนนตามตัวอย่างทักษะเริ่มต้น — ลงชื่อเข้าใช้เพื่อปรับแต่งทักษะและเงื่อนไขการรับงานของคุณ"
                      : "💡 You are viewing match results based on default skills. Sign in to customize your profile."}
                  </span>
                  <Link href="/auth" className={`${btn.secondary} shrink-0 text-[12px]`}>
                    {lang === "th" ? "ลงชื่อเข้าใช้" : "Sign in"}
                  </Link>
                </div>
              ) : null}
            </div>
          )}

          {/* Results Count Line */}
          {!loading && !apiError ? (
            <p className="mb-2 font-mono text-[11px] text-ink-3">
              {lang === "th"
                ? `แสดง ${results.length} จากทั้งหมด ${torsList.length} ประกาศ`
                : `Showing ${results.length} of ${torsList.length} postings`}
            </p>
          ) : null}

          {/* Loading State: Skeletons */}
          {loading ? (
            <div className="flex flex-col divide-y divide-line rounded-[3px] border border-line bg-surface overflow-hidden">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex animate-pulse gap-3 p-4">
                  <div className="w-[3px] rounded-full bg-line" />
                  <div className="flex-1 space-y-2.5">
                    <div className="h-3 w-44 rounded bg-surface-3" />
                    <div className="h-4.5 w-3/4 rounded bg-surface-3" />
                    <div className="flex gap-2 pt-1">
                      <div className="h-5 w-24 rounded bg-surface-3" />
                      <div className="h-5 w-28 rounded bg-surface-3" />
                      <div className="h-5 w-20 rounded bg-surface-3" />
                    </div>
                  </div>
                  <div className="hidden sm:flex w-36 flex-col items-end space-y-2 border-l border-line pl-4">
                    <div className="h-5 w-24 rounded bg-surface-3" />
                    <div className="h-3 w-16 rounded bg-surface-3" />
                  </div>
                </div>
              ))}
            </div>
          ) : apiError ? (
            /* Error State */
            <Panel className="p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-risk-bg text-risk text-xl font-bold mb-3">
                !
              </div>
              <h2 className="text-[17px] font-semibold text-ink">
                {lang === "th" ? "ไม่สามารถโหลดข้อมูลประกาศได้" : "Cannot load announcements"}
              </h2>
              <p className="mt-1 text-[13px] text-ink-3 max-w-md mx-auto">
                {apiError}
              </p>
              <div className="mt-4">
                <button type="button" onClick={fetchTors} className={btn.primary}>
                  {lang === "th" ? "ลองใหม่อีกครั้ง" : "Try again"}
                </button>
              </div>
            </Panel>
          ) : results.length === 0 ? (
            /* Empty State */
            mode === "match" && profile.skills.length === 0 ? (
              <EmptyState
                headline={
                  lang === "th"
                    ? "ยังไม่สามารถจับคู่ได้ เนื่องจากยังไม่ได้ระบุทักษะในโปรไฟล์"
                    : "No skills specified in your profile to rank against"
                }
                body={
                  lang === "th"
                    ? "กำหนดทักษะที่คุณถนัดในหน้าโปรไฟล์ ระบบจะนำมาจับคู่กับ TOR ที่ตรงกับคุณโดยอัตโนมัติ"
                    : "Add your tech skills on your profile and this list will automatically re-rank."
                }
                action={
                  <Link href="/profile" className={btn.secondary}>
                    {lang === "th" ? "ไปตั้งค่าโปรไฟล์" : "Set up your profile"}
                  </Link>
                }
              />
            ) : (
              <EmptyState
                headline={
                  lang === "th"
                    ? "ไม่พบประกาศที่ตรงกับเงื่อนไขการค้นหา"
                    : "No announcements match these filters"
                }
                body={
                  lang === "th"
                    ? "ลองลบคำค้นหา หรือปรับลดตัวกรอง เช่น ขยายช่วงงบประมาณ หรือเอาตัวกรองความเสี่ยงออก"
                    : "Try broadening your filters, expanding budget range, or clearing the search query."
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
            /* Results List */
            <Panel className="overflow-hidden">
              {results.map((tor) => (
                <TorRow key={tor.projectId} insight={tor} showMatch={mode === "match"} />
              ))}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
