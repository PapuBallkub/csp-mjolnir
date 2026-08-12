"use client";

import { useState } from "react";
import { formatTHBCompact, pick, tors } from "../../_data/tors";
import { useLang } from "../../_components/prefs";
import { btn, input, Label, Panel, SectionLabel } from "../../_components/ui";
import { LockSpecBadge, StatusBadge } from "../../_components/verdict";
import { Wordmark } from "../../_components/shell";

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
  const [consent, setConsent] = useState(true);
  const [events, setEvents] = useState({
    newMatch: true,
    amended: true,
    closed: true,
    deadline: true,
    priceOutlier: false,
  });
  const [frequency, setFrequency] = useState("daily");
  const [searches, setSearches] = useState([
    { id: "s1", query: "Next.js · ต่ำกว่า 2 ล้าน · ทำคนเดียวไหว", on: true },
    { id: "s2", query: "LINE Messaging API · สำนักงานเขต", on: true },
    { id: "s3", query: "HL7 FHIR · สำนักการแพทย์", on: false },
  ]);

  const sample = tors[0];

  const EVENTS: { id: keyof typeof events; label: { th: string; en: string }; desc: { th: string; en: string } }[] =
    [
      {
        id: "newMatch",
        label: { th: "มีงานใหม่ที่ตรงกับโปรไฟล์", en: "A new project matches my profile" },
        desc: {
          th: "ส่งเมื่อคะแนนความตรง 70 ขึ้นไป",
          en: "Sent when the match score is 70 or above.",
        },
      },
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
            <div className="flex flex-wrap items-center gap-2">
              <input
                defaultValue="suchart.w@example.co.th"
                className={`${input} max-w-xs font-mono`}
                aria-label={lang === "th" ? "อีเมล" : "Email address"}
              />
              <span className="rounded-[2px] border border-open-line bg-open-bg px-1.5 py-[3px] text-[11px] font-medium text-open">
                {lang === "th" ? "ยืนยันแล้ว" : "Verified"}
              </span>
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

          <Panel className={`p-3.5 ${consent ? "" : "pointer-events-none opacity-50"}`}>
            <Label>{lang === "th" ? "แจ้งเตือนเมื่อ" : "Tell me when"}</Label>
            <div className="mt-1 divide-y divide-line">
              {EVENTS.map((event) => (
                <Switch
                  key={event.id}
                  checked={events[event.id]}
                  onChange={() => setEvents({ ...events, [event.id]: !events[event.id] })}
                  label={pick(event.label, lang)}
                  description={pick(event.desc, lang)}
                  disabled={!consent}
                />
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
                    onChange={() => setFrequency(option.id)}
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

          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn.primary}>
              {lang === "th" ? "บันทึกการตั้งค่า" : "Save preferences"}
            </button>
            <button type="button" className={btn.ghost}>
              {lang === "th" ? "หยุดส่งอีเมลทั้งหมด" : "Turn off all email"}
            </button>
          </div>
        </div>

        <aside className="flex flex-col gap-3">
          <SectionLabel>{lang === "th" ? "ตัวอย่างอีเมล" : "What the email looks like"}</SectionLabel>
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
                <StatusBadge status={sample.status} lang={lang} />
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
