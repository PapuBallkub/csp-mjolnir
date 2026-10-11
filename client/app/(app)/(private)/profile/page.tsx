"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth, useAuthedUser } from "../../../_components/auth";
import { useLang } from "../../../_components/prefs";
import { btn, Eyebrow, input, Label, Panel, SectionHeading } from "../../../_components/ui";
import { formatTHB } from "../../../_data/tors";
import * as api from "../../../_lib/api";
import type { ApiError, UserProfile } from "../../../_lib/api";

const CERTIFICATION_CATEGORIES = [
  {
    key: "software",
    title: { th: "วิศวกรรมซอฟต์แวร์และการพัฒนา", en: "Software Engineering & Maturity" },
    items: [
      "ISO/IEC 29110",
      "CMMI Level 3",
      "CMMI Level 5",
      "ISO/IEC 12207",
      "ISO/IEC 25010",
    ],
  },
  {
    key: "security",
    title: { th: "ความมั่นคงปลอดภัย ข้อมูล และคลาวด์", en: "Security, Privacy & Cloud" },
    items: [
      "ISO/IEC 27001",
      "ISO/IEC 27701",
      "ISO/IEC 27017",
      "ISO/IEC 27018",
      "PCI DSS",
      "CSA STAR",
      "ISO/IEC 15408",
    ],
  },
  {
    key: "service",
    title: { th: "การบริหารจัดการบริการและศูนย์ข้อมูล", en: "IT Service & Data Center" },
    items: [
      "ISO/IEC 20000-1",
      "ISO 22301",
      "TIA-942",
    ],
  },
  {
    key: "quality",
    title: { th: "การบริหารคุณภาพและมาตรฐาน AI", en: "Quality & AI Management" },
    items: [
      "ISO 9001",
      "ISO 14001",
      "ISO/IEC 42001",
    ],
  },
] as const;

const ALL_STANDARD_CERTS: string[] = CERTIFICATION_CATEGORIES.flatMap((c) => c.items);

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * FR-12: Users save technical skills, budget capacity, and certifications
 * to their account profile. Feeds the match scoring engine (FR-13).
 */
export default function ProfilePage() {
  const { lang } = useLang();
  const user = useAuthedUser();
  const { updateProfile } = useAuth();

  // Technologies loaded from real vocabulary API (85 items)
  const [techList, setTechList] = useState<api.TechnologyItem[]>([]);
  const [techsLoading, setTechsLoading] = useState(true);

  // Search and filter states
  const [searchSkill, setSearchSkill] = useState("");
  const [isSkillSearchFocused, setIsSkillSearchFocused] = useState(false);
  const [isSkillsSelectedExpanded, setIsSkillsSelectedExpanded] = useState(false);
  const [isSkillsBankExpanded, setIsSkillsBankExpanded] = useState(false);

  const [searchCert, setSearchCert] = useState("");
  const [isCertSearchFocused, setIsCertSearchFocused] = useState(false);
  const [isCertsSelectedExpanded, setIsCertsSelectedExpanded] = useState(false);

  // Admin Request Modal state
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({
    name: "",
    type: "technology" as "technology" | "certification",
    category: "Framework",
    reason: "",
  });
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestResult, setRequestResult] = useState<"idle" | "success" | string>("idle");

  // Clear all confirmation modal state
  const [clearConfirmTarget, setClearConfirmTarget] = useState<"skills" | "certifications" | null>(null);

  // Local editable draft initialized from user.profile
  const [draft, setDraft] = useState<UserProfile>(() => ({
    skills: user.profile?.skills ?? [],
    budgetMin: user.profile?.budgetMin ?? 0,
    budgetMax: user.profile?.budgetMax ?? 0,
    certifications: user.profile?.certifications ?? [],
  }));

  // Save operation state
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<"idle" | "success" | ApiError>("idle");

  // Fetch available technologies from server vocabulary on mount
  useEffect(() => {
    let cancelled = false;
    api.getTechnologies().then((result) => {
      if (cancelled) return;
      if (result.ok && result.data.technologies) {
        setTechList(result.data.technologies);
      } else {
        api.torFacets().then((facetsRes) => {
          if (cancelled) return;
          if (facetsRes.ok) {
            setTechList(facetsRes.data.technologies.map((t) => ({ name: t.name })));
          }
        });
      }
      setTechsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isDirty = useMemo(() => {
    const saved = user.profile ?? { skills: [], budgetMin: 0, budgetMax: 0, certifications: [] };
    const savedSkills = [...saved.skills].sort().join(",");
    const draftSkills = [...draft.skills].sort().join(",");
    const savedCerts = [...(saved.certifications ?? [])].sort().join(",");
    const draftCerts = [...draft.certifications].sort().join(",");

    return (
      savedSkills !== draftSkills ||
      saved.budgetMin !== draft.budgetMin ||
      saved.budgetMax !== draft.budgetMax ||
      savedCerts !== draftCerts
    );
  }, [draft, user.profile]);

  const budgetError =
    draft.budgetMin > 0 && draft.budgetMax > 0 && draft.budgetMin > draft.budgetMax
      ? lang === "th"
        ? "งบต่ำสุดต้องไม่เกินงบสูงสุด"
        : "Minimum budget cannot exceed maximum budget"
      : null;

  // Combined available technologies (database vocabulary + any user saved skills)
  const displaySkills = useMemo(() => {
    return Array.from(new Set([...techList.map((t) => t.name), ...draft.skills]));
  }, [techList, draft.skills]);

  // Clean slicing for available technologies (prevents partial cut chips)
  const COLLAPSED_SKILLS_LIMIT = 24;
  const visibleSkills = useMemo(() => {
    return isSkillsBankExpanded ? displaySkills : displaySkills.slice(0, COLLAPSED_SKILLS_LIMIT);
  }, [displaySkills, isSkillsBankExpanded]);

  // Clean slicing for selected chips
  const visibleSelectedSkills = useMemo(() => {
    return isSkillsSelectedExpanded ? draft.skills : draft.skills.slice(0, 12);
  }, [draft.skills, isSkillsSelectedExpanded]);

  const visibleSelectedCerts = useMemo(() => {
    return isCertsSelectedExpanded ? draft.certifications : draft.certifications.slice(0, 8);
  }, [draft.certifications, isCertsSelectedExpanded]);

  // Real-time suggestions for skills dropdown
  const skillSuggestions = useMemo(() => {
    const q = searchSkill.trim().toLowerCase();
    if (!q) return [];
    return displaySkills.filter((t) => t.toLowerCase().includes(q)).slice(0, 8);
  }, [searchSkill, displaySkills]);

  const hasExactSkillMatch = useMemo(() => {
    const q = searchSkill.trim().toLowerCase();
    if (!q) return false;
    return displaySkills.some((t) => t.toLowerCase() === q);
  }, [searchSkill, displaySkills]);

  // Combined available certifications (standard categories + any user saved certs)
  const displayCertifications = useMemo(() => {
    return Array.from(new Set([...ALL_STANDARD_CERTS, ...draft.certifications]));
  }, [draft.certifications]);

  // Custom certifications outside the standard categories
  const customCerts = useMemo(() => {
    return draft.certifications.filter((c) => !ALL_STANDARD_CERTS.includes(c));
  }, [draft.certifications]);

  // Real-time suggestions for certs dropdown
  const certSuggestions = useMemo(() => {
    const q = searchCert.trim().toLowerCase();
    if (!q) return [];
    return displayCertifications.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [searchCert, displayCertifications]);

  const hasExactCertMatch = useMemo(() => {
    const q = searchCert.trim().toLowerCase();
    if (!q) return false;
    return displayCertifications.some((c) => c.toLowerCase() === q);
  }, [searchCert, displayCertifications]);

  const handleToggleSkill = useCallback((skill: string) => {
    setDraft((prev) => ({
      ...prev,
      skills: toggle(prev.skills, skill),
    }));
  }, []);

  const handleToggleCert = useCallback((cert: string) => {
    setDraft((prev) => ({
      ...prev,
      certifications: toggle(prev.certifications, cert),
    }));
  }, []);

  const handleConfirmClear = useCallback(() => {
    if (clearConfirmTarget === "skills") {
      setDraft((prev) => ({ ...prev, skills: [] }));
    } else if (clearConfirmTarget === "certifications") {
      setDraft((prev) => ({ ...prev, certifications: [] }));
    }
    setClearConfirmTarget(null);
  }, [clearConfirmTarget]);

  useEffect(() => {
    if (!clearConfirmTarget) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setClearConfirmTarget(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearConfirmTarget]);

  // Open modal to request new technology or standard from admin
  const openRequestModal = useCallback(
    (initialName = "", type: "technology" | "certification" = "technology") => {
      setRequestForm({
        name: initialName,
        type,
        category: type === "technology" ? "Framework" : "Software",
        reason: "",
      });
      setRequestResult("idle");
      setIsRequestModalOpen(true);
    },
    []
  );

  const handleSendRequest = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const name = requestForm.name.trim();
      if (!name) return;
      setRequestSubmitting(true);
      setRequestResult("idle");

      const res = await api.requestTechnology({
        name,
        category: requestForm.category,
        reason: requestForm.reason,
      });

      setRequestSubmitting(false);
      if (res.ok) {
        setRequestResult("success");
        // If technology, add to vocabulary list immediately so user can select it
        if (requestForm.type === "technology" && res.data.technology?.name) {
          const techName = res.data.technology.name;
          setTechList((prev) => {
            if (prev.some((t) => t.name.toLowerCase() === techName.toLowerCase())) {
              return prev;
            }
            return [...prev, { name: techName, category: res.data.technology.category }].sort((a, b) =>
              a.name.localeCompare(b.name)
            );
          });
          // Also toggle into draft skills
          setDraft((prev) => {
            if (!prev.skills.includes(techName) && prev.skills.length < 150) {
              return { ...prev, skills: [...prev.skills, techName] };
            }
            return prev;
          });
        } else if (requestForm.type === "certification") {
          // If custom cert requested, also add to draft certs
          setDraft((prev) => {
            if (!prev.certifications.includes(name) && prev.certifications.length < 50) {
              return { ...prev, certifications: [...prev.certifications, name] };
            }
            return prev;
          });
        }
        setTimeout(() => {
          setIsRequestModalOpen(false);
          setRequestResult("idle");
        }, 1500);
      } else {
        setRequestResult(res.error.message || "Failed to submit request");
      }
    },
    [requestForm]
  );


  const handleSave = useCallback(async () => {
    if (budgetError) return;
    setSaving(true);
    setSaveResult("idle");

    const error = await updateProfile(draft);
    setSaving(false);

    if (error) {
      setSaveResult(error);
    } else {
      setSaveResult("success");
      const timer = setTimeout(() => {
        setSaveResult("idle");
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [budgetError, draft, updateProfile]);

  const router = useRouter();
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const handleReset = useCallback(() => {
    setDraft({
      skills: user.profile?.skills ?? [],
      budgetMin: user.profile?.budgetMin ?? 0,
      budgetMax: user.profile?.budgetMax ?? 0,
      certifications: user.profile?.certifications ?? [],
    });
    setSaveResult("idle");
  }, [user.profile]);

  const handleDiscardAndLeave = useCallback(() => {
    handleReset();
    setShowUnsavedModal(false);
    if (pendingUrl) {
      if (pendingUrl.startsWith("http://") || pendingUrl.startsWith("https://")) {
        window.location.href = pendingUrl;
      } else {
        router.push(pendingUrl);
      }
      setPendingUrl(null);
    }
  }, [handleReset, pendingUrl, router]);

  const handleSaveAndLeave = useCallback(async () => {
    if (budgetError) return;
    setSaving(true);
    const error = await updateProfile(draft);
    setSaving(false);
    if (!error) {
      setShowUnsavedModal(false);
      if (pendingUrl) {
        if (pendingUrl.startsWith("http://") || pendingUrl.startsWith("https://")) {
          window.location.href = pendingUrl;
        } else {
          router.push(pendingUrl);
        }
        setPendingUrl(null);
      }
    } else {
      setSaveResult(error);
    }
  }, [budgetError, draft, pendingUrl, router, updateProfile]);

  // Intercept all link clicks across the document when user has unsaved changes
  useEffect(() => {
    if (!isDirty) return;

    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (target.closest("[data-unsaved-modal]") || target.closest("[data-clear-confirm-modal]")) return;

      const anchor = target.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      if (
        href.startsWith("#") ||
        href.startsWith("javascript:") ||
        href === "" ||
        anchor.target === "_blank" ||
        e.metaKey ||
        e.ctrlKey
      ) {
        return;
      }

      try {
        const targetUrl = new URL(anchor.href, window.location.href);
        if (
          targetUrl.origin === window.location.origin &&
          targetUrl.pathname === window.location.pathname &&
          targetUrl.search === window.location.search
        ) {
          return;
        }
      } catch {
        // Malformed URL, skip
      }

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      setPendingUrl(href);
      setShowUnsavedModal(true);
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [isDirty]);

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6">
      <header className="mb-5">
        <Eyebrow>{lang === "th" ? "โปรไฟล์ของคุณ" : "Your profile"}</Eyebrow>
        <h1 className="mt-1 text-[26px] leading-tight font-semibold tracking-tight text-ink">
          {lang === "th" ? "บอกเราว่าคุณทำอะไรได้" : "Tell us what you can build"}
        </h1>
        <p className="mt-1 max-w-2xl text-[14px] leading-thai text-ink-2">
          {lang === "th"
            ? "ข้อมูลนี้ใช้จับคู่งานที่เหมาะสมในหน้าค้นหา และจัดอันดับประกาศที่ตรงกับความสามารถของคุณ บันทึกแล้วแก้ไขได้ตลอดเวลา"
            : "This information is used to match and rank relevant government IT procurement opportunities for you. You can update it anytime."}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-5">
          <Panel className="px-4 py-5 sm:px-6 sm:py-6">
            {/* 1. Account Info (Read-only) */}
            <section>
              <SectionHeading
                sub={
                  lang === "th"
                    ? "ใช้แสดงในบัญชีและใช้ส่งการแจ้งเตือน"
                    : "Shown on your account and used for alerts."
                }
              >
                {lang === "th" ? "บัญชีผู้ใช้" : "Account"}
              </SectionHeading>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <Label>{lang === "th" ? "ชื่อที่แสดง" : "Display name"}</Label>
                  <input
                    value={user.name}
                    readOnly
                    className={`${input} text-ink-2`}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <Label>{lang === "th" ? "อีเมล" : "Email"}</Label>
                  <input
                    value={user.email}
                    readOnly
                    className={`${input} font-mono text-ink-2`}
                  />
                </label>
              </div>
              <p className="mt-2 text-[11px] leading-thai text-ink-3">
                {lang === "th"
                  ? "ชื่อและอีเมลมาจากบัญชีของคุณ ยังแก้ไขที่นี่ไม่ได้"
                  : "Your name and email come from your account. They cannot be changed here yet."}
              </p>
            </section>

            {/* 2. Budget Capacity (Moved above Tech for intuitive flow) */}
            <section className="mt-9">
              <SectionHeading
                sub={
                  lang === "th"
                    ? "กำหนดช่วงงบประมาณโครงการที่คุณสามารถรับงานได้ (บาท)"
                    : "Set the project budget range you can take on (THB)."
                }
              >
                {lang === "th" ? "ช่วงงบที่คุณรับงาน" : "Budget range you take on"}
              </SectionHeading>
              <div className="flex max-w-md items-center gap-2">
                <div className="flex-1">
                  <input
                    type="number"
                    value={draft.budgetMin}
                    step={100_000}
                    min={0}
                    max={10_000_000_000}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        budgetMin: Math.max(0, Number(e.target.value)),
                      }))
                    }
                    className={`${input} font-mono tnum`}
                    aria-label={lang === "th" ? "งบต่ำสุด" : "Minimum budget"}
                  />
                </div>
                <span className="text-ink-3">–</span>
                <div className="flex-1">
                  <input
                    type="number"
                    value={draft.budgetMax}
                    step={100_000}
                    min={0}
                    max={10_000_000_000}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        budgetMax: Math.max(0, Number(e.target.value)),
                      }))
                    }
                    className={`${input} font-mono tnum`}
                    aria-label={lang === "th" ? "งบสูงสุด" : "Maximum budget"}
                  />
                </div>
              </div>
              <p className="mt-2 font-mono tnum text-[12px] text-ink-3">
                {formatTHB(draft.budgetMin)} – {formatTHB(draft.budgetMax)}
              </p>
              {budgetError && <p className="mt-1.5 text-[11px] text-red-600">{budgetError}</p>}
              {typeof saveResult === "object" && saveResult.details?.budgetMin && (
                <p className="mt-1.5 text-[11px] text-red-600">{saveResult.details.budgetMin}</p>
              )}
              {typeof saveResult === "object" && saveResult.details?.budgetMax && (
                <p className="mt-1.5 text-[11px] text-red-600">{saveResult.details.budgetMax}</p>
              )}
            </section>

            {/* 3. Technical Skills & Technologies */}
            <section className="mt-9">
              <SectionHeading
                sub={
                  lang === "th"
                    ? "เลือกเทคโนโลยีที่คุณเชี่ยวชาญเพื่อใช้จับคู่งานจัดซื้อจัดจ้างภาครัฐ"
                    : "Select technologies you specialize in to match with government procurement requirements."
                }
                right={
                  draft.skills.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setClearConfirmTarget("skills")}
                      className="cursor-pointer text-[11px] text-ink-3 underline underline-offset-2 transition-colors hover:text-red-600"
                    >
                      {lang === "th" ? "ล้างทั้งหมด" : "Clear all"}
                    </button>
                  ) : null
                }
              >
                {lang === "th" ? "ทักษะและเทคโนโลยี" : "Skills and technologies"}
              </SectionHeading>

              {/* Selected skills zone (Refined single count, sleek professional styling) */}
              {draft.skills.length > 0 && (
                <div className="mb-4 rounded-md border border-line bg-surface-2/40 p-3.5 shadow-[inset_0_1px_1px_rgba(0,0,0,0.03)]">
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-ink">
                      {lang === "th"
                        ? `ทักษะที่คุณเลือกแล้ว (${draft.skills.length})`
                        : `Your selected skills (${draft.skills.length})`}
                    </span>
                    <span className="text-[11px] text-ink-3">
                      {lang === "th" ? "คลิกเพื่อนำออก" : "Click tag to remove"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {visibleSelectedSkills.map((skill) => (
                      <button
                        key={skill}
                        type="button"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            skills: prev.skills.filter((s) => s !== skill),
                          }))
                        }
                        title={lang === "th" ? `คลิกเพื่อลบ ${skill}` : `Click to remove ${skill}`}
                        className="group inline-flex cursor-pointer items-center gap-1.5 rounded-[3px] border border-ink/80 bg-ink px-2.5 py-1 font-mono text-[11px] font-medium text-surface transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white"
                      >
                        <span>{skill}</span>
                        <span aria-hidden="true" className="text-[11px] opacity-70 group-hover:opacity-100">
                          ✕
                        </span>
                      </button>
                    ))}
                  </div>

                  {draft.skills.length > 12 && (
                    <div className="mt-2.5 pt-2 border-t border-line/60 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setIsSkillsSelectedExpanded(!isSkillsSelectedExpanded)}
                        className="cursor-pointer text-[11px] font-medium text-ink-2 hover:text-ink transition-colors flex items-center gap-1"
                      >
                        {isSkillsSelectedExpanded
                          ? (lang === "th" ? "ย่อลง ▴" : "Show less ▴")
                          : (lang === "th" ? "ดูทั้งหมด ▾" : "Show all ▾")}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Real-time Search with Dropdown Suggestion */}
              <div className="relative max-w-md">
                <div className="relative flex items-center">
                  <span className="pointer-events-none absolute left-3 text-ink-3">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={searchSkill}
                    onChange={(e) => setSearchSkill(e.target.value)}
                    onFocus={() => setIsSkillSearchFocused(true)}
                    onBlur={() => setTimeout(() => setIsSkillSearchFocused(false), 200)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (skillSuggestions.length > 0) {
                          handleToggleSkill(skillSuggestions[0]);
                          setSearchSkill("");
                        } else if (searchSkill.trim()) {
                          openRequestModal(searchSkill.trim(), "technology");
                        }
                      } else if (e.key === "Escape") {
                        setIsSkillSearchFocused(false);
                      }
                    }}
                    placeholder={
                      lang === "th"
                        ? "ค้นหาเทคโนโลยี (เช่น Windows, Python, Docker)..."
                        : "Search technologies (e.g. Windows, Python, Docker)..."
                    }
                    className={`${input} pl-8.5 pr-8 text-[12px]`}
                    maxLength={100}
                  />
                  {searchSkill && (
                    <button
                      type="button"
                      onClick={() => setSearchSkill("")}
                      className="absolute right-2.5 text-[14px] text-ink-3 hover:text-ink cursor-pointer"
                      aria-label="Clear"
                    >
                      &times;
                    </button>
                  )}
                </div>

                {/* Dropdown Suggestions */}
                {isSkillSearchFocused && searchSkill.trim().length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-[3px] border border-line bg-surface shadow-lg">
                    {skillSuggestions.length > 0 ? (
                      <ul className="py-1">
                        {skillSuggestions.map((skill) => {
                          const on = draft.skills.includes(skill);
                          return (
                            <li key={skill}>
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleToggleSkill(skill);
                                  setSearchSkill("");
                                }}
                                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] font-mono hover:bg-surface-2 transition-colors cursor-pointer"
                              >
                                <span className={on ? "font-semibold text-ink" : "text-ink-2"}>{skill}</span>
                                <span className={`text-[10px] ${on ? "text-green-600 font-bold" : "text-ink-3"}`}>
                                  {on
                                    ? (lang === "th" ? "✓ เลือกแล้ว" : "✓ Selected")
                                    : (lang === "th" ? "+ เพิ่ม" : "+ Add")}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div className="p-3 text-center">
                        <p className="text-[12px] text-ink-3 mb-2">
                          {lang === "th"
                            ? `ไม่พบ "${searchSkill.trim()}" ในระบบ`
                            : `No results found for "${searchSkill.trim()}"`}
                        </p>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            openRequestModal(searchSkill.trim(), "technology");
                          }}
                          className="flex w-full items-center justify-between rounded-[2px] bg-surface-2 px-2.5 py-1.5 text-left text-[12px] text-ink transition-colors hover:bg-surface-3 cursor-pointer"
                        >
                          <span className="text-ink">
                            {lang === "th"
                              ? `ขอเพิ่ม "${searchSkill.trim()}" ไปยังแอดมิน`
                              : `Request admin to add "${searchSkill.trim()}"`}
                          </span>
                          <span className="text-[11px] text-ink-3">↗</span>
                        </button>
                      </div>
                    )}

                    {/* Admin Request Suggestion when searching if no exact match is present */}
                    {skillSuggestions.length > 0 && !hasExactSkillMatch && (
                      <div className="border-t border-line bg-surface-2/30 p-1.5">
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            openRequestModal(searchSkill.trim(), "technology");
                          }}
                          className="flex w-full items-center justify-between rounded-[2px] bg-surface-2 px-2.5 py-1.5 text-left text-[12px] text-ink transition-colors hover:bg-surface-3 cursor-pointer"
                        >
                          <span className="text-ink">
                            {lang === "th"
                              ? `ไม่พบสิ่งที่ต้องการ? ขอเพิ่ม "${searchSkill.trim()}" ไปยังแอดมิน`
                              : `Can't find what you need? Request "${searchSkill.trim()}"`}
                          </span>
                          <span className="text-[11px] text-ink-3">↗</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Available technologies bank (Clean slicing with whole chips, no cloudy cuts) */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-ink-3">
                    {lang === "th"
                      ? `เทคโนโลยีในระบบ (${displaySkills.length} รายการ - คลิกเพื่อเลือก):`
                      : `Available technologies (${displaySkills.length} total - click to add):`}
                  </span>
                  <button
                    type="button"
                    onClick={() => openRequestModal("", "technology")}
                    className="text-[11px] font-medium text-ink-3 hover:text-ink underline underline-offset-2 transition-colors cursor-pointer"
                  >
                    {lang === "th" ? "+ ขอเพิ่มเทคโนโลยี" : "+ Request technology"}
                  </button>
                </div>

                {techsLoading ? (
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="h-6 w-16 animate-pulse rounded-[2px] bg-surface-2" />
                    ))}
                  </div>
                ) : (
                  <div>
                    <div className="flex flex-wrap gap-1.5">
                      {visibleSkills.map((skill) => {
                        const on = draft.skills.includes(skill);
                        return (
                          <button
                            key={skill}
                            type="button"
                            onClick={() => handleToggleSkill(skill)}
                            aria-pressed={on}
                            className={`cursor-pointer rounded-[2px] border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                              on
                                ? "border-ink bg-ink/10 font-semibold text-ink"
                                : "border-line bg-surface-2 text-ink-3 hover:border-ink hover:text-ink"
                            }`}
                          >
                            {on ? `✓ ${skill}` : `+ ${skill}`}
                          </button>
                        );
                      })}
                    </div>

                    {displaySkills.length > COLLAPSED_SKILLS_LIMIT && (
                      <div className="pt-2 flex justify-center">
                        <button
                          type="button"
                          onClick={() => setIsSkillsBankExpanded(!isSkillsBankExpanded)}
                          className="cursor-pointer text-[12px] font-medium text-ink-2 hover:text-ink transition-colors inline-flex items-center gap-1.5 py-1 px-3 rounded-[3px] border border-line bg-surface-2 hover:bg-surface-3"
                        >
                          {isSkillsBankExpanded
                            ? (lang === "th" ? "ย่อลงเหลือรายการแนะนำ ▴" : "Show less ▴")
                            : (lang === "th"
                                ? `แสดงเทคโนโลยีทั้งหมด (${displaySkills.length} รายการ) ▾`
                                : `Show all technologies (${displaySkills.length}) ▾`)}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {typeof saveResult === "object" && saveResult.details?.skills && (
                <p className="mt-1.5 text-[11px] text-red-600">{saveResult.details.skills}</p>
              )}
            </section>

            {/* 4. International & Software Standards (Certifications) */}
            <section className="mt-9">
              <SectionHeading
                sub={
                  lang === "th"
                    ? "เลือกมาตรฐานที่องค์กรหรือทีมของคุณได้รับการรับรอง เพื่อตรวจเกณฑ์คุณสมบัติใน TOR"
                    : "Select international certifications held by your team to match qualification requirements in TORs."
                }
                right={
                  draft.certifications.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setClearConfirmTarget("certifications")}
                      className="cursor-pointer text-[11px] text-ink-3 underline underline-offset-2 transition-colors hover:text-red-600"
                    >
                      {lang === "th" ? "ล้างทั้งหมด" : "Clear all"}
                    </button>
                  ) : null
                }
              >
                {lang === "th" ? "ใบรับรองมาตรฐานสากล (ISO / CMMI)" : "Certifications & Standards (ISO / CMMI)"}
              </SectionHeading>

              {/* Selected certifications zone (Refined single count, sleek professional styling) */}
              {draft.certifications.length > 0 && (
                <div className="mb-4 rounded-md border border-line bg-surface-2/40 p-3.5 shadow-[inset_0_1px_1px_rgba(0,0,0,0.03)]">
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-ink">
                      {lang === "th"
                        ? `มาตรฐานที่คุณเลือกแล้ว (${draft.certifications.length})`
                        : `Your selected standards (${draft.certifications.length})`}
                    </span>
                    <span className="text-[11px] text-ink-3">
                      {lang === "th" ? "คลิกเพื่อนำออก" : "Click tag to remove"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {visibleSelectedCerts.map((cert) => (
                      <button
                        key={cert}
                        type="button"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            certifications: prev.certifications.filter((c) => c !== cert),
                          }))
                        }
                        title={lang === "th" ? `คลิกเพื่อลบ ${cert}` : `Click to remove ${cert}`}
                        className="group inline-flex cursor-pointer items-center gap-1.5 rounded-[3px] border border-ink/80 bg-ink px-2.5 py-1 font-mono text-[11px] font-medium text-surface transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white"
                      >
                        <span>{cert}</span>
                        <span aria-hidden="true" className="text-[11px] opacity-70 group-hover:opacity-100">
                          ✕
                        </span>
                      </button>
                    ))}
                  </div>

                  {draft.certifications.length > 8 && (
                    <div className="mt-2.5 pt-2 border-t border-line/60 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setIsCertsSelectedExpanded(!isCertsSelectedExpanded)}
                        className="cursor-pointer text-[11px] font-medium text-ink-2 hover:text-ink transition-colors flex items-center gap-1"
                      >
                        {isCertsSelectedExpanded
                          ? (lang === "th" ? "ย่อลง ▴" : "Show less ▴")
                          : (lang === "th" ? "ดูทั้งหมด ▾" : "Show all ▾")}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Real-time Search with Dropdown Suggestion for Certs */}
              <div className="relative max-w-md">
                <div className="relative flex items-center">
                  <span className="pointer-events-none absolute left-3 text-ink-3">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={searchCert}
                    onChange={(e) => setSearchCert(e.target.value)}
                    onFocus={() => setIsCertSearchFocused(true)}
                    onBlur={() => setTimeout(() => setIsCertSearchFocused(false), 200)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (certSuggestions.length > 0) {
                          handleToggleCert(certSuggestions[0]);
                          setSearchCert("");
                        } else if (searchCert.trim()) {
                          openRequestModal(searchCert.trim(), "certification");
                        }
                      } else if (e.key === "Escape") {
                        setIsCertSearchFocused(false);
                      }
                    }}
                    placeholder={
                      lang === "th"
                        ? "ค้นหามาตรฐาน (เช่น ISO 29110, CMMI, ISO 27001)..."
                        : "Search standards (e.g. ISO 29110, CMMI, ISO 27001)..."
                    }
                    className={`${input} pl-8.5 pr-8 text-[12px]`}
                    maxLength={100}
                  />
                  {searchCert && (
                    <button
                      type="button"
                      onClick={() => setSearchCert("")}
                      className="absolute right-2.5 text-[14px] text-ink-3 hover:text-ink cursor-pointer"
                      aria-label="Clear"
                    >
                      &times;
                    </button>
                  )}
                </div>

                {/* Dropdown Suggestions for Certs */}
                {isCertSearchFocused && searchCert.trim().length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-[3px] border border-line bg-surface shadow-lg">
                    {certSuggestions.length > 0 ? (
                      <ul className="py-1">
                        {certSuggestions.map((cert) => {
                          const on = draft.certifications.includes(cert);
                          return (
                            <li key={cert}>
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleToggleCert(cert);
                                  setSearchCert("");
                                }}
                                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] font-mono hover:bg-surface-2 transition-colors cursor-pointer"
                              >
                                <span className={on ? "font-semibold text-ink" : "text-ink-2"}>{cert}</span>
                                <span className={`text-[10px] ${on ? "text-green-600 font-bold" : "text-ink-3"}`}>
                                  {on
                                    ? (lang === "th" ? "✓ เลือกแล้ว" : "✓ Selected")
                                    : (lang === "th" ? "+ เพิ่ม" : "+ Add")}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div className="p-3 text-center">
                        <p className="text-[12px] text-ink-3 mb-2">
                          {lang === "th"
                            ? `ไม่พบ "${searchCert.trim()}" ในระบบ`
                            : `No results found for "${searchCert.trim()}"`}
                        </p>
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            openRequestModal(searchCert.trim(), "certification");
                          }}
                          className="flex w-full items-center justify-between rounded-[2px] bg-surface-2 px-2.5 py-1.5 text-left text-[12px] text-ink transition-colors hover:bg-surface-3 cursor-pointer"
                        >
                          <span className="text-ink">
                            {lang === "th"
                              ? `ขอเพิ่ม "${searchCert.trim()}" ไปยังแอดมิน`
                              : `Request admin to add "${searchCert.trim()}"`}
                          </span>
                          <span className="text-[11px] text-ink-3">↗</span>
                        </button>
                      </div>
                    )}

                    {/* Admin Request Suggestion when searching if no exact match is present */}
                    {certSuggestions.length > 0 && !hasExactCertMatch && (
                      <div className="border-t border-line bg-surface-2/30 p-1.5">
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            openRequestModal(searchCert.trim(), "certification");
                          }}
                          className="flex w-full items-center justify-between rounded-[2px] bg-surface-2 px-2.5 py-1.5 text-left text-[12px] text-ink transition-colors hover:bg-surface-3 cursor-pointer"
                        >
                          <span className="text-ink">
                            {lang === "th"
                              ? `ไม่พบสิ่งที่ต้องการ? ขอเพิ่ม "${searchCert.trim()}" ไปยังแอดมิน`
                              : `Can't find what you need? Request "${searchCert.trim()}"`}
                          </span>
                          <span className="text-[11px] text-ink-3">↗</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Categorized certifications bank (Same chip size and styling as technical skills) */}
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-ink-3">
                    {lang === "th"
                      ? `มาตรฐานสากล (${displayCertifications.length} รายการ - คลิกเพื่อเลือก):`
                      : `Standards (${displayCertifications.length} total - click to add):`}
                  </span>
                  <button
                    type="button"
                    onClick={() => openRequestModal("", "certification")}
                    className="text-[11px] font-medium text-ink-3 hover:text-ink underline underline-offset-2 transition-colors cursor-pointer"
                  >
                    {lang === "th" ? "+ ขอเพิ่มมาตรฐาน" : "+ Request standard"}
                  </button>
                </div>

                <div className="space-y-3.5">
                  {CERTIFICATION_CATEGORIES.map((cat) => (
                    <div key={cat.key} className="space-y-1.5">
                      <span className="block text-[11px] font-medium text-ink-2">
                        {cat.title[lang]}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {cat.items.map((cert) => {
                          const on = draft.certifications.includes(cert);
                          return (
                            <button
                              key={cert}
                              type="button"
                              onClick={() => handleToggleCert(cert)}
                              aria-pressed={on}
                              className={`cursor-pointer rounded-[2px] border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                                on
                                  ? "border-ink bg-ink/10 font-semibold text-ink"
                                  : "border-line bg-surface-2 text-ink-3 hover:border-ink hover:text-ink"
                              }`}
                            >
                              {on ? `✓ ${cert}` : `+ ${cert}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {customCerts.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="block text-[11px] font-medium text-ink-2">
                        {lang === "th" ? "มาตรฐานอื่น ๆ ที่คุณระบุ" : "Custom standards specified by you"}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {customCerts.map((cert) => {
                          const on = draft.certifications.includes(cert);
                          return (
                            <button
                              key={cert}
                              type="button"
                              onClick={() => handleToggleCert(cert)}
                              aria-pressed={on}
                              className={`cursor-pointer rounded-[2px] border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                                on
                                  ? "border-ink bg-ink/10 font-semibold text-ink"
                                  : "border-line bg-surface-2 text-ink-3 hover:border-ink hover:text-ink"
                              }`}
                            >
                              {on ? `✓ ${cert}` : `+ ${cert}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>


              {typeof saveResult === "object" && saveResult.details?.certifications && (
                <p className="mt-1.5 text-[11px] text-red-600">{saveResult.details.certifications}</p>
              )}
            </section>
          </Panel>

          {/* Save Status Banner */}
          {saveResult === "success" && (
            <div className="flex items-center gap-2 rounded-[3px] border border-green-200 bg-green-50/80 px-3 py-2 text-[13px] font-medium text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300 animate-in fade-in duration-150">
              <span>✓</span>
              <span>{lang === "th" ? "บันทึกโปรไฟล์เรียบร้อยแล้ว" : "Profile saved successfully"}</span>
            </div>
          )}
          {typeof saveResult === "object" && !saveResult.details && (
            <div className="flex items-center gap-2 rounded-[3px] border border-red-200 bg-red-50/80 px-3 py-2 text-[13px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <span>✕</span>
              <span>{saveResult.message}</span>
            </div>
          )}
        </div>

        {/* Sidebar Summary (Reordered to match form: Budget -> Skills -> Certifications) */}
        <aside className="lg:sticky lg:top-[70px] lg:self-start">
          <Panel className="overflow-hidden">
            <div className="border-b border-line bg-surface-2 px-4 py-3">
              <h2 className="text-[13px] font-semibold text-ink">
                {lang === "th" ? "สรุปโปรไฟล์ของคุณ" : "Profile summary"}
              </h2>
              <p className="mt-0.5 text-[12px] leading-thai text-ink-3">
                {lang === "th"
                  ? "ใช้สำหรับจัดอันดับและค้นหาโอกาสที่ตรงกับคุณ"
                  : "Used for opportunity matching and catalog ranking."}
              </p>
            </div>

            <div className="divide-y divide-line">
              {/* 1. Budget Capacity */}
              <div className="px-4 py-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">
                  {lang === "th" ? "ช่วงงบประมาณ" : "Budget capacity"}
                </span>
                <p className="mt-1 font-mono tnum text-[13px] text-ink">
                  {draft.budgetMin > 0 || draft.budgetMax > 0
                    ? `${formatTHB(draft.budgetMin)} – ${formatTHB(draft.budgetMax)}`
                    : lang === "th"
                      ? "ไม่จำกัด"
                      : "Unrestricted"}
                </p>
              </div>

              {/* 2. Saved skills */}
              <div className="px-4 py-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">
                  {lang === "th" ? "ทักษะที่บันทึก" : "Saved skills"}
                </span>
                <p className="mt-1 text-[14px] font-medium text-ink">
                  {draft.skills.length > 0
                    ? lang === "th"
                      ? `${draft.skills.length} รายการ`
                      : `${draft.skills.length} technologies`
                    : lang === "th"
                      ? "ยังไม่ได้เลือก"
                      : "None selected"}
                </p>
                {draft.skills.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {draft.skills.slice(0, 6).map((skill) => (
                      <span
                        key={skill}
                        className="rounded-[2px] bg-surface-2 border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-2"
                      >
                        {skill}
                      </span>
                    ))}
                    {draft.skills.length > 6 && (
                      <span className="text-[10px] text-ink-3 self-center font-mono">
                        +{draft.skills.length - 6}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* 3. Certifications */}
              <div className="px-4 py-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-ink-3">
                  {lang === "th" ? "มาตรฐานสากลที่ได้รับ" : "Certifications"}
                </span>
                <p className="mt-1 text-[14px] font-medium text-ink">
                  {draft.certifications.length > 0
                    ? lang === "th"
                      ? `${draft.certifications.length} มาตรฐาน`
                      : `${draft.certifications.length} standards`
                    : lang === "th"
                      ? "ยังไม่ได้ระบุ"
                      : "None specified"}
                </p>
                {draft.certifications.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {draft.certifications.slice(0, 6).map((cert) => (
                      <span
                        key={cert}
                        className="rounded-[2px] bg-surface-2 border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-2"
                      >
                        {cert}
                      </span>
                    ))}
                    {draft.certifications.length > 6 && (
                      <span className="text-[10px] text-ink-3 self-center font-mono">
                        +{draft.certifications.length - 6}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-line bg-surface-1 px-4 py-3.5">
              <p className="text-[11px] leading-thai text-ink-3 mb-3">
                {lang === "th"
                  ? "เมื่อตั้งค่าเสร็จสิ้น ระบบจะนำเกณฑ์เหล่านี้ไปคำนวณความเหมาะสมในหน้าค้นหาโครงการ"
                  : "These parameters are used to calculate fit scores across all procurement notices in the catalog."}
              </p>
              <Link
                href="/search"
                className={`${btn.secondary} cursor-pointer w-full justify-center`}
              >
                {lang === "th" ? "ดูรายการประกาศจัดซื้อ" : "Browse procurement catalog"}
              </Link>
            </div>
          </Panel>
        </aside>
      </div>

      {/* Floating Save Notification Bar */}
      {isDirty && (
        <aside
          role="region"
          aria-label={lang === "th" ? "การดำเนินการโปรไฟล์" : "Profile actions"}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-lg rounded-xl border border-line bg-white/95 dark:bg-zinc-900/95 text-zinc-900 dark:text-zinc-100 px-4 py-3 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-2 w-2 shrink-0 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-[13px] font-medium truncate">
              {lang === "th" ? "คุณมีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก" : "You have unsaved changes"}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="cursor-pointer rounded-[4px] border border-zinc-200 dark:border-zinc-700 bg-zinc-100/80 dark:bg-zinc-800/80 px-2.5 py-1 text-[12px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              {lang === "th" ? "คืนค่า" : "Discard"}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !!budgetError}
              className="cursor-pointer rounded-[4px] bg-zinc-900 dark:bg-zinc-100 px-3 py-1 text-[12px] font-medium text-white dark:text-zinc-900 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving
                ? lang === "th"
                  ? "กำลังบันทึก..."
                  : "Saving..."
                : lang === "th"
                  ? "บันทึก"
                  : "Save"}
            </button>
          </div>
        </aside>
      )}

      {/* Unsaved Changes Leave Confirmation Modal */}
      {showUnsavedModal && (
        <div
          data-unsaved-modal
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-modal-title"
            className="w-full max-w-sm rounded-[4px] border border-line bg-surface p-5 shadow-2xl animate-in zoom-in-95 duration-150"
          >
            <h3 id="unsaved-modal-title" className="text-[15px] font-semibold text-ink">
              {lang === "th" ? "คุณมีข้อมูลที่ยังไม่ได้บันทึก" : "Unsaved changes"}
            </h3>
            <p className="mt-2 text-[13px] leading-thai text-ink-2">
              {lang === "th"
                ? "คุณต้องการบันทึกการเปลี่ยนแปลงในโปรไฟล์ก่อนออกจากหน้านี้หรือไม่?"
                : "Do you want to save your changes before leaving this page?"}
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowUnsavedModal(false)}
                className={`${btn.secondary} cursor-pointer justify-center text-[12px]`}
              >
                {lang === "th" ? "แก้ไขต่อ" : "Stay on page"}
              </button>
              <button
                type="button"
                onClick={handleDiscardAndLeave}
                className="cursor-pointer rounded-[3px] border border-line px-3 py-1.5 text-[12px] font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors justify-center"
              >
                {lang === "th" ? "ละทิ้งข้อมูล" : "Discard"}
              </button>
              <button
                type="button"
                onClick={handleSaveAndLeave}
                disabled={saving || !!budgetError}
                className="cursor-pointer rounded-[3px] bg-ink px-3 py-1.5 text-[12px] font-medium text-surface hover:opacity-90 transition-opacity justify-center disabled:opacity-50"
              >
                {saving
                  ? lang === "th"
                    ? "กำลังบันทึก..."
                    : "Saving..."
                  : lang === "th"
                    ? "บันทึกและไปต่อ"
                    : "Save and leave"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Confirmation Modal to prevent accidental clicks */}
      {clearConfirmTarget && (
        <div
          data-clear-confirm-modal
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setClearConfirmTarget(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-confirm-title"
            className="w-full max-w-sm rounded-[4px] border border-line bg-surface p-5 shadow-2xl animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center gap-2.5 text-red-600 mb-2">
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <h3 id="clear-confirm-title" className="text-[15px] font-semibold text-ink">
                {clearConfirmTarget === "skills"
                  ? (lang === "th" ? "ยืนยันการล้างทักษะทั้งหมด?" : "Clear all selected skills?")
                  : (lang === "th" ? "ยืนยันการล้างมาตรฐานทั้งหมด?" : "Clear all selected standards?")}
              </h3>
            </div>
            <p className="text-[13px] leading-thai text-ink-2">
              {clearConfirmTarget === "skills"
                ? (lang === "th"
                    ? `ทักษะที่คุณเลือกไว้ทั้งหมด ${draft.skills.length} รายการจะถูกนำออก คุณแน่ใจหรือไม่ว่าต้องการดำเนินการต่อ?`
                    : `All ${draft.skills.length} selected skills will be removed. Are you sure you want to proceed?`)
                : (lang === "th"
                    ? `มาตรฐานที่คุณเลือกไว้ทั้งหมด ${draft.certifications.length} รายการจะถูกนำออก คุณแน่ใจหรือไม่ว่าต้องการดำเนินการต่อ?`
                    : `All ${draft.certifications.length} selected standards will be removed. Are you sure you want to proceed?`)}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setClearConfirmTarget(null)}
                className={`${btn.secondary} cursor-pointer justify-center text-[12px]`}
              >
                {lang === "th" ? "ยกเลิก" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={handleConfirmClear}
                className="cursor-pointer rounded-[3px] bg-red-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-red-700 transition-colors justify-center"
              >
                {lang === "th" ? "ล้างทั้งหมด" : "Clear all"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Request Modal (Request to add new technology or international standard) */}
      {isRequestModalOpen && (
        <div
          data-request-modal
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-modal-title"
            className="w-full max-w-lg rounded-[4px] border border-line bg-surface p-6 shadow-2xl animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 id="request-modal-title" className="text-[16px] font-semibold text-ink">
                  {lang === "th" ? "ส่งคำขอเพิ่มเทคโนโลยี / มาตรฐานใหม่" : "Request new technology / standard"}
                </h3>
                <p className="mt-1 text-[12px] leading-thai text-ink-3">
                  {lang === "th"
                    ? "แอดมินจะตรวจสอบและนำเข้าสู่ฐานข้อมูล เพื่อให้ระบบสามารถจับคู่ (Match) กับเอกสารจัดซื้อจัดจ้าง TOR ได้อย่างแม่นยำ"
                    : "Admins will review and add it to the shared vocabulary so it can match government TOR requirements."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRequestModalOpen(false)}
                className="text-ink-3 hover:text-ink text-[16px] cursor-pointer"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendRequest} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-[11px] font-medium text-ink-2 mb-1">
                  {lang === "th" ? "ประเภทคำขอ" : "Request type"}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setRequestForm((prev) => ({ ...prev, type: "technology", category: "Framework" }))
                    }
                    className={`cursor-pointer rounded-[3px] border py-1.5 px-3 text-[12px] font-medium transition-colors ${
                      requestForm.type === "technology"
                        ? "border-ink bg-ink text-surface"
                        : "border-line bg-surface-2 text-ink-2 hover:border-ink"
                    }`}
                  >
                    {lang === "th" ? "เทคโนโลยี / ทักษะ" : "Technology / Skill"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setRequestForm((prev) => ({ ...prev, type: "certification", category: "Software" }))
                    }
                    className={`cursor-pointer rounded-[3px] border py-1.5 px-3 text-[12px] font-medium transition-colors ${
                      requestForm.type === "certification"
                        ? "border-ink bg-ink text-surface"
                        : "border-line bg-surface-2 text-ink-2 hover:border-ink"
                    }`}
                  >
                    {lang === "th" ? "มาตรฐานสากล / ISO" : "Standard / ISO"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-ink-2 mb-1">
                  {lang === "th" ? "ชื่อที่ต้องการขอเพิ่ม" : "Name"} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={requestForm.name}
                  onChange={(e) => setRequestForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder={
                    requestForm.type === "technology"
                      ? (lang === "th" ? "เช่น Flutter, Rust, Tailwind CSS" : "e.g. Flutter, Rust, Tailwind CSS")
                      : (lang === "th" ? "เช่น ISO 42001, CMMI Level 4" : "e.g. ISO 42001, CMMI Level 4")
                  }
                  className={`${input} text-[13px]`}
                  maxLength={100}
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-ink-2 mb-1">
                  {lang === "th" ? "หมวดหมู่ที่เกี่ยวข้อง" : "Category"}
                </label>
                <select
                  value={requestForm.category}
                  onChange={(e) => setRequestForm((prev) => ({ ...prev, category: e.target.value }))}
                  className={`${input} text-[13px] cursor-pointer`}
                >
                  {requestForm.type === "technology" ? (
                    <>
                      <option value="Framework">Framework / Library</option>
                      <option value="Language">Programming Language</option>
                      <option value="Database">Database / Storage</option>
                      <option value="Cloud">Cloud / DevOps / Infra</option>
                      <option value="Security">Security / Network</option>
                      <option value="Other">Other / อื่น ๆ</option>
                    </>
                  ) : (
                    <>
                      <option value="Software">Software Engineering (ISO/CMMI)</option>
                      <option value="Security">Security / Privacy (ISO 27001/27701)</option>
                      <option value="Service">IT Service / Data Center (ISO 20000/TIA)</option>
                      <option value="Quality">Quality & Management (ISO 9001/42001)</option>
                      <option value="Other">Other / อื่น ๆ</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-ink-2 mb-1">
                  {lang === "th" ? "เหตุผลหรือลิงก์อ้างอิง (ถ้ามี)" : "Notes or official reference (optional)"}
                </label>
                <textarea
                  rows={4}
                  value={requestForm.reason}
                  onChange={(e) => setRequestForm((prev) => ({ ...prev, reason: e.target.value }))}
                  placeholder={
                    lang === "th"
                      ? "ระบุรายละเอียดเพิ่มเติม หรือลิงก์เว็บไซต์ทางการ เพื่อช่วยให้แอดมินตรวจสอบได้เร็วขึ้น"
                      : "Provide additional details or official links to speed up verification"
                  }
                  className={`${input} min-h-[105px] py-2 text-[13px] leading-relaxed resize-y`}
                  maxLength={500}
                />
              </div>

              {requestResult === "success" && (
                <div className="rounded-[3px] border border-green-200 bg-green-50/90 p-2.5 text-[12px] font-medium text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
                  ✓ {lang === "th" ? "ส่งคำขอไปยังแอดมินเรียบร้อยแล้ว!" : "Request submitted to admin successfully!"}
                </div>
              )}

              {requestResult !== "idle" && requestResult !== "success" && (
                <div className="rounded-[3px] border border-red-200 bg-red-50/90 p-2.5 text-[12px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  ✕ {requestResult}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRequestModalOpen(false)}
                  className={`${btn.secondary} text-[12px] cursor-pointer`}
                >
                  {lang === "th" ? "ยกเลิก" : "Cancel"}
                </button>
                <button
                  type="submit"
                  disabled={requestSubmitting || !requestForm.name.trim()}
                  className="cursor-pointer rounded-[3px] bg-ink px-3.5 py-1.5 text-[12px] font-medium text-surface hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {requestSubmitting
                    ? (lang === "th" ? "กำลังส่ง..." : "Submitting...")
                    : (lang === "th" ? "ส่งคำขอ" : "Submit Request")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
