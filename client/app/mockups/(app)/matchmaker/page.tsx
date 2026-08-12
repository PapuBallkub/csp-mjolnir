"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  demoProfile,
  formatTHB,
  techTerms,
  tors,
  type ScopeSize,
  type Tor,
} from "../../_data/tors";
import { useLang } from "../../_components/prefs";
import { TorRow } from "../../_components/tor-row";
import { btn, EmptyState, input, Label, Panel, SectionLabel } from "../../_components/ui";
import { SmeBadge } from "../../_components/verdict";

const SCOPE_OPTIONS: { id: ScopeSize; label: { th: string; en: string } }[] = [
  { id: "solo", label: { th: "ทำคนเดียว", en: "Just me" } },
  { id: "small-team", label: { th: "ทีมเล็ก 2–5 คน", en: "Small team, 2–5" } },
  { id: "firm", label: { th: "บริษัทเต็มรูปแบบ", en: "A full firm" } },
];

type Profile = {
  skills: string[];
  budgetMin: number;
  budgetMax: number;
  scopeSizes: ScopeSize[];
  smeRegistered: boolean;
};

/**
 * FR07, made legible rather than magic: the score is a weighted sum of three
 * things the user can see and change on this screen, and the row below always
 * shows which of the three actually fired.
 */
function computeMatch(tor: Tor, profile: Profile): number {
  const matched = tor.techStack.filter((t) => profile.skills.includes(t)).length;
  const skillFit = tor.techStack.length ? matched / tor.techStack.length : 0;
  const budgetFit = tor.budget >= profile.budgetMin && tor.budget <= profile.budgetMax ? 1 : 0.15;
  const scopeFit = profile.scopeSizes.includes(tor.scopeSize) ? 1 : 0.2;
  const smeBonus = profile.smeRegistered && tor.smeAdvantage ? 6 : 0;

  return Math.min(100, Math.round((skillFit * 55 + budgetFit * 25 + scopeFit * 20) * 1 + smeBonus));
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function MatchmakerPage() {
  const { lang } = useLang();
  const [profile, setProfile] = useState<Profile>({
    skills: demoProfile.skills,
    budgetMin: demoProfile.budgetMin,
    budgetMax: demoProfile.budgetMax,
    scopeSizes: demoProfile.scopeSizes,
    smeRegistered: demoProfile.smeRegistered,
  });

  const scored = useMemo(
    () =>
      tors
        .filter((tor) => tor.status !== "closed")
        .map((tor) => ({ tor: { ...tor, matchScore: computeMatch(tor, profile) } }))
        .sort((a, b) => b.tor.matchScore - a.tor.matchScore),
    [profile],
  );

  const strong = scored.filter((s) => s.tor.matchScore >= 70);
  const smeEligible = scored.filter((s) => profile.smeRegistered && s.tor.smeAdvantage).length;

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6">
      <header className="mb-5">
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">
          {lang === "th" ? "จับคู่งานกับทักษะของคุณ" : "Match projects to your skills"}
        </h1>
        <p className="mt-1 max-w-2xl text-[14px] leading-thai text-ink-2">
          {lang === "th"
            ? "บอกเราว่าคุณทำอะไรได้และรับงานขนาดไหน แล้วเราจะส่งอีเมลเมื่อมีงานที่ตรงประกาศออกมา คะแนนด้านล่างอัปเดตทันทีที่คุณแก้โปรไฟล์"
            : "Tell us what you can build and how big a job you can take. We will email you when something matching is posted — the scores below update as you edit."}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Panel className="flex flex-col gap-4 p-3.5">
            <div className="flex flex-col gap-2">
              <Label>{lang === "th" ? "ทักษะและเทคโนโลยี" : "Skills and technologies"}</Label>
              <div className="flex flex-wrap gap-1.5">
                {techTerms.map((term) => {
                  const on = profile.skills.includes(term);
                  return (
                    <button
                      key={term}
                      type="button"
                      onClick={() =>
                        setProfile({ ...profile, skills: toggle(profile.skills, term) })
                      }
                      aria-pressed={on}
                      className={`rounded-[2px] border px-1.5 py-1 font-mono text-[11px] transition-colors ${
                        on
                          ? "border-ink bg-ink text-surface"
                          : "border-line bg-surface-2 text-ink-3 hover:text-ink"
                      }`}
                    >
                      {term}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] leading-thai text-ink-3">
                {lang === "th"
                  ? `เลือกไว้ ${profile.skills.length} รายการ — แตะเพื่อเปิดหรือปิด`
                  : `${profile.skills.length} selected — tap to toggle.`}
              </p>
            </div>

            <div className="flex flex-col gap-2 border-t border-line pt-3.5">
              <Label>{lang === "th" ? "ช่วงงบที่รับงาน" : "Budget range you take on"}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={profile.budgetMin}
                  step={100_000}
                  min={0}
                  onChange={(e) => setProfile({ ...profile, budgetMin: Number(e.target.value) })}
                  className={`${input} font-mono tnum`}
                  aria-label={lang === "th" ? "งบต่ำสุด" : "Minimum budget"}
                />
                <span className="text-ink-3">–</span>
                <input
                  type="number"
                  value={profile.budgetMax}
                  step={100_000}
                  min={0}
                  onChange={(e) => setProfile({ ...profile, budgetMax: Number(e.target.value) })}
                  className={`${input} font-mono tnum`}
                  aria-label={lang === "th" ? "งบสูงสุด" : "Maximum budget"}
                />
              </div>
              <p className="font-mono tnum text-[11px] text-ink-3">
                {formatTHB(profile.budgetMin)} – {formatTHB(profile.budgetMax)}
              </p>
            </div>

            <div className="flex flex-col gap-2 border-t border-line pt-3.5">
              <Label>{lang === "th" ? "ขนาดงานที่ไหว" : "Size of job you can take"}</Label>
              {SCOPE_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2 hover:text-ink"
                >
                  <input
                    type="checkbox"
                    checked={profile.scopeSizes.includes(option.id)}
                    onChange={() =>
                      setProfile({
                        ...profile,
                        scopeSizes: toggle(profile.scopeSizes, option.id),
                      })
                    }
                    className="h-3.5 w-3.5 accent-ink"
                  />
                  {lang === "th" ? option.label.th : option.label.en}
                </label>
              ))}
            </div>

            <div className="flex flex-col gap-2 border-t border-line pt-3.5">
              <Label>{lang === "th" ? "สถานะผู้ประกอบการ" : "Business status"}</Label>
              <label className="flex cursor-pointer items-start gap-2 text-[13px] leading-thai text-ink-2 hover:text-ink">
                <input
                  type="checkbox"
                  checked={profile.smeRegistered}
                  onChange={() =>
                    setProfile({ ...profile, smeRegistered: !profile.smeRegistered })
                  }
                  className="mt-1 h-3.5 w-3.5 shrink-0 accent-ink"
                />
                <span>
                  {lang === "th"
                    ? "ขึ้นทะเบียน SME กับ สสว. แล้ว"
                    : "Registered as an SME with OSMEP"}
                  <span className="mt-0.5 block text-[11px] text-ink-3">
                    {lang === "th"
                      ? "ใช้ตรวจสิทธิ์แต้มต่อราคาในงานที่เข้าเกณฑ์"
                      : "Used to check price-advantage eligibility on qualifying projects."}
                  </span>
                </span>
              </label>
            </div>
          </Panel>

          <Panel className="flex flex-col gap-2 p-3.5">
            <Label>{lang === "th" ? "แจ้งเตือนงานใหม่" : "Alerts for new matches"}</Label>
            <p className="text-[12px] leading-thai text-ink-2">
              {lang === "th"
                ? "ส่งอีเมลเมื่อมีงานที่ได้คะแนน 70 ขึ้นไป ประกาศออกมาใหม่"
                : "Email me when a project scoring 70 or higher is posted."}
            </p>
            <Link href="/mockups/notifications" className={`${btn.secondary} w-full`}>
              {lang === "th" ? "ตั้งค่าการแจ้งเตือน" : "Notification settings"}
            </Link>
          </Panel>
        </div>

        <div className="min-w-0 flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              {
                value: strong.length,
                label:
                  lang === "th" ? "งานที่ตรงมาก (70 ขึ้นไป)" : "Strong matches (70+)",
              },
              {
                value: scored.length,
                label: lang === "th" ? "งานที่ยังเปิดรับอยู่" : "Projects still open",
              },
              {
                value: smeEligible,
                label: lang === "th" ? "งานที่ได้แต้มต่อ SME" : "With SME advantage",
              },
            ].map((stat) => (
              <Panel key={stat.label} className="px-3.5 py-3">
                <p className="font-mono tnum text-[26px] leading-none font-medium text-ink">
                  {stat.value}
                </p>
                <p className="mt-1.5 text-[12px] leading-thai text-ink-3">{stat.label}</p>
              </Panel>
            ))}
          </div>

          <SectionLabel
            right={
              profile.smeRegistered ? (
                <span className="flex items-center gap-1.5">
                  <SmeBadge lang={lang} />
                </span>
              ) : null
            }
          >
            {lang === "th" ? "เรียงตามความตรงกับคุณ" : "Ranked for you"}
          </SectionLabel>

          {scored.length === 0 || profile.skills.length === 0 ? (
            <EmptyState
              headline={
                lang === "th"
                  ? "ยังจับคู่ไม่ได้ เพราะยังไม่ได้เลือกทักษะ"
                  : "We cannot rank anything until you pick some skills"
              }
              body={
                lang === "th"
                  ? "เลือกอย่างน้อยหนึ่งเทคโนโลยีที่คุณทำได้ทางด้านซ้าย แล้วรายการจะเรียงใหม่ให้ทันที"
                  : "Choose at least one technology on the left and this list re-ranks immediately."
              }
            />
          ) : (
            <Panel className="overflow-hidden">
              {scored.map(({ tor }) => (
                <TorRow key={tor.id} tor={tor} showMatch />
              ))}
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
