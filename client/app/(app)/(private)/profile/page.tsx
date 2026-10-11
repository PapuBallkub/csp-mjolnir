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

const STANDARD_CERTIFICATIONS = [
  // Software engineering & capability maturity
  "ISO/IEC 29110",
  "CMMI Level 3",
  "CMMI Level 5",
  "ISO/IEC 12207",
  "ISO/IEC 25010",
  // Security, privacy, cloud & payment
  "ISO/IEC 27001",
  "ISO/IEC 27701",
  "ISO/IEC 27017",
  "ISO/IEC 27018",
  "PCI DSS",
  "CSA STAR",
  "ISO/IEC 15408",
  // IT service management & business continuity
  "ISO/IEC 20000-1",
  "ISO 22301",
  "TIA-942",
  // Quality & emerging standards
  "ISO 9001",
  "ISO 14001",
  "ISO/IEC 42001",
];

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

  // Technologies loaded from real catalog facets
  const [availableTechs, setAvailableTechs] = useState<string[]>([]);
  const [techsLoading, setTechsLoading] = useState(true);

  // Custom inputs
  const [customSkill, setCustomSkill] = useState("");
  const [customCert, setCustomCert] = useState("");

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

  // Fetch available technologies from catalog facets on mount
  useEffect(() => {
    let cancelled = false;
    api.torFacets().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setAvailableTechs(result.data.technologies.map((t) => t.name));
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

  const handleAddCustomSkill = useCallback(() => {
    const trimmed = customSkill.trim();
    if (!trimmed) return;
    if (draft.skills.includes(trimmed)) {
      setCustomSkill("");
      return;
    }
    if (draft.skills.length >= 50) return;

    setDraft((prev) => ({
      ...prev,
      skills: [...prev.skills, trimmed],
    }));
    setCustomSkill("");
  }, [customSkill, draft.skills]);

  const handleAddCustomCert = useCallback(() => {
    const trimmed = customCert.trim();
    if (!trimmed) return;
    if (draft.certifications.includes(trimmed)) {
      setCustomCert("");
      return;
    }
    if (draft.certifications.length >= 30) return;

    setDraft((prev) => ({
      ...prev,
      certifications: [...prev.certifications, trimmed],
    }));
    setCustomCert("");
  }, [customCert, draft.certifications]);

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

      // Do not intercept clicks inside the unsaved changes modal itself
      if (target.closest("[data-unsaved-modal]")) return;

      const anchor = target.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      // Ignore in-page anchors (#), javascript: links, empty links, or open in new tab
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

      // If the link points to the current page itself, ignore
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

      // Intercept navigation
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

  // Combined list of tech options (facets + user's saved custom skills)
  const displaySkills = useMemo(() => {
    return Array.from(new Set([...availableTechs, ...draft.skills]));
  }, [availableTechs, draft.skills]);

  // Combined list of certification options (standards + user's custom certs)
  const displayCertifications = useMemo(() => {
    return Array.from(new Set([...STANDARD_CERTIFICATIONS, ...draft.certifications]));
  }, [draft.certifications]);

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
            {/* Account Info (Read-only) */}
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

            {/* Technical Skills & Technologies */}
            <section className="mt-9">
              <SectionHeading
                sub={
                  lang === "th"
                    ? "เลือกทักษะที่คุณถนัดเพื่อใช้จับคู่งานในระบบ (เลือกได้สูงสุด 50 รายการ)"
                    : "Select technologies you specialize in to match with procurement requirements (up to 50 skills)."
                }
                right={
                  draft.skills.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, skills: [] }))}
                      className="cursor-pointer text-[11px] text-ink-3 underline underline-offset-2 transition-colors hover:text-red-600"
                    >
                      {lang === "th" ? "ล้างทั้งหมด" : "Clear all"}
                    </button>
                  ) : null
                }
              >
                {lang === "th" ? "ทักษะและเทคโนโลยี" : "Skills and technologies"}
              </SectionHeading>

              {/* Zone 1: Selected skills (Option A) */}
              {draft.skills.length > 0 && (
                <div className="mb-4 rounded-[3px] border border-line bg-surface-2/60 p-3">
                  <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-ink-2">
                    <span className="flex items-center gap-1.5">
                      <span>{lang === "th" ? "ทักษะที่คุณเลือกแล้ว" : "Your selected skills"}</span>
                      <span className="inline-flex items-center rounded-full bg-ink px-1.5 py-0.2 font-mono text-[10px] text-surface">
                        {draft.skills.length}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] text-ink-3">{draft.skills.length}/50</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {draft.skills.map((skill) => (
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
                        className="group inline-flex cursor-pointer items-center gap-1.5 rounded-[2px] border border-ink bg-ink px-2 py-1 font-mono text-[11px] text-surface transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white"
                      >
                        <span>{skill}</span>
                        <span aria-hidden="true" className="text-[10px] opacity-70 group-hover:opacity-100">
                          ✕
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Zone 2: Suggestion cloud */}
              <div className="space-y-1.5">
                <span className="block text-[11px] font-medium text-ink-3">
                  {lang === "th" ? "รายการแนะนำ (คลิกเพื่อเลือกเพิ่ม):" : "Suggested skills (click to add):"}
                </span>
                {techsLoading ? (
                  <div className="flex flex-wrap gap-1.5 animate-pulse">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-6 w-16 rounded-[2px] bg-surface-2 border border-line"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {displaySkills.map((term) => {
                      const on = draft.skills.includes(term);
                      return (
                        <button
                          key={term}
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              skills: toggle(prev.skills, term),
                            }))
                          }
                          aria-pressed={on}
                          className={`cursor-pointer rounded-[2px] border px-2 py-1 font-mono text-[11px] transition-colors ${
                            on
                              ? "border-ink bg-ink/10 font-semibold text-ink"
                              : "border-line bg-surface-2 text-ink-3 hover:border-ink hover:text-ink"
                          }`}
                        >
                          {on ? `✓ ${term}` : `+ ${term}`}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Add custom skill input */}
              <div className="mt-3.5 flex max-w-sm items-center gap-2">
                <input
                  type="text"
                  value={customSkill}
                  onChange={(e) => setCustomSkill(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustomSkill();
                    }
                  }}
                  placeholder={
                    lang === "th" ? "เพิ่มทักษะอื่น เช่น Rust, Tailwind..." : "Add other skill, e.g. Rust, Tailwind..."
                  }
                  className={`${input} text-[12px]`}
                  maxLength={100}
                />
                <button
                  type="button"
                  onClick={handleAddCustomSkill}
                  disabled={!customSkill.trim() || draft.skills.length >= 50}
                  className={`${btn.secondary} cursor-pointer shrink-0 text-[12px] disabled:cursor-not-allowed`}
                >
                  {lang === "th" ? "เพิ่ม" : "Add"}
                </button>
              </div>
              {typeof saveResult === "object" && saveResult.details?.skills && (
                <p className="mt-1.5 text-[11px] text-red-600">{saveResult.details.skills}</p>
              )}
            </section>

            {/* Budget Capacity */}
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

            {/* International & Software Standards (Certifications) */}
            <section className="mt-9">
              <SectionHeading
                sub={
                  lang === "th"
                    ? "เลือกมาตรฐานที่องค์กรหรือทีมของคุณได้รับการรับรอง เพื่อตรวจเกณฑ์คุณสมบัติใน TOR (สูงสุด 30 รายการ)"
                    : "Select international certifications held by your team to match qualification requirements in TORs (up to 30 standards)."
                }
                right={
                  draft.certifications.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, certifications: [] }))}
                      className="cursor-pointer text-[11px] text-ink-3 underline underline-offset-2 transition-colors hover:text-red-600"
                    >
                      {lang === "th" ? "ล้างทั้งหมด" : "Clear all"}
                    </button>
                  ) : null
                }
              >
                {lang === "th" ? "ใบรับรองมาตรฐานสากล (ISO / CMMI)" : "Certifications & Standards (ISO / CMMI)"}
              </SectionHeading>

              {/* Zone 1: Selected certifications (Option A) */}
              {draft.certifications.length > 0 && (
                <div className="mb-4 rounded-[3px] border border-line bg-surface-2/60 p-3">
                  <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-ink-2">
                    <span className="flex items-center gap-1.5">
                      <span>{lang === "th" ? "มาตรฐานที่คุณเลือกแล้ว" : "Your selected standards"}</span>
                      <span className="inline-flex items-center rounded-full bg-ink px-1.5 py-0.2 font-mono text-[10px] text-surface">
                        {draft.certifications.length}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] text-ink-3">{draft.certifications.length}/30</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {draft.certifications.map((cert) => (
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
                        className="group inline-flex cursor-pointer items-center gap-1.5 rounded-[2px] border border-ink bg-ink px-2.5 py-1 font-mono text-[11px] text-surface transition-colors hover:border-red-600 hover:bg-red-600 hover:text-white"
                      >
                        <span>{cert}</span>
                        <span aria-hidden="true" className="text-[10px] opacity-70 group-hover:opacity-100">
                          ✕
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Zone 2: Available certifications bank */}
              <div className="space-y-1.5">
                <span className="block text-[11px] font-medium text-ink-3">
                  {lang === "th" ? "มาตรฐานสากลทั่วไป (คลิกเพื่อเลือกเพิ่ม):" : "Common standards (click to add):"}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {displayCertifications.map((cert) => {
                    const on = draft.certifications.includes(cert);
                    return (
                      <button
                        key={cert}
                        type="button"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            certifications: toggle(prev.certifications, cert),
                          }))
                        }
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

              {/* Add custom certification input */}
              <div className="mt-3.5 flex max-w-sm items-center gap-2">
                <input
                  type="text"
                  value={customCert}
                  onChange={(e) => setCustomCert(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustomCert();
                    }
                  }}
                  placeholder={
                    lang === "th" ? "เพิ่มมาตรฐานอื่น เช่น PCI DSS, CSA STAR..." : "Add other standard, e.g. PCI DSS..."
                  }
                  className={`${input} text-[12px]`}
                  maxLength={100}
                />
                <button
                  type="button"
                  onClick={handleAddCustomCert}
                  disabled={!customCert.trim() || draft.certifications.length >= 30}
                  className={`${btn.secondary} cursor-pointer shrink-0 text-[12px] disabled:cursor-not-allowed`}
                >
                  {lang === "th" ? "เพิ่ม" : "Add"}
                </button>
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

        {/* Sidebar Summary */}
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
                      <span className="text-[10px] text-ink-3 self-center">
                        +{draft.skills.length - 6}
                      </span>
                    )}
                  </div>
                )}
              </div>

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
                    {draft.certifications.map((cert) => (
                      <span
                        key={cert}
                        className="rounded-[2px] bg-surface-2 border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-2"
                      >
                        {cert}
                      </span>
                    ))}
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

      {/* Floating Unsaved Changes Notification Bar */}
      {isDirty && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 w-[92%] max-w-xl rounded-[4px] border border-line bg-surface/95 dark:bg-surface/95 p-3 sm:px-4 shadow-xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse shrink-0" aria-hidden="true" />
              <span className="text-[13px] font-medium text-ink">
                {lang === "th" ? "คุณมีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก" : "You have unsaved changes"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleReset}
                disabled={saving}
                className="cursor-pointer text-[12.5px] font-medium text-ink-3 underline underline-offset-2 hover:text-ink disabled:opacity-50 transition-colors"
              >
                {lang === "th" ? "ยกเลิก" : "Discard"}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || Boolean(budgetError)}
                className={`${btn.primary} cursor-pointer !h-8 !px-3.5 text-[12.5px]`}
              >
                {saving
                  ? lang === "th"
                    ? "กำลังบันทึก…"
                    : "Saving…"
                  : lang === "th"
                    ? "บันทึกตอนนี้"
                    : "Save now"}
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* In-app Unsaved Changes Popup Modal */}
      {showUnsavedModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="unsaved-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px] animate-in fade-in duration-150"
          onClick={() => {
            setShowUnsavedModal(false);
            setPendingUrl(null);
          }}
        >
          <div
            data-unsaved-modal="true"
            className="relative w-full max-w-md rounded-[4px] border border-line bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setShowUnsavedModal(false);
                setPendingUrl(null);
              }}
              className="cursor-pointer absolute right-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-[3px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
              aria-label={lang === "th" ? "ปิดหน้าต่าง" : "Close modal"}
            >
              ✕
            </button>

            <div className="flex h-11 w-11 items-center justify-center rounded-[3px] border border-line bg-surface-2 text-ink">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
              </svg>
            </div>

            <h3 id="unsaved-modal-title" className="mt-4 text-[17px] font-semibold text-ink">
              {lang === "th" ? "คุณมีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก" : "You have unsaved changes"}
            </h3>

            <p className="mt-2 text-[13px] leading-thai text-ink-2">
              {lang === "th"
                ? "หากคุณออกจากหน้านี้ ข้อมูลความสามารถ งบประมาณ หรือมาตรฐานสากลที่คุณแก้ไขไว้จะสูญหาย ต้องการบันทึกข้อมูลก่อนหรือไม่?"
                : "If you leave this page, your unsaved changes to skills, budget capacity, or certifications will be lost. Would you like to save your changes first?"}
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowUnsavedModal(false);
                  setPendingUrl(null);
                }}
                className={`${btn.secondary} cursor-pointer`}
              >
                {lang === "th" ? "แก้ไขต่อ" : "Keep editing"}
              </button>
              <button
                type="button"
                onClick={handleDiscardAndLeave}
                className="cursor-pointer inline-flex items-center justify-center rounded-[3px] border border-line bg-surface px-3.5 h-9 text-[13px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-200 dark:hover:border-red-900 transition-colors"
              >
                {lang === "th" ? "ละทิ้งข้อมูลและออก" : "Discard & leave"}
              </button>
              <button
                type="button"
                onClick={handleSaveAndLeave}
                disabled={saving || Boolean(budgetError)}
                className={`${btn.primary} cursor-pointer`}
              >
                {saving
                  ? lang === "th"
                    ? "กำลังบันทึก…"
                    : "Saving…"
                  : lang === "th"
                    ? "บันทึกและไปต่อ"
                    : "Save & continue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
