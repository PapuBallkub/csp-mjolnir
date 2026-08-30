"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  formatTHB,
  isDead,
  matchScore,
  pick,
  techTerms,
  tors,
  type ScopeSize,
} from "../../_data/tors";
import { useLang, useProfile } from "../../_components/prefs";
import { MatchScore, SmeBadge } from "../../_components/verdict";
import { btn, Eyebrow, input, Label, Panel, SectionHeading } from "../../_components/ui";

const SCOPE_OPTIONS: {
  id: ScopeSize;
  label: { th: string; en: string };
  note: { th: string; en: string };
}[] = [
  {
    id: "small-team",
    label: { th: "ทีมเล็ก 2–5 คน", en: "Small team, 2–5" },
    note: {
      th: "งานตั้งแต่หลักแสนถึงราว 5 ล้านบาท",
      en: "Anything from a few hundred thousand up to about ฿5M",
    },
  },
  {
    id: "firm",
    label: { th: "บริษัทเต็มรูปแบบ", en: "A full firm" },
    note: { th: "งานใหญ่ ต้องมีทีมประจำและทุนหมุนเวียน", en: "Large work needing staff and capital" },
  },
];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/**
 * Where the user describes themselves once. Everything the matcher knows comes
 * from this screen, so it also shows what that description currently buys —
 * the live count and the top three fits — rather than making the user go and
 * find out.
 */
export default function ProfilePage() {
  const { lang } = useLang();
  const { profile, setProfile } = useProfile();

  const ranked = useMemo(
    () =>
      tors
        .filter((tor) => !isDead(tor.status))
        .map((tor) => ({ tor, score: matchScore(tor, profile) }))
        .sort((a, b) => b.score - a.score),
    [profile],
  );
  const strong = ranked.filter((row) => row.score >= 70);
  const smeEligible = ranked.filter((row) => profile.smeRegistered && row.tor.smeAdvantage).length;

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6">
      <header className="mb-5">
        <Eyebrow>{lang === "th" ? "โปรไฟล์ของคุณ" : "Your profile"}</Eyebrow>
        <h1 className="mt-1 text-[26px] leading-tight font-semibold tracking-tight text-ink">
          {lang === "th" ? "บอกเราว่าคุณทำอะไรได้" : "Tell us what you can build"}
        </h1>
        <p className="mt-1 max-w-2xl text-[14px] leading-thai text-ink-2">
          {lang === "th"
            ? "ข้อมูลนี้ใช้จัดอันดับงานในหน้าค้นหา และใช้ตัดสินใจว่าจะส่งอีเมลแจ้งเตือนงานไหนถึงคุณ แก้ได้ทุกเมื่อ ผลจะเปลี่ยนทันที"
            : "This is what ranks the browse list and decides which projects are worth emailing you about. Change it whenever — the results update immediately."}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-5">
          <Panel className="px-4 py-5 sm:px-6 sm:py-6">
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
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className={input}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <Label>{lang === "th" ? "อีเมล" : "Email"}</Label>
                  <input
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className={`${input} font-mono`}
                  />
                </label>
              </div>
            </section>

            <section className="mt-9">
              <SectionHeading
                sub={
                  lang === "th"
                    ? `เลือกไว้ ${profile.skills.length} รายการ — แตะเพื่อเปิดหรือปิด ยิ่งตรงกับที่ TOR ระบุ คะแนนยิ่งสูง`
                    : `${profile.skills.length} selected — tap to toggle. The more a TOR's stack overlaps this, the higher it ranks.`
                }
                right={
                  profile.skills.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setProfile({ ...profile, skills: [] })}
                      className="text-[13px] text-ink-3 underline underline-offset-2 hover:text-ink"
                    >
                      {lang === "th" ? "ล้างทั้งหมด" : "Clear all"}
                    </button>
                  ) : null
                }
              >
                {lang === "th" ? "ทักษะและเทคโนโลยี" : "Skills and technologies"}
              </SectionHeading>
              <div className="flex flex-wrap gap-1.5">
                {techTerms.map((term) => {
                  const on = profile.skills.includes(term);
                  return (
                    <button
                      key={term}
                      type="button"
                      onClick={() => setProfile({ ...profile, skills: toggle(profile.skills, term) })}
                      aria-pressed={on}
                      className={`rounded-[2px] border px-2.5 py-1.5 font-mono text-[13px] transition-colors ${
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
            </section>

            <section className="mt-9">
              <SectionHeading
                sub={
                  lang === "th"
                    ? "งานที่ราคากลางอยู่นอกช่วงนี้จะถูกลดคะแนนลง ไม่ได้ซ่อนทิ้ง"
                    : "Projects outside this range are scored down, not hidden."
                }
              >
                {lang === "th" ? "ช่วงงบที่คุณรับงาน" : "Budget range you take on"}
              </SectionHeading>
              <div className="flex max-w-md items-center gap-2">
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
              <p className="mt-2 font-mono tnum text-[14px] text-ink-2">
                {formatTHB(profile.budgetMin)} – {formatTHB(profile.budgetMax)}
              </p>
            </section>

            <section className="mt-9">
              <SectionHeading
                sub={
                  lang === "th"
                    ? "ใช้ตัดงานที่ขอบเขตใหญ่เกินกำลังออกจากอันดับต้น ๆ"
                    : "Keeps work that needs a bigger outfit than yours out of the top of the list."
                }
              >
                {lang === "th" ? "ขนาดงานที่ไหว" : "Size of job you can take"}
              </SectionHeading>
              <div className="flex flex-col gap-2">
                {SCOPE_OPTIONS.map((option) => (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-start gap-2.5 rounded-[3px] border border-line bg-surface-2 px-3 py-2.5 hover:border-line-2"
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
                      className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-ink"
                    />
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium text-ink">
                        {pick(option.label, lang)}
                      </span>
                      <span className="mt-0.5 block text-[14px] leading-thai text-ink-2">
                        {pick(option.note, lang)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section className="mt-9">
              <SectionHeading>
                {lang === "th" ? "สถานะผู้ประกอบการ" : "Business status"}
              </SectionHeading>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-[3px] border border-line bg-surface-2 px-3 py-2.5 hover:border-line-2">
                <input
                  type="checkbox"
                  checked={profile.smeRegistered}
                  onChange={() => setProfile({ ...profile, smeRegistered: !profile.smeRegistered })}
                  className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-ink"
                />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-ink">
                    {lang === "th"
                      ? "ขึ้นทะเบียน SME กับ สสว. แล้ว"
                      : "Registered as an SME with OSMEP"}
                  </span>
                  <span className="mt-0.5 block text-[14px] leading-thai text-ink-2">
                    {lang === "th"
                      ? "ใช้ตรวจสิทธิ์แต้มต่อด้านราคาในงานที่เข้าเกณฑ์ และเพิ่มคะแนนให้งานเหล่านั้น"
                      : "Checks price-advantage eligibility on qualifying projects and scores them higher."}
                  </span>
                </span>
              </label>
            </section>
          </Panel>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btn.primary}>
              {lang === "th" ? "บันทึกโปรไฟล์" : "Save profile"}
            </button>
            <Link href="/mockups/notifications" className={btn.secondary}>
              {lang === "th" ? "ตั้งค่าการแจ้งเตือน" : "Notification settings"}
            </Link>
          </div>
        </div>

        <aside className="lg:sticky lg:top-[70px] lg:self-start">
          <Panel className="overflow-hidden">
            <div className="border-b border-line bg-surface-2 px-4 py-3">
              <h2 className="text-[14px] font-semibold text-ink">
                {lang === "th" ? "โปรไฟล์นี้ให้ผลอย่างไร" : "What this profile finds you"}
              </h2>
              <p className="mt-0.5 text-[14px] leading-thai text-ink-2">
                {lang === "th"
                  ? "คำนวณสดจากประกาศที่ยังยื่นได้อยู่"
                  : "Computed live against everything you can still bid on."}
              </p>
            </div>

            <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
              <div className="px-4 py-3">
                <p className="font-mono tnum text-[24px] leading-none font-medium text-ink">
                  {strong.length}
                </p>
                <p className="mt-1.5 text-[13px] leading-thai text-ink-2">
                  {lang === "th" ? "งานที่ตรงมาก (70+)" : "Strong matches (70+)"}
                </p>
              </div>
              <div className="px-4 py-3">
                <p className="font-mono tnum text-[24px] leading-none font-medium text-ink">
                  {smeEligible}
                </p>
                <p className="mt-1.5 text-[13px] leading-thai text-ink-2">
                  {lang === "th" ? "งานที่ได้แต้มต่อ SME" : "With SME advantage"}
                </p>
              </div>
            </div>

            <div className="flex flex-col">
              {ranked.slice(0, 3).map(({ tor, score }) => (
                <Link
                  key={tor.id}
                  href={`/mockups/tor/${tor.id}`}
                  className="border-b border-line px-4 py-3 transition-colors hover:bg-surface-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono tnum text-[13px] text-ink-3">{tor.id}</span>
                    <MatchScore score={score} lang={lang} />
                  </div>
                  <p className="mt-1 text-[14px] leading-thai text-ink">{pick(tor.title, lang)}</p>
                </Link>
              ))}
            </div>

            <div className="px-4 py-3">
              {profile.smeRegistered ? (
                <div className="mb-3">
                  <SmeBadge lang={lang} />
                </div>
              ) : null}
              <Link href="/mockups/catalog" className={`${btn.secondary} w-full`}>
                {lang === "th" ? "ดูรายการที่ตรงทั้งหมด" : "See every match"}
              </Link>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
