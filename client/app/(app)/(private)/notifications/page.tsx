"use client";

import { useState } from "react";
import { formatTHBCompact, pick, tors } from "../../../_data/tors";
import { useAuthedUser } from "../../../_components/auth";
import { useLang, useProfile } from "../../../_components/prefs";
import { btn, input, Label, Panel, SectionHeading } from "../../../_components/ui";
import { LockSpecBadge, StatusBadge } from "../../../_components/verdict";
import { Wordmark } from "../../../_components/shell";

function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 py-2.5 ${
        disabled ? "cursor-not-allowed opacity-40" : ""
      }`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
        className={`mt-0.5 flex h-[18px] w-[30px] shrink-0 items-center rounded-full border p-[2px] transition-colors ${
          checked ? "border-ink bg-ink" : "border-line-2 bg-surface-2"
        }`}
      >
        <span
          className={`h-3 w-3 rounded-full transition-transform ${
            checked ? "translate-x-[12px] bg-surface" : "translate-x-0 bg-ink-3"
          }`}
        />
      </button>
      <span className="min-w-0">
        <span className="block text-[13px] leading-thai text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[12px] leading-thai text-ink-3">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

export default function NotificationsPage() {
  const { lang } = useLang();
  const user = useAuthedUser();
  const { profile, saveProfile, saving } = useProfile();

  const [consent, setConsent] = useState(user.notificationConsent);
  const [minScore, setMinScore] = useState<number>(profile.matchNotification?.minScore ?? 75);
  const [includeSubcontract, setIncludeSubcontract] = useState<boolean>(
    profile.matchNotification?.includeSubcontract ?? true
  );
  const [events, setEvents] = useState({
    newMatch: profile.matchNotification?.enabled ?? true,
    amended: true,
    closed: true,
    deadline: true,
    priceOutlier: false,
  });
  const [frequency, setFrequency] = useState<"instant" | "daily" | "weekly">(
    profile.matchNotification?.frequency ?? "daily"
  );
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [searches, setSearches] = useState([
    { id: "s1", query: "Next.js · ต่ำกว่า 2 ล้าน · ทำคนเดียวไหว", on: true },
    { id: "s2", query: "LINE Messaging API · สำนักงานเขต", on: true },
    { id: "s3", query: "HL7 FHIR · สำนักการแพทย์", on: false },
  ]);

  const sample = tors[0];

  async function handleSave() {
    setSaveStatus("idle");
    const error = await saveProfile({
      matchNotification: {
        enabled: consent && events.newMatch,
        minScore,
        frequency,
        includeSubcontract,
      },
    });
    if (error) {
      setSaveStatus("error");
    } else {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3500);
    }
  }

  async function handleTurnOffAll() {
    setConsent(false);
    setEvents((prev) => ({ ...prev, newMatch: false }));
    const error = await saveProfile({
      matchNotification: {
        enabled: false,
        minScore,
        frequency,
        includeSubcontract,
      },
    });
    if (!error) {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3500);
    }
  }

  const EVENTS: { id: "amended" | "closed" | "deadline" | "priceOutlier"; label: { th: string; en: string }; desc: { th: string; en: string } }[] =
    [
      {
        id: "amended",
        label: { th: "TOR ที่ติดตามถูกแก้ไข", en: "A watched TOR was amended" },
        desc: {
          th: "รวมสรุปว่าข้อไหนเปลี่ยน ไม่ต้องเปิดไฟล์เทียบเอง",
          en: "Includes a summary of exactly which clauses moved.",
        },
      },
      {
        id: "closed",
        label: { th: "TOR ที่ติดตามปิดรับหรือประกาศผู้ชนะ", en: "A watched TOR closed or was awarded" },
        desc: { th: "จะได้หยุดเตรียมเอกสารทันที", en: "So you stop preparing immediately." },
      },
      {
        id: "deadline",
        label: { th: "เตือนก่อนปิดรับ 3 วัน", en: "Three days before a deadline" },
        desc: { th: "เฉพาะงานที่บันทึกไว้", en: "Saved projects only." },
      },
      {
        id: "priceOutlier",
        label: { th: "พบราคาผิดปกติในหมวดที่สนใจ", en: "A price anomaly in a category I follow" },
        desc: {
          th: "เหมาะกับผู้ที่ติดตามเชิงตรวจสอบมากกว่าผู้เสนอราคา",
          en: "More useful for watchdog reading than for bidding.",
        },
      },
    ];

  const FREQUENCIES = [
    { id: "instant", label: { th: "ส่งทันทีที่เกิดเหตุการณ์", en: "As it happens" } },
    { id: "daily", label: { th: "สรุปรายวัน 08:00 น.", en: "Daily digest, 08:00" } },
    { id: "weekly", label: { th: "สรุปรายสัปดาห์ ทุกวันจันทร์", en: "Weekly digest, Mondays" } },
  ];

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6">
      <header className="mb-5">
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">
          {lang === "th" ? "การแจ้งเตือนทางอีเมล" : "Email notifications"}
        </h1>
        <p className="mt-1 max-w-2xl text-[14px] leading-thai text-ink-2">
          {lang === "th"
            ? "เราส่งอีเมลเฉพาะที่คุณเลือกไว้เท่านั้น และหยุดส่งได้ทุกเมื่อ"
            : "We only send what you ask for here, and you can stop it at any time."}
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <Panel className="flex flex-col gap-3 p-3.5">
            <Label>{lang === "th" ? "ส่งไปที่" : "Send to"}</Label>
            {/*
              The account's address, read-only: there is no endpoint to change
              it. The "Verified" badge that used to sit here was removed rather
              than wired up — nothing in this system verifies an email, so it
              asserted something that was never true.
            */}
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={user.email}
                readOnly
                className={`${input} max-w-xs font-mono text-ink-2`}
                aria-label={lang === "th" ? "อีเมล" : "Email address"}
              />
            </div>
          </Panel>

          <Panel className="p-3.5">
            <Switch
              checked={consent}
              onChange={() => setConsent(!consent)}
              label={
                lang === "th"
                  ? "ยินยอมให้ส่งอีเมลแจ้งเตือนถึงฉัน"
                  : "I consent to receiving notification emails"
              }
              description={
                lang === "th"
                  ? "เราเก็บอีเมลไว้เพื่อส่งการแจ้งเตือนนี้เท่านั้น ไม่ส่งต่อให้บุคคลที่สาม และถอนความยินยอมได้ทุกเมื่อตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล"
                  : "Your address is stored only to send these alerts, is never shared, and consent can be withdrawn at any time under Thailand's PDPA."
              }
            />
          </Panel>

          {/* Profile Match Notification Settings */}
          <Panel className={`p-3.5 ${consent ? "" : "pointer-events-none opacity-50"}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Label>{lang === "th" ? "การแจ้งเตือนงานที่ตรงกับคุณ" : "Job match alerts"}</Label>
                <p className="mt-1 text-[12px] leading-thai text-ink-3">
                  {lang === "th"
                    ? "แจ้งเตือนทางอีเมลเมื่อมีประกาศ TOR ใหม่ที่ประเมินคะแนนความตรงกับโปรไฟล์ของคุณถึงเกณฑ์ที่กำหนด"
                    : "Email alerts when newly published TOR notices match your capability profile."}
                </p>
              </div>
              <Switch
                checked={events.newMatch}
                onChange={() => {
                  const next = !events.newMatch;
                  setEvents((prev) => ({ ...prev, newMatch: next }));
                  if (next && !consent) setConsent(true);
                }}
                label=""
                disabled={!consent}
              />
            </div>

            {events.newMatch && (
              <div className="mt-3.5 space-y-3.5 border-t border-line pt-3">
                <div>
                  <Label>
                    {lang === "th"
                      ? "เกณฑ์คะแนนความตรงขั้นต่ำที่จะแจ้งเตือน"
                      : "Minimum match score threshold"}
                  </Label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {[
                      { score: 85, label: { th: "85+ ขึ้นไป (ตรงมากเท่านั้น)", en: "85+ (Strong fits only)" } },
                      { score: 75, label: { th: "75+ ขึ้นไป (แนะนำ)", en: "75+ (Recommended)" } },
                      { score: 60, label: { th: "60+ ขึ้นไป (ครอบคลุม)", en: "60+ (Broad discovery)" } },
                    ].map((option) => (
                      <button
                        key={option.score}
                        type="button"
                        onClick={() => setMinScore(option.score)}
                        className={`rounded-[3px] border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                          minScore === option.score
                            ? "border-ink bg-ink text-surface font-semibold"
                            : "border-line bg-surface text-ink-2 hover:border-line-2 hover:text-ink"
                        }`}
                      >
                        {option.label[lang]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>
                    {lang === "th" ? "โอกาสร่วมงานและรับเหมาช่วง" : "Subcontracting & Joint Venture"}
                  </Label>
                  <label className="mt-1.5 flex items-start gap-2.5 cursor-pointer text-[12px] leading-thai text-ink-2 hover:text-ink">
                    <input
                      type="checkbox"
                      checked={includeSubcontract}
                      onChange={(e) => setIncludeSubcontract(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 rounded-[2px] accent-ink shrink-0"
                    />
                    <span>
                      {lang === "th"
                        ? "รวมงานที่เหมาะกับการรับเหมาช่วง (Subcontract) หรือกิจการร่วมค้า (Joint Venture) แม้โครงการหลักจะกำหนดเฉพาะนิติบุคคล"
                        : "Include opportunities suitable for Subcontracting or Joint Venture even if TOR specifies juristic company"}
                    </span>
                  </label>
                </div>
              </div>
            )}
          </Panel>

          <Panel className={`p-3.5 ${consent ? "" : "pointer-events-none opacity-50"}`}>
            <Label>{lang === "th" ? "แจ้งเตือนโครงการที่ติดตาม (Watchlist)" : "Watched projects & watchlist alerts"}</Label>
            <div className="mt-1 divide-y divide-line">
              {EVENTS.map((event) => (
                <div key={event.id} className="py-0.5">
                  <Switch
                    checked={events[event.id]}
                    onChange={() => setEvents({ ...events, [event.id]: !events[event.id] })}
                    label={pick(event.label, lang)}
                    description={pick(event.desc, lang)}
                    disabled={!consent}
                  />
                </div>
              ))}
            </div>
          </Panel>

          <Panel className={`p-3.5 ${consent ? "" : "pointer-events-none opacity-50"}`}>
            <Label>{lang === "th" ? "ความถี่" : "How often"}</Label>
            <div className="mt-2 flex flex-col gap-2">
              {FREQUENCIES.map((option) => (
                <label
                  key={option.id}
                  className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2 hover:text-ink"
                >
                  <input
                    type="radio"
                    name="frequency"
                    checked={frequency === option.id}
                    onChange={() => setFrequency(option.id as "instant" | "daily" | "weekly")}
                    className="h-3.5 w-3.5 accent-ink"
                  />
                  {pick(option.label, lang)}
                </label>
              ))}
            </div>
            <p className="mt-2 text-[12px] leading-thai text-ink-3">
              {lang === "th"
                ? "การแก้ไข TOR ที่คุณติดตามจะส่งทันทีเสมอ ไม่ว่าตั้งค่าความถี่ไว้แบบใด เพราะมักกระทบกำหนดยื่นข้อเสนอ"
                : "Amendments to a watched TOR always send immediately regardless of this setting — they usually affect the deadline."}
            </p>
          </Panel>

          <Panel className={`p-3.5 ${consent ? "" : "pointer-events-none opacity-50"}`}>
            <Label>{lang === "th" ? "การค้นหาที่บันทึกไว้" : "Saved searches"}</Label>
            <div className="mt-1 divide-y divide-line">
              {searches.map((search) => (
                <Switch
                  key={search.id}
                  checked={search.on}
                  onChange={() =>
                    setSearches(
                      searches.map((s) => (s.id === search.id ? { ...s, on: !s.on } : s)),
                    )
                  }
                  label={search.query}
                  disabled={!consent}
                />
              ))}
            </div>
          </Panel>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className={btn.primary}
              >
                {saving
                  ? lang === "th" ? "กำลังบันทึก…" : "Saving…"
                  : lang === "th" ? "บันทึกการตั้งค่า" : "Save preferences"}
              </button>
              <button
                type="button"
                onClick={handleTurnOffAll}
                disabled={saving}
                className={btn.ghost}
              >
                {lang === "th" ? "หยุดส่งอีเมลทั้งหมด" : "Turn off all email"}
              </button>
            </div>

            {saveStatus === "saved" && (
              <div className="flex items-center gap-2 rounded-[3px] border border-green-200 bg-green-50/80 px-3 py-2 text-[13px] font-medium text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
                <span>✓</span>
                <span>
                  {lang === "th"
                    ? "บันทึกการตั้งค่าการแจ้งเตือนเรียบร้อยแล้ว"
                    : "Notification preferences saved successfully"}
                </span>
              </div>
            )}
            {saveStatus === "error" && (
              <div className="flex items-center gap-2 rounded-[3px] border border-red-200 bg-red-50/80 px-3 py-2 text-[13px] font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                <span>⚠️</span>
                <span>
                  {lang === "th"
                    ? "เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่อีกครั้ง"
                    : "Failed to save preferences. Please try again."}
                </span>
              </div>
            )}
          </div>
        </div>

        <aside className="flex flex-col gap-3">
          <SectionHeading>{lang === "th" ? "ตัวอย่างอีเมล" : "What the email looks like"}</SectionHeading>
          <Panel className="overflow-hidden">
            <div className="border-b border-line bg-surface-2 px-3 py-2">
              <Wordmark />
              <p className="mt-1.5 text-[12px] leading-thai font-medium text-ink">
                {lang === "th"
                  ? "TOR ที่คุณติดตามถูกแก้ไข"
                  : "A TOR you follow has been amended"}
              </p>
            </div>
            <div className="flex flex-col gap-2 px-3 py-3">
              <p className="font-mono tnum text-[10px] text-ink-3">{sample.id}</p>
              <p className="text-[13px] leading-thai font-medium text-ink">
                {pick(sample.title, lang)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge status={sample.status} isAmended={sample.isAmended} lang={lang} />
                <LockSpecBadge
                  level={sample.lockSpec.level}
                  score={sample.lockSpec.score}
                  lang={lang}
                  showScore={false}
                />
              </div>
              <p className="text-[12px] leading-thai text-ink-2">
                {lang === "th"
                  ? "ประสบการณ์ที่กำหนดเพิ่มจาก 3 ปี เป็น 10 ปี และตัดคำว่า “หรือเทียบเท่า” ออก"
                  : "Required experience went from 3 years to 10, and “or equivalent” was struck out."}
              </p>
              <p className="font-mono tnum text-[11px] text-ink-3">
                {lang === "th" ? "ราคากลาง" : "Reference price"} {formatTHBCompact(sample.budget)}
              </p>
              <span className={`${btn.primary} w-full`}>
                {lang === "th" ? "ดูสิ่งที่เปลี่ยน" : "See what changed"}
              </span>
              <p className="text-[10px] leading-thai text-ink-3">
                {lang === "th"
                  ? "คุณได้รับอีเมลนี้เพราะบันทึกโครงการไว้ติดตาม · ยกเลิกการรับอีเมล"
                  : "You get this because you saved this project · unsubscribe"}
              </p>
            </div>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
