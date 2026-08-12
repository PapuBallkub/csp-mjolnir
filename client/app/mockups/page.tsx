"use client";

import Link from "next/link";
import { tors } from "./_data/tors";
import { useLang, LangToggle, ThemeToggle } from "./_components/prefs";
import { Wordmark } from "./_components/shell";
import { AccentPanel, Chip, Eyebrow, Panel, SectionHeading, Well } from "./_components/ui";
import {
  LockSpecBadge,
  MatchScore,
  PriceBadge,
  RiskMeter,
  ScopeBadge,
  SmeBadge,
  StatusBadge,
} from "./_components/verdict";

/**
 * Cover page for the mockup set. It is about the mockups rather than part of
 * the product, so it deliberately looks different from the app shell — and it
 * carries the US/FR traceability the proposal's "Project UI Mockups" section
 * needs.
 */

const SCREENS = [
  {
    href: "/mockups/catalog",
    title: { th: "ค้นหาประกาศ TOR", en: "Browse" },
    note: {
      th: "หน้าเดียวสองโหมด — กรองเองตามเทคโนโลยี งบ กำหนดยื่น หน่วยงาน หรือให้ระบบจัดอันดับจากโปรไฟล์ สถานะอ่านได้ในแถวเดียว",
      en: "One list, two modes — filter it by hand, or let the profile rank it. Status is readable in a single row either way.",
    },
    us: ["US1", "US3", "US6", "US9", "US11"],
    fr: ["FR06", "FR07", "FR09"],
  },
  {
    href: `/mockups/tor/${tors[0].id}`,
    title: { th: "รายละเอียด TOR ที่ถอดความแล้ว", en: "Normalized TOR detail" },
    note: {
      th: "หน้าหลักของผลิตภัณฑ์ สรุปทั้งฉบับเป็นแผ่นเดียว แล้วให้โมดูลความเสี่ยงสามชุดเป็นบล็อกแยกที่ติดสีคำตัดสินของตัวเอง",
      en: "The core screen: the whole document as one clean sheet, then three risk modules as separate blocks, each wearing its own verdict colour.",
    },
    us: ["US2", "US7", "US8", "US13"],
    fr: ["FR05", "FR10", "FR12", "FR13"],
  },
  {
    href: "/mockups/profile",
    title: { th: "โปรไฟล์และทักษะ", en: "Profile and skills" },
    note: {
      th: "ที่เดียวที่ผู้ใช้อธิบายตัวเอง ทักษะ ช่วงงบ ขนาดงาน และสถานะ SME พร้อมแสดงผลลัพธ์สดว่าโปรไฟล์นี้หางานได้กี่รายการ",
      en: "The one place the user describes themselves — skills, budget, scope, SME status — showing live what that description currently finds.",
    },
    us: ["US3"],
    fr: ["FR07"],
  },
  {
    href: "/mockups/watchlist",
    title: { th: "รายการที่ติดตาม", en: "Watchlist and alerts" },
    note: {
      th: "โครงการที่บันทึกไว้ พร้อมฟีดสิ่งที่เปลี่ยนตั้งแต่ครั้งก่อน",
      en: "Saved projects, led by a feed of what changed since you last looked.",
    },
    us: ["US10", "US11"],
    fr: ["FR11"],
  },
  {
    href: "/mockups/notifications",
    title: { th: "ตั้งค่าการแจ้งเตือน", en: "Notification preferences" },
    note: {
      th: "ความยินยอมเป็นสวิตช์หลัก ปิดแล้วส่วนอื่นปิดตาม พร้อมตัวอย่างอีเมลจริง",
      en: "Consent is the master switch — turn it off and the rest goes with it — plus a preview of the actual email.",
    },
    us: ["US4"],
    fr: ["FR08"],
  },
  {
    href: "/mockups/auth",
    title: { th: "เข้าสู่ระบบ / สมัครใช้งาน", en: "Sign in and sign up" },
    note: {
      th: "อีเมลกับรหัสผ่าน และเข้าด้วยบัญชี Google เป็นหน้าใช้งาน ไม่ใช่หน้าโชว์ดีไซน์",
      en: "Email and password, or Google. A utility screen, not a showcase.",
    },
    us: ["US4", "US5"],
    fr: [],
  },
  {
    href: "/mockups/watchdog",
    title: { th: "มุมมองผู้ตรวจสอบ", en: "Watchdog view" },
    note: {
      th: "ส่วนต่างจากค่ากลางย้อนหลัง ตัวเปรียบเทียบฉบับแก้ไข และผลประมูลที่ปิดแล้ว",
      en: "Deviation from historical medians, an amendment diff viewer, and closed-award ratios.",
    },
    us: ["US12", "US13"],
    fr: ["FR10", "FR12"],
  },
  {
    href: "/mockups/admin",
    title: { th: "แดชบอร์ดผู้ดูแลระบบ", en: "Admin dashboard" },
    note: {
      th: "สถานะตัวเก็บข้อมูลรายแหล่ง พร้อมคิวตรวจทานคะแนนความมั่นใจและเครื่องมือแก้ไข",
      en: "Per-source scraper health, plus a confidence review queue with correction tools.",
    },
    us: ["US15", "US16", "US17"],
    fr: ["FR14", "FR15"],
  },
];

const PRINCIPLES = [
  {
    title: { th: "ชั้นคำตัดสินคือเอกลักษณ์", en: "The verdict layer is the identity" },
    body: {
      th: "สถานะ ความเสี่ยงล็อกสเปก และการตรวจราคา เรียงลำดับเดิมทุกหน้า และเมื่อคำตัดสินผูกกับเนื้อหาก้อนไหน ก้อนนั้นจะติดแถบสีที่ขอบซ้ายเสมอ เป็นแถบเดียวกับที่ใช้ในหน้ารายการ",
      en: "Status, lock-spec and price sit in that fixed order everywhere. When a verdict attaches to a block of content, that block wears the rail on its left edge — the same rail the browse rows use.",
    },
  },
  {
    title: { th: "สีมีความหมายเสมอ", en: "Colour always means something" },
    body: {
      th: "โครงหน้าเป็นสีเทาดำล้วน สีสดสงวนไว้ให้สัญญาณเท่านั้น เขียวคือไปต่อ เหลืองคือดูให้ดี แดงคือเสียเวลาเปล่า เทาคือจบแล้ว และทุกป้ายมีสัญลักษณ์กับคำกำกับเสมอ อ่านได้แม้พิมพ์ขาวดำ",
      en: "The chrome is monochrome graphite; saturated colour is reserved for signal — green go, amber look closer, crimson this will cost you, grey dead. Every badge also carries a glyph and a word, so it survives greyscale.",
    },
  },
  {
    title: { th: "โครงสร้างมาจากลำดับ ไม่ใช่เส้นคั่น", en: "Structure comes from rank, not rules" },
    body: {
      th: "หัวข้อจริงและจังหวะช่องไฟเป็นตัวบอกโครงสร้าง ไม่ใช่เส้นบาง ๆ ระยะห่างในกลุ่มเดียวกันแคบ ระหว่างกลุ่มกว้างอย่างเห็นได้ชัด และใช้พื้นผิวอ่อนเฉพาะกับของที่เป็นคนละชนิดจริง ๆ",
      en: "Real headings and an uneven spacing rhythm carry the structure, not hairlines. Tight inside a group, conspicuously loose between them, with a tinted well only where the content really is a different kind of thing.",
    },
  },
  {
    title: { th: "ความหนาแน่นตามงาน", en: "Density follows the task" },
    body: {
      th: "หน้ารายการออกแบบให้กวาดตาเร็วเหมือนเว็บหางาน หน้ารายละเอียดให้พื้นที่หายใจเพราะเป็นการอ่านเพื่อตัดสินใจ แต่ยังคงแน่นและมีโครงชัด ไม่ใช่แดชบอร์ดโล่ง ๆ",
      en: "Browse is tuned for job-board scanning speed; the detail page breathes because it is a considered read — still compact, just obviously structured.",
    },
  },
];

const TOKENS = [
  { name: "canvas", className: "bg-canvas" },
  { name: "surface", className: "bg-surface" },
  { name: "surface-2", className: "bg-surface-2" },
  { name: "surface-3", className: "bg-surface-3" },
  { name: "ink", className: "bg-ink" },
  { name: "ink-2", className: "bg-ink-2" },
  { name: "ink-3", className: "bg-ink-3" },
  { name: "line", className: "bg-line" },
  { name: "open", className: "bg-open" },
  { name: "amend", className: "bg-amend" },
  { name: "risk", className: "bg-risk" },
  { name: "closed", className: "bg-closed" },
];

export default function MockupIndexPage() {
  const { lang } = useLang();
  const sample = tors[0];

  return (
    <div className="min-h-full">
      <header className="relative border-b border-line bg-surface">
        <div className="scanlines pointer-events-none absolute inset-0 opacity-50" aria-hidden />
        <div className="relative mx-auto max-w-[1000px] px-4 py-10">
          <div className="flex items-center justify-between gap-4">
            <Wordmark />
            <div className="flex items-center gap-2">
              <LangToggle />
              <ThemeToggle />
            </div>
          </div>

          <h1 className="mt-8 max-w-2xl text-[32px] leading-tight font-semibold tracking-tight text-ink">
            {lang === "th" ? "แบบร่างหน้าจอ ระยะที่ 1" : "Phase 1 interface mockups"}
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-thai text-ink-2">
            {lang === "th"
              ? "แพลตฟอร์มค้นหาและอ่านประกาศจัดซื้อจัดจ้างไอทีของกรุงเทพมหานคร ทุกหน้าในชุดนี้เป็นแบบร่างที่ทำงานได้จริงบนข้อมูลตัวอย่าง ยังไม่ต่อกับฐานข้อมูลหรือตัวเก็บข้อมูล"
              : "A discovery platform for Bangkok's IT procurement documents. Every screen here is a working draft running on fixture data — no database and no scrapers behind it yet."}
          </p>
          <p className="mt-4 font-mono text-[11px] text-ink-3">
            01219346 · Kasetsart University · Amornrit Sirikham · Sivapon Channual · Pannawit
            Mahacharoensiri
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-[1000px] px-4 py-10">
        <section>
          <SectionHeading>{lang === "th" ? "หลักการออกแบบ" : "Design principles"}</SectionHeading>
          <div className="grid gap-3 sm:grid-cols-2">
            {PRINCIPLES.map((principle) => (
              <Panel key={principle.title.en} className="p-4">
                <h3 className="text-[14px] leading-thai font-semibold text-ink">
                  {principle.title[lang]}
                </h3>
                <p className="mt-1.5 text-[13px] leading-thai text-ink-2">{principle.body[lang]}</p>
              </Panel>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <SectionHeading
            sub={
              lang === "th"
                ? "แต่ละหน้าอ้างกลับไปยัง User Story และ Functional Requirement ที่รองรับ"
                : "Each screen traces back to the user stories and requirements it serves."
            }
            right={<span className="font-mono text-[11px] text-ink-3">{SCREENS.length}</span>}
          >
            {lang === "th" ? "หน้าจอทั้งหมด" : "The screens"}
          </SectionHeading>

          <ol className="flex flex-col gap-2">
            {SCREENS.map((screen, index) => (
              <li key={screen.href}>
                <Link
                  href={screen.href}
                  className="group flex gap-3.5 rounded-[3px] border border-line bg-surface px-4 py-3.5 transition-colors hover:bg-surface-2"
                >
                  <span className="pt-[3px] font-mono tnum text-[11px] text-ink-3">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[15px] font-semibold text-ink group-hover:underline">
                        {screen.title[lang]}
                      </span>
                      <span className="font-mono text-[11px] text-ink-3">{screen.href}</span>
                    </span>
                    <span className="mt-1 block text-[13px] leading-thai text-ink-2">
                      {screen.note[lang]}
                    </span>
                    <span className="mt-2.5 flex flex-wrap gap-1">
                      {screen.us.map((id) => (
                        <Chip key={id}>{id}</Chip>
                      ))}
                      {screen.fr.map((id) => (
                        <Chip key={id} className="text-ink-3">
                          {id}
                        </Chip>
                      ))}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>

          <p className="mt-3 text-[12px] leading-thai text-ink-3">
            {lang === "th"
              ? "ไม่ได้ออกแบบไว้โดยตั้งใจ: หน้าจัดทำหรือยื่นข้อเสนอ ตัวช่วยเขียนข้อเสนอ และการลงนามอิเล็กทรอนิกส์ ทั้งหมดอยู่นอกขอบเขตโครงการ"
              : "Deliberately not designed: bid drafting, submission forms, proposal builders and e-signing. All out of scope."}
          </p>
        </section>

        <section className="mt-12">
          <SectionHeading
            sub={
              lang === "th"
                ? "ป้ายทุกชิ้นประกอบด้วยสี สัญลักษณ์ และคำ ครบสามอย่างเสมอ"
                : "Every badge is a hue, a glyph and a word — never fewer than all three."
            }
          >
            {lang === "th" ? "ชุดสัญญาณ" : "The signal system"}
          </SectionHeading>

          <Panel className="divide-y divide-line">
            <div className="p-4">
              <Eyebrow>{lang === "th" ? "สถานะ" : "Status"}</Eyebrow>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge status="open" lang={lang} />
                <StatusBadge status="amended" lang={lang} round="ครั้งที่ 2" />
                <StatusBadge status="closed" lang={lang} />
              </div>
            </div>

            <div className="p-4">
              <Eyebrow>{lang === "th" ? "ความเสี่ยงล็อกสเปก" : "Lock-spec risk"}</Eyebrow>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <LockSpecBadge level="low" score={18} lang={lang} />
                <LockSpecBadge level="medium" score={54} lang={lang} />
                <LockSpecBadge level="high" score={87} lang={lang} />
                <span className="flex items-center gap-2 pl-2">
                  <RiskMeter level="low" />
                  <RiskMeter level="medium" />
                  <RiskMeter level="high" />
                </span>
              </div>
            </div>

            <div className="p-4">
              <Eyebrow>{lang === "th" ? "ตรวจสอบราคา" : "Price reality check"}</Eyebrow>
              <div className="mt-2 flex flex-wrap gap-2">
                {[tors[1], tors[0], tors[5]].map((tor) => (
                  <PriceBadge key={tor.id} tor={tor} lang={lang} />
                ))}
              </div>
            </div>

            <div className="p-4">
              <Eyebrow>{lang === "th" ? "ป้ายประเภท (ไม่ใช้สี)" : "Category tags (no hue)"}</Eyebrow>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ScopeBadge size="solo" lang={lang} />
                <ScopeBadge size="small-team" lang={lang} />
                <ScopeBadge size="firm" lang={lang} />
                <SmeBadge lang={lang} />
                <MatchScore score={91} lang={lang} />
              </div>
            </div>
          </Panel>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {(["open", "amend", "risk"] as const).map((tone, index) => (
              <AccentPanel key={tone} tone={tone} className="p-3.5">
                <p className="text-[12px] font-semibold text-ink">
                  {[
                    lang === "th" ? "บล็อกที่ปลอดภัย" : "A block that is fine",
                    lang === "th" ? "บล็อกที่ต้องดูให้ดี" : "A block to look at closely",
                    lang === "th" ? "บล็อกที่เสียเวลาเปล่า" : "A block that will cost you",
                  ][index]}
                </p>
                <p className="mt-1 text-[11px] leading-thai text-ink-3">
                  {lang === "th"
                    ? "แถบซ้ายคือแถบเดียวกับที่ใช้หน้ารายการ"
                    : "The left rail is the same one the browse rows use."}
                </p>
              </AccentPanel>
            ))}
          </div>
        </section>

        <section className="mt-12">
          <SectionHeading>{lang === "th" ? "สีและตัวอักษร" : "Colour and type"}</SectionHeading>

          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {TOKENS.map((token) => (
              <div key={token.name} className="flex flex-col gap-1">
                <span
                  className={`h-10 rounded-[3px] border border-line ${token.className}`}
                  aria-hidden
                />
                <span className="font-mono text-[10px] text-ink-3">{token.name}</span>
              </div>
            ))}
          </div>

          <Panel className="mt-3 p-4">
            <p className="text-[27px] leading-thai font-semibold tracking-tight text-ink">
              {sample.title.th}
            </p>
            <p className="mt-2 text-[15px] leading-thai text-ink-2">
              ระบบต้องรองรับ NGINX Plus บน Windows Server 2019 และคิดค่าปรับร้อยละ 0.20 ต่อวัน
            </p>
            <p className="mt-2 font-mono tnum text-[15px] text-ink">
              ฿12,400,000 · 04 Sep 2026 · BMA-2569-0142
            </p>
            <Well className="mt-3 px-3 py-2.5">
              <p className="text-[12px] leading-thai text-ink-3">
                {lang === "th"
                  ? "IBM Plex Sans Thai สำหรับข้อความ และ IBM Plex Mono สำหรับตัวเลข รหัส และวันที่ เลือกเพราะครอบคลุมภาษาไทยเต็มรูปแบบ และคู่ละตินรับศัพท์เทคนิคที่แทรกกลางประโยคไทยได้พอดี"
                  : "IBM Plex Sans Thai for text, IBM Plex Mono for figures, IDs and dates — chosen for full Thai coverage and a Latin companion that carries the English tech terms running inline through Thai sentences."}
              </p>
            </Well>
          </Panel>
        </section>

        <footer className="mt-12 border-t border-line pt-4 font-mono text-[11px] text-ink-3">
          {lang === "th"
            ? "แบบร่างนี้ใช้ข้อมูลตัวอย่างที่เขียนขึ้นให้ใกล้เคียงเอกสารจริง ไม่ใช่ข้อมูลจากระบบ e-GP"
            : "These mockups run on hand-written fixture data modelled on real documents. Nothing here is live e-GP data."}
        </footer>
      </main>
    </div>
  );
}
