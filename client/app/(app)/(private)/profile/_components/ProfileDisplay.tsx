import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import {
  AlertTriangle,
  Award,
  Building2,
  Check,
  Pencil,
  Search,
  User,
} from "lucide-react";
import type { AuthUser, UserProfile } from "../../../../_lib/api";
import { formatTHB } from "../../../../_data/tors";
import { isProfileBaseline } from "../../../../_lib/match";
import { Card, CardHeader, Inset, Pill, StatusPill, Tile, pbtn } from "./profile-ui";

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

/** What an unconfigured profile is missing, in the order the match score weighs it. */
const SETUP_STEPS = [
  { title: "ทักษะเทคโนโลยี", weight: "40%", body: "ภาษาโปรแกรม เฟรมเวิร์ก และเครื่องมือพัฒนาซอฟต์แวร์" },
  { title: "ช่วงงบประมาณที่รับงาน", weight: "20%", body: "วงเงินขั้นต่ำและเพดานราคากลางโครงการที่พร้อมรับ" },
  { title: "สถาปัตยกรรมระบบ", weight: "15%", body: "รูปแบบและประเภทสถาปัตยกรรมระบบงานที่ถนัด" },
  { title: "มูลค่าผลงานสัญญาเดิม", weight: "10%", body: "มูลค่าสัญญาเดียวสูงสุดในอดีตเทียบกับเกณฑ์คุณสมบัติ" },
  { title: "สถานะนิติบุคคล / ฟรีแลนซ์", weight: "10%", body: "ความเข้ากันได้กับเงื่อนไขเฉพาะนิติบุคคลของโครงการ" },
  { title: "ใบรับรองและมาตรฐานสากล", weight: "5%", body: "มาตรฐานคุณภาพและกระบวนการทำงานที่ได้รับการรับรอง" },
] as const;

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

  const archetypes = profile.preferredArchetypes ?? [];
  const certifications = profile.certifications ?? [];
  const minScore = profile.matchNotification?.minScore ?? 75;
  const includeSubcontract = profile.matchNotification?.includeSubcontract ?? true;
  const deadlineDays = profile.deadlineNoticeDays ?? 3;

  return (
    <div className="flex flex-col gap-5">
      {/* 1. PROFILE OVERVIEW */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[19px] font-semibold leading-tight text-ink">
                {user.name || "ผู้ใช้งาน"}
              </h2>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                  isJuristic
                    ? "border-open-line bg-open-bg text-open"
                    : "border-line bg-surface-2 text-ink-2"
                }`}
              >
                {isJuristic ? (
                  <>
                    <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>นิติบุคคล (บริษัท / หจก.)</span>
                  </>
                ) : (
                  <>
                    <User className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>บุคคลธรรมดา / ฟรีแลนซ์</span>
                  </>
                )}
              </span>
            </div>
            <p className="mt-1 text-[12.5px] text-ink-3">{user.email}</p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button type="button" onClick={onEdit} className={`${pbtn.primary} whitespace-nowrap`}>
              <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>แก้ไขข้อมูลโปรไฟล์</span>
            </button>
            <Link href="/search?sort=match-desc" className={`${pbtn.secondary} whitespace-nowrap`}>
              <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>ดูประกาศที่เหมาะสมกับฉัน</span>
            </Link>
          </div>
        </div>

        {/* Profile completeness */}
        <Inset className="mt-5 p-4">
          <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
            <span className="font-semibold text-ink">ความสมบูรณ์ของโปรไฟล์</span>
            <span className="tnum shrink-0 whitespace-nowrap text-[15px] font-semibold text-ink">
              {completeness.score}%
            </span>
          </div>

          <div
            role="progressbar"
            aria-label="ความสมบูรณ์ของโปรไฟล์"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completeness.score}
            className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-surface-3"
          >
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
            <div className="mt-3.5">
              <p className="text-[11.5px] font-medium text-ink-2">คำแนะนำเพิ่มความแม่นยำ</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {completeness.missingItems.map((item) => (
                  <li
                    key={item.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] text-ink-2"
                  >
                    <span aria-hidden="true" className="text-ink-3">+</span>
                    <span>{item.th}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-open">
              <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>ข้อมูลโปรไฟล์ครบถ้วนสมบูรณ์ พร้อมรับการวิเคราะห์ผลจับคู่ 100%</span>
            </p>
          )}
        </Inset>
      </Card>

      {/* 2. CAPABILITIES: setup prompt for an unconfigured profile, or the saved values */}
      {isProfileBaseline(profile) ? (
        <Card className="p-6 text-center sm:p-9">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-amber-300/80 bg-amber-100/70 text-amber-700 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <h3 className="mt-3.5 text-[16px] font-semibold text-ink">
            ยังไม่ได้ตั้งค่าโปรไฟล์ความสามารถ
          </h3>
          <p className="mx-auto mt-2 max-w-xl text-[12.5px] leading-thai text-ink-2">
            ระบบจับคู่ประกาศ TOR (Match Scoring) และการแจ้งเตือนงานใหม่ยังไม่ทำงาน
            คุณสามารถกดปุ่ม <span className="font-medium text-ink">&ldquo;แก้ไขข้อมูลโปรไฟล์&rdquo;</span> ด้านบนเพื่อระบุทักษะ เครื่องมือ และเงื่อนไขการรับงานของคุณ
          </p>

          <ol className="mx-auto mt-7 grid max-w-3xl grid-cols-1 gap-2.5 text-left sm:grid-cols-2 lg:grid-cols-3">
            {SETUP_STEPS.map((step, i) => (
              <li key={step.title}>
                <Inset className="flex h-full gap-3 p-3.5">
                  <span
                    aria-hidden="true"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line-2 bg-surface text-[11px] font-semibold text-ink-2"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-ink-2">
                      {step.title} <span className="font-normal text-ink-3">({step.weight})</span>
                    </p>
                    <p className="mt-1 text-[11.5px] leading-thai text-ink-3">{step.body}</p>
                  </div>
                </Inset>
              </li>
            ))}
          </ol>
        </Card>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            {/* Budget range */}
            <Card className="flex flex-col p-5">
              <CardHeader
                title="ช่วงงบประมาณที่รับงาน"
                sub="ช่วงมูลค่าโครงการภาครัฐที่คุณรับงานได้"
              />
              <Inset className="mt-4 flex-1 p-4">
                <p className="tnum text-[19px] font-semibold leading-snug text-ink">
                  {profile.budgetMin === 0 && (profile.budgetMax === 0 || profile.budgetMax >= 10_000_000_000)
                    ? "ไม่จำกัดช่วงงบประมาณ"
                    : profile.budgetMax === 0 || profile.budgetMax >= 10_000_000_000
                    ? `${formatTHB(profile.budgetMin)} ขึ้นไป`
                    : `${formatTHB(profile.budgetMin)} – ${formatTHB(profile.budgetMax)}`}
                </p>
                <p className="mt-1.5 text-[11.5px] leading-thai text-ink-3">
                  ใช้คำนวณคะแนน Financial Budget Fit (น้ำหนัก 20%) เทียบกับราคากลางโครงการ
                </p>
              </Inset>
            </Card>

            {/* Past single contract */}
            <Card className="flex flex-col p-5">
              <CardHeader
                title="มูลค่าผลงานสัญญาเดิมสูงสุด"
                sub="ผลงานสัญญาเดียวสูงสุดในอดีต (เพื่อประเมินเกณฑ์ ~40%)"
              />
              <Inset className="mt-4 flex-1 p-4">
                <p
                  className={`tnum text-[19px] font-semibold leading-snug ${
                    (profile.maxPastPortfolioTHB ?? 0) > 0 ? "text-ink" : "text-ink-3"
                  }`}
                >
                  {(profile.maxPastPortfolioTHB ?? 0) > 0
                    ? formatTHB(profile.maxPastPortfolioTHB ?? 0)
                    : "ยังไม่ได้ระบุ"}
                </p>
                <p className="mt-1.5 text-[11.5px] leading-thai text-ink-3">
                  งานจัดซื้อจัดจ้างภาครัฐมักกำหนดผลงานสัญญาเดียวไม่น้อยกว่า 30%–50% ของราคากลาง
                </p>
              </Inset>
            </Card>

            {/* Preferred archetypes */}
            <Card className="p-5">
              <CardHeader
                title="สถาปัตยกรรมระบบที่ถนัด"
                sub="ประเภทสถาปัตยกรรมระบบที่คุณมีความเชี่ยวชาญ"
                right={<CountBadge>{archetypes.length} ประเภท</CountBadge>}
              />
              <div className="mt-4">
                {archetypes.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {archetypes.map((id) => (
                      <li key={id}>
                        <Pill tone="ink-3">
                          <Check className="h-3 w-3 shrink-0 text-open" aria-hidden="true" />
                          <span>{ARCHETYPE_LABELS[id] || id}</span>
                        </Pill>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12.5px] leading-thai text-ink-3">
                    ยังไม่ได้ระบุ (ระบบจะพิจารณาให้คะแนนพื้นฐานในทุกประเภทระบบ)
                  </p>
                )}
              </div>
            </Card>

            {/* Certifications */}
            <Card className="p-5">
              <CardHeader
                title="ใบรับรองและมาตรฐานสากล"
                sub="มาตรฐานการพัฒนาและบริหารจัดการที่ได้รับรอง"
                right={<CountBadge>{certifications.length} รายการ</CountBadge>}
              />
              <div className="mt-4">
                {certifications.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {certifications.map((cert) => (
                      <li key={cert}>
                        <Pill tone="ink-3">
                          <Award className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                          <span>{cert}</span>
                        </Pill>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12.5px] leading-thai text-ink-3">
                    ยังไม่ได้ระบุใบรับรอง (หากมี ISO 29110, ISO 27001 จะช่วยเพิ่มคะแนนความเหมาะสม)
                  </p>
                )}
              </div>
            </Card>
          </div>

          {/* Technical skills */}
          <Card className="p-5 sm:p-6">
            <CardHeader
              title="ทักษะและเทคโนโลยีที่คุณเชี่ยวชาญ"
              sub="เทคโนโลยี เครื่องมือ และภาษาโปรแกรมที่คุณและทีมเชี่ยวชาญ (น้ำหนัก 40%)"
              right={<CountBadge>{profile.skills.length} ทักษะ</CountBadge>}
            />
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {profile.skills.map((skill) => (
                <li key={skill}>
                  <Pill tone="ink-3">{skill}</Pill>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {/* 3. NOTIFICATION PREFERENCES */}
      <Card className="p-5 sm:p-6">
        <CardHeader
          title="การตั้งค่าการแจ้งเตือน"
          sub="สถานะการแจ้งเตือนงานใหม่ในระบบและช่องทางอีเมล"
          right={
            <button type="button" onClick={onEdit} className={`${pbtn.secondary} h-8 px-3.5 text-[12px]`}>
              แก้ไขการตั้งค่า
            </button>
          }
        />

        <div className="mt-4">
          {!user.notificationConsent ? (
            <Inset className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12.5px] font-semibold text-ink">การรับการแจ้งเตือนจากระบบ</span>
                <StatusPill on={false}>ปิดรับการแจ้งเตือน</StatusPill>
              </div>
              <p className="mt-2 text-[12px] leading-thai text-ink-2">
                คุณยังไม่ได้เปิดรับการแจ้งเตือนจากระบบ (ปิดการแจ้งเตือนทั้งในระบบและทางอีเมล)
              </p>
            </Inset>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Delivery channels */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Inset className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold text-ink">การแจ้งเตือนในระบบ</span>
                    <StatusPill on={!!user.notificationConsent}>
                      {user.notificationConsent ? "เปิดใช้งาน" : "ปิดอยู่"}
                    </StatusPill>
                  </div>
                  <p className="mt-2 text-[12px] leading-thai text-ink-2">
                    {user.notificationConsent
                      ? "แสดงการแจ้งเตือนในกล่องข้อความและกระดิ่ง (โครงการที่เหมาะสมกับโปรไฟล์, สถานะเปลี่ยนแปลง, แก้ไข TOR, และเตือนใกล้หมดเขต)"
                      : "ปิดรับการแจ้งเตือนในระบบ"}
                  </p>
                </Inset>

                <Inset className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold text-ink">สรุปแจ้งเตือนทางอีเมล</span>
                    <StatusPill on={!!profile.matchNotification?.enabled}>
                      {profile.matchNotification?.enabled ? "เปิดใช้งาน" : "ปิดอยู่"}
                    </StatusPill>
                  </div>
                  <p className="mt-2 text-[12px] leading-thai text-ink-2">
                    {profile.matchNotification?.enabled
                      ? `ส่งสรุปโครงการและอัปเดตแบบ${
                          profile.matchNotification?.frequency === "weekly"
                            ? "รายสัปดาห์ (วันจันทร์)"
                            : "รายวัน (ทุกเช้า 08:00 น.)"
                        } ไปยัง ${user.email}`
                      : "ปิดรับสรุปทางอีเมล"}
                  </p>
                </Inset>
              </div>

              {/* Alert criteria */}
              <Inset className="p-4">
                <h3 className="text-[12.5px] font-semibold text-ink">เกณฑ์และเงื่อนไขการแจ้งเตือน</h3>

                <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <Tile>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11.5px] font-medium text-ink-2">เกณฑ์ความเหมาะสม</span>
                      <span className="tnum text-[13px] font-semibold text-ink">{minScore}%</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-thai text-ink-3">
                      แจ้งเตือนโครงการที่มีคะแนนความเหมาะสมตั้งแต่ {minScore}% ขึ้นไป
                    </p>
                  </Tile>

                  <Tile>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11.5px] font-medium text-ink-2">งานช่วง / ร่วมค้า</span>
                      <StatusPill on={includeSubcontract}>
                        {includeSubcontract ? "เปิดรับคำแนะนำ" : "ปิดอยู่"}
                      </StatusPill>
                    </div>
                    <p className="mt-1 text-[11px] leading-thai text-ink-3">
                      {includeSubcontract
                        ? "แนะนำโครงการที่เป็นไปได้แบบ Subcontract/JV สำหรับบุคคลธรรมดา"
                        : "ไม่รวมโครงการที่ TOR กำหนดเฉพาะนิติบุคคล"}
                    </p>
                  </Tile>

                  <Tile>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11.5px] font-medium text-ink-2">แจ้งก่อนปิดรับข้อเสนอ</span>
                      <span className="tnum text-[13px] font-semibold text-ink">{deadlineDays} วัน</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-thai text-ink-3">
                      แจ้งเตือนล่วงหน้า {deadlineDays} วันก่อนปิดรับข้อเสนอ
                    </p>
                  </Tile>
                </div>
              </Inset>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function CountBadge({ children }: { children: ReactNode }) {
  return (
    <span className="tnum inline-flex items-center rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-ink-2">
      {children}
    </span>
  );
}
