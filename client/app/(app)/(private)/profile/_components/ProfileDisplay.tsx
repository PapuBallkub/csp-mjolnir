import Link from "next/link";
import { useMemo } from "react";
import type { AuthUser, UserProfile } from "../../../../_lib/api";
import { formatTHB } from "../../../../_data/tors";
import { btn, Chip, Panel, SectionHeading } from "../../../../_components/ui";

const ARCHETYPE_LABELS: Record<string, string> = {
  "web-portal": "เว็บพอร์ทัล / เว็บไซต์ระบบงาน",
  "mobile-app": "โมบายแอปพลิเคชัน (iOS/Android)",
  "enterprise-erp": "ระบบ ERP / บัญชีและการเงิน",
  "edoc-workflow": "สารบรรณอิเล็กทรอนิกส์ / เวิร์กโฟลว์",
  "data-analytics": "คลังข้อมูล / Data Analytics / AI",
  "gis-mapping": "ระบบแผนที่ / GIS",
  "cybersecurity": "ความมั่นคงปลอดภัยไซเบอร์ (Cybersecurity)",
  "iot-telemetry": "IoT / ระบบตรวจวัดระยะไกล",
  "infra-networking": "เครือข่าย / เซิร์ฟเวอร์ / Cloud / CCTV",
  other: "ระบบเฉพาะด้านอื่นๆ",
};

export function ProfileDisplay({
  user,
  profile,
  onEdit,
}: {
  user: AuthUser;
  profile: UserProfile;
  onEdit: () => void;
}) {
  const isJuristic = (profile.entityType ?? "juristic") === "juristic";

  // Calculate profile completeness score & missing tips
  const completeness = useMemo(() => {
    let score = 0;
    const missingItems: { id: string; th: string }[] = [];

    // 1. Skills (30%)
    if (profile.skills.length >= 3) {
      score += 30;
    } else if (profile.skills.length > 0) {
      score += 15;
      missingItems.push({
        id: "skills",
        th: `เพิ่มทักษะอีก ${3 - profile.skills.length} รายการ (เพื่อความแม่นยำ)`,
      });
    } else {
      missingItems.push({
        id: "skills",
        th: "เลือกทักษะเทคโนโลยีที่คุณเชี่ยวชาญ",
      });
    }

    // 2. Budget Range (20%)
    if (profile.budgetMin > 0 || profile.budgetMax > 0) {
      score += 20;
    } else {
      missingItems.push({
        id: "budget",
        th: "ระบุช่วงงบประมาณที่คุณรับงาน",
      });
    }

    // 3. Past Portfolio (15%)
    if ((profile.maxPastPortfolioTHB ?? 0) > 0) {
      score += 15;
    } else {
      missingItems.push({
        id: "portfolio",
        th: "ระบุมูลค่าสัญญาผลงานเดิมเพื่อคำนวณเกณฑ์ 40%",
      });
    }

    // 4. Preferred Archetypes (15%)
    if ((profile.preferredArchetypes ?? []).length > 0) {
      score += 15;
    } else {
      missingItems.push({
        id: "archetypes",
        th: "เลือกประเภทระบบที่คุณถนัด (Archetypes)",
      });
    }

    // 5. Certifications (10%)
    if ((profile.certifications ?? []).length > 0) {
      score += 10;
    } else {
      missingItems.push({
        id: "certs",
        th: "ระบุมาตรฐานหรือใบรับรอง (ถ้ามี)",
      });
    }

    // 6. Entity Type (10%)
    score += 10;

    return { score, missingItems };
  }, [profile]);

  return (
    <div className="flex flex-col gap-6">
      {/* 1. PROFILE OVERVIEW HEADER */}
      <Panel className="px-5 py-6 sm:px-8 sm:py-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-6">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 font-mono text-[20px] font-bold text-ink">
              {user.name ? user.name.slice(0, 1).toUpperCase() : "U"}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[20px] font-semibold text-ink leading-tight">
                  {user.name || "ผู้ใช้งาน"}
                </h2>
                <span
                  className={`inline-flex items-center rounded-[3px] border px-2 py-0.5 text-[11px] font-medium ${
                    isJuristic
                      ? "border-open-line bg-open-bg text-open"
                      : "border-line bg-surface-2 text-ink-2"
                  }`}
                >
                  {isJuristic ? "🏢 นิติบุคคล (บริษัท / หจก.)" : "👤 บุคคลธรรมดา / ฟรีแลนซ์"}
                </span>
              </div>
              <p className="mt-1 font-mono text-[13px] text-ink-3">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onEdit}
              className={`${btn.primary} text-[13px]`}
            >
              ✏️ แก้ไขข้อมูลโปรไฟล์
            </button>
            <Link
              href="/search?mode=match"
              className={`${btn.secondary} text-[13px]`}
            >
              🔍 ดูประกาศที่ตรงกับฉัน
            </Link>
          </div>
        </div>

        {/* Profile Completeness Bar */}
        <div className="mt-6 rounded-[4px] border border-line bg-surface-2/40 p-4">
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-semibold text-ink">
              ความสมบูรณ์ของโปรไฟล์ (Profile Completeness)
            </span>
            <span className="font-mono font-bold text-ink">
              {completeness.score}%
            </span>
          </div>

          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                completeness.score >= 80
                  ? "bg-open"
                  : completeness.score >= 50
                  ? "bg-ink"
                  : "bg-amber-500"
              }`}
              style={{ width: `${completeness.score}%` }}
            />
          </div>

          {completeness.missingItems.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
              <span className="font-medium text-ink-2">คำแนะนำเพิ่มความแม่นยำ:</span>
              {completeness.missingItems.map((item) => (
                <span
                  key={item.id}
                  className="inline-flex items-center gap-1 rounded bg-surface px-2 py-0.5 text-ink-2 border border-line"
                >
                  <span>•</span>
                  <span>{item.th}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[12px] text-open font-medium">
              ✓ ข้อมูลโปรไฟล์ครบถ้วนสมบูรณ์ พร้อมรับการวิเคราะห์ผลจับคู่ 100%
            </p>
          )}
        </div>
      </Panel>

      {/* 2. CORE CAPABILITY CARDS GRID */}
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Card 1: Budget Range */}
        <Panel className="p-5">
          <div className="flex items-center justify-between border-b border-line/60 pb-3">
            <SectionHeading sub="ช่วงมูลค่าโครงการภาครัฐที่คุณรับงานได้">
              ช่วงงบประมาณที่รับงาน
            </SectionHeading>
          </div>
          <div className="mt-4">
            <p className="font-mono text-[22px] font-bold text-ink">
              {profile.budgetMin === 0 && (profile.budgetMax === 0 || profile.budgetMax >= 10_000_000_000)
                ? "ไม่จำกัดช่วงงบประมาณ"
                : profile.budgetMax === 0 || profile.budgetMax >= 10_000_000_000
                ? `${formatTHB(profile.budgetMin)} ขึ้นไป`
                : `${formatTHB(profile.budgetMin)} – ${formatTHB(profile.budgetMax)}`}
            </p>
            <p className="mt-1 text-[12px] leading-thai text-ink-3">
              ใช้คำนวณคะแนน Financial Budget Fit (น้ำหนัก 20%) เทียบกับราคากลางโครงการ
            </p>
          </div>
        </Panel>

        {/* Card 2: Past Single Contract */}
        <Panel className="p-5">
          <div className="flex items-center justify-between border-b border-line/60 pb-3">
            <SectionHeading sub="ผลงานสัญญาเดียวสูงสุดในอดีต (เพื่อประเมินเกณฑ์ ~40%)">
              มูลค่าผลงานสัญญาเดิมสูงสุด
            </SectionHeading>
          </div>
          <div className="mt-4">
            <p className="font-mono text-[22px] font-bold text-ink">
              {(profile.maxPastPortfolioTHB ?? 0) > 0
                ? formatTHB(profile.maxPastPortfolioTHB ?? 0)
                : "ยังไม่ได้ระบุ"}
            </p>
            <p className="mt-1 text-[12px] leading-thai text-ink-3">
              งานจัดซื้อจัดจ้างภาครัฐมักกำหนดผลงานสัญญาเดียวไม่น้อยกว่า 30%–50% ของราคากลาง
            </p>
          </div>
        </Panel>

        {/* Card 3: Preferred Archetypes */}
        <Panel className="p-5">
          <div className="flex items-center justify-between border-b border-line/60 pb-3">
            <SectionHeading sub="ประเภทสถาปัตยกรรมระบบที่คุณมีความเชี่ยวชาญ">
              สถาปัตยกรรมระบบที่ถนัด
            </SectionHeading>
            <span className="font-mono text-[12px] text-ink-3">
              {(profile.preferredArchetypes ?? []).length} ประเภท
            </span>
          </div>
          <div className="mt-4">
            {(profile.preferredArchetypes ?? []).length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {(profile.preferredArchetypes ?? []).map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-[3px] border border-line bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-ink"
                  >
                    <span>✓</span>
                    <span>{ARCHETYPE_LABELS[id] || id}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-ink-3">
                ยังไม่ได้ระบุ (ระบบจะพิจารณาให้คะแนนพื้นฐานในทุกประเภทระบบ)
              </p>
            )}
          </div>
        </Panel>

        {/* Card 4: Certifications & Standards */}
        <Panel className="p-5">
          <div className="flex items-center justify-between border-b border-line/60 pb-3">
            <SectionHeading sub="มาตรฐานการพัฒนาและบริหารจัดการที่ได้รับรอง">
              ใบรับรองและมาตรฐานสากล
            </SectionHeading>
            <span className="font-mono text-[12px] text-ink-3">
              {(profile.certifications ?? []).length} รายการ
            </span>
          </div>
          <div className="mt-4">
            {(profile.certifications ?? []).length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {(profile.certifications ?? []).map((cert) => (
                  <span
                    key={cert}
                    className="inline-flex items-center gap-1 rounded-[3px] border border-line bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-ink"
                  >
                    <span>🎖️</span>
                    <span>{cert}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-ink-3">
                ยังไม่ได้ระบุใบรับรอง (หากมี ISO 29110, ISO 27001 จะช่วยเพิ่มคะแนนความตรง)
              </p>
            )}
          </div>
        </Panel>
      </div>

      {/* 3. TECHNICAL SKILLS & STACK CARD */}
      <Panel className="p-5 sm:p-6">
        <div className="flex items-center justify-between border-b border-line/60 pb-3">
          <SectionHeading sub="เทคโนโลยี เครื่องมือ และภาษาโปรแกรมที่คุณและทีมเชี่ยวชาญ (น้ำหนัก 40%)">
            ทักษะและเทคโนโลยีที่คุณเชี่ยวชาญ
          </SectionHeading>
          <span className="font-mono text-[13px] font-semibold text-ink">
            {profile.skills.length} ทักษะ
          </span>
        </div>

        <div className="mt-4">
          {profile.skills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((skill) => (
                <Chip key={skill} className="px-2.5 py-1 text-[12px]">
                  {skill}
                </Chip>
              ))}
            </div>
          ) : (
            <div className="rounded border border-dashed border-line p-6 text-center text-ink-3">
              <p className="text-[14px]">ยังไม่ได้เลือกทักษะเทคโนโลยี</p>
              <button
                type="button"
                onClick={onEdit}
                className={`${btn.secondary} mt-3 text-[12px]`}
              >
                + เพิ่มทักษะของคุณ
              </button>
            </div>
          )}
        </div>
      </Panel>

      {/* 4. MATCH NOTIFICATION SETTINGS CARD */}
      <Panel className="p-5 sm:p-6">
        <div className="flex items-center justify-between border-b border-line/60 pb-3">
          <SectionHeading sub="การแจ้งเตือนประกาศจัดซื้อจัดจ้างที่ตรงกับโปรไฟล์ผ่านทางอีเมล (PDPA Consent)">
            การแจ้งเตือนงานที่ตรงกับคุณ
          </SectionHeading>
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
              profile.matchNotification?.enabled
                ? "bg-open-bg text-open border border-open-line"
                : "bg-surface-2 text-ink-3 border border-line"
            }`}
          >
            {profile.matchNotification?.enabled ? "เปิดใช้งาน" : "ปิดอยู่"}
          </span>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[13px] text-ink-2">
          <div>
            <p>
              {profile.matchNotification?.enabled
                ? `ส่งสรุปงานที่ตรงตั้งแต่ ${profile.matchNotification.minScore}% ขึ้นไป (${
                    profile.matchNotification.frequency === "weekly"
                      ? "สัปดาห์ละครั้ง"
                      : "วันละครั้ง (สรุปช่วงเช้า)"
                  })`
                : "คุณยังไม่ได้เปิดการแจ้งเตือนอีเมลสำหรับงานที่ตรงกับคุณ"}
            </p>
            {profile.matchNotification?.enabled && profile.matchNotification.includeSubcontract && (
              <p className="mt-1 text-[11.5px] text-ink-3">
                ✓ รวมโอกาสรับงานช่วง (Subcontract) และกิจการร่วมค้า
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onEdit}
            className={`${btn.secondary} text-[12px] shrink-0`}
          >
            ตั้งค่าการแจ้งเตือน
          </button>
        </div>
      </Panel>
    </div>
  );
}
