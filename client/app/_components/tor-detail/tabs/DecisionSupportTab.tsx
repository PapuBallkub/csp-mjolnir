import Link from "next/link";
import { useState } from "react";
import type { TorInsightDetail } from "../../../_lib/api";
import { formatTHB, type RiskLevel } from "../../../_data/tors";
import {
  InsightPriceBadge,
  LockSpecBadge,
} from "../../verdict";
import type { Match } from "../../../_lib/match";
import { AccentPanel, btn, Label, Panel, SectionHeading, Well } from "../../ui";
import {
  formatBenchmarkMoney,
  formatCategoryLabel,
  formatMoney,
  formatSignedDiff,
  NotAnalysed,
} from "../_lib/tor-helpers";

export function DecisionSupportTab({
  insight,
  match,
  isAuthenticated,
  lockLevel,
  lockScore,
  lockTone,
}: {
  insight: TorInsightDetail;
  match: Match | null;
  isAuthenticated: boolean;
  lockLevel: RiskLevel;
  lockScore: number | null;
  lockTone: "open" | "amend" | "risk";
}) {
  const facts = insight.facts;
  const lockSpec = insight.analytics.lockSpec;
  const price = insight.analytics.priceAnalysis;

  const [visiblePeersCount, setVisiblePeersCount] = useState(3);
  const sampleCount = price?.sampleSize ?? price?.comparableProjects?.length ?? 0;
  const hasSufficientPeers = sampleCount >= 5;
  const diffPct = price?.diffPercentage ?? null;

  const priceTone: "open" | "amend" | "risk" | "closed" =
    !hasSufficientPeers ? "closed" : diffPct === null ? "open" : diffPct > 15 ? "amend" : diffPct < -15 ? "risk" : "open";

  return (
    <div className="flex flex-col gap-6">
      {/* 1. PROFILE MATCH (FR-13 & Section 4.10) */}
      {isAuthenticated && match ? (
        <AccentPanel
          id="profile-match"
          tone={
            match.disqualifiedDirectBid
              ? "amend"
              : match.score >= 75
              ? "open"
              : match.score >= 50
              ? "neutral"
              : "risk"
          }
          className="scroll-mt-24 px-4 py-5 sm:px-6 sm:py-6"
        >
          <SectionHeading
            sub="เปรียบเทียบข้อกำหนดของ TOR กับทักษะ ช่วงงบ สถาปัตยกรรมระบบ และผลงานในโปรไฟล์ของคุณ"
            right={
              <span className="flex items-center gap-2">
                <span className="font-mono text-[18px] font-bold text-ink">
                  {match.score}
                  <span className="text-ink-3 text-[13px]">/100</span>
                </span>
              </span>
            }
          >
            ความตรงกับคุณ (Profile Match)
          </SectionHeading>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-[11.5px] font-semibold ${
                match.score >= 85
                  ? "border-open-line bg-open-bg text-open"
                  : match.score >= 70
                  ? "border-line bg-surface-2 text-ink"
                  : "border-line bg-surface-2 text-ink-2"
              }`}
            >
              <span>●</span>
              <span>
                {match.tier === "strong"
                  ? "ตรงกับคุณมาก (Strong Match)"
                  : match.tier === "good"
                  ? "ตรงปานกลาง-สูง (Good Match)"
                  : match.tier === "moderate"
                  ? "ตรงบางส่วน (Moderate Match)"
                  : "ไม่ค่อยตรง (Low Match)"}
              </span>
            </span>

            {match.disqualifiedDirectBid ? (
              <span className="inline-flex items-center rounded-[2px] border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11.5px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                เฉพาะนิติบุคคล
              </span>
            ) : null}
          </div>

          {/* 6-Dimension Evaluation Bars */}
          <div className="mt-4 rounded-md border border-line bg-surface p-4 shadow-2xs">
            <div className="mb-3 flex items-center justify-between border-b border-line/60 pb-2.5">
              <h4 className="text-[13px] font-semibold text-ink">
                วิเคราะห์ความตรงกับโปรไฟล์ 6 มิติ
              </h4>
              <span className="font-mono text-[13px] font-semibold text-ink">
                {match.score}
                <span className="text-[11px] text-ink-3">/100</span>
              </span>
            </div>
            <div className="space-y-3">
              {/* 1. Skills Fit (40%) */}
              <div>
                <div className="flex items-center justify-between text-[12.5px] leading-thai">
                  <span className="text-ink font-medium">
                    ทักษะเทคโนโลยี <span className="text-[11.5px] text-ink-3 font-normal">(40%)</span>
                  </span>
                  <span className="font-mono text-[12px] font-semibold tnum text-ink">
                    {match.breakdown.skills.score}
                    <span className="text-[10.5px] text-ink-3 font-normal">/100</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      match.breakdown.skills.score >= 70
                        ? "bg-open"
                        : match.breakdown.skills.score >= 40
                        ? "bg-ink-2"
                        : "bg-amber-500"
                    }`}
                    style={{ width: `${match.breakdown.skills.score}%` }}
                  />
                </div>
                {match.breakdown.skills.totalRequired > 0 ? (
                  <p className="mt-1 text-[11px] leading-thai text-ink-3">
                    {match.matched.length > 0
                      ? `✓ ทักษะตรง ${match.matched.length} จาก ${match.breakdown.skills.totalRequired} รายการ (${match.matched.join(", ")})`
                      : `ยังไม่มีทักษะที่ตรงจาก ${match.breakdown.skills.totalRequired} รายการที่ TOR กำหนด`}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] leading-thai text-ink-3">
                    TOR ไม่ระบุชื่อเทคโนโลยีเจาะจง
                  </p>
                )}
              </div>

              {/* 2. System Archetype (15%) */}
              <div>
                <div className="flex items-center justify-between text-[12.5px] leading-thai">
                  <span className="text-ink font-medium">
                    สถาปัตยกรรมระบบ <span className="text-[11.5px] text-ink-3 font-normal">(15%)</span>
                  </span>
                  <span className="font-mono text-[12px] font-semibold tnum text-ink">
                    {match.breakdown.archetype.score}
                    <span className="text-[10.5px] text-ink-3 font-normal">/100</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      match.breakdown.archetype.score >= 70
                        ? "bg-open"
                        : match.breakdown.archetype.score >= 40
                        ? "bg-ink-2"
                        : "bg-amber-500"
                    }`}
                    style={{ width: `${match.breakdown.archetype.score}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] leading-thai text-ink-3">
                  {match.breakdown.archetype.torArchetype
                    ? `ประเภทระบบ: ${match.breakdown.archetype.torArchetype}${match.breakdown.archetype.isPreferred ? " (ตรงกับงานที่คุณถนัด)" : ""}`
                    : "TOR ไม่ระบุสถาปัตยกรรมเจาะจง (คิดคะแนนพื้นฐาน)"}
                </p>
              </div>

              {/* 3. Budget Range (20%) */}
              <div>
                <div className="flex items-center justify-between text-[12.5px] leading-thai">
                  <span className="text-ink font-medium">
                    ช่วงงบประมาณ <span className="text-[11.5px] text-ink-3 font-normal">(20%)</span>
                  </span>
                  <span className="font-mono text-[12px] font-semibold tnum text-ink">
                    {match.breakdown.budget.score}
                    <span className="text-[10.5px] text-ink-3 font-normal">/100</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      match.breakdown.budget.score >= 80
                        ? "bg-open"
                        : match.breakdown.budget.score >= 50
                        ? "bg-ink-2"
                        : "bg-amber-500"
                    }`}
                    style={{ width: `${match.breakdown.budget.score}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] leading-thai text-ink-3">
                  {match.breakdown.budget.status === "within_range"
                    ? "✓ ราคากลางอยู่ในช่วงงบประมาณที่คุณรับงาน"
                    : match.breakdown.budget.status === "above_max"
                    ? "โครงการมีมูลค่าสูงกว่าช่วงงบที่คุณรับไหว (อาจต้องร่วมค้าหรือรับงานช่วง)"
                    : match.breakdown.budget.status === "below_min"
                    ? "โครงการมีมูลค่าต่ำกว่าช่วงงบที่คุณรับไหว"
                    : "ไม่ระบุงบประมาณ"}
                </p>
              </div>

              {/* 4. Past Performance (10%) */}
              <div>
                <div className="flex items-center justify-between text-[12.5px] leading-thai">
                  <span className="text-ink font-medium">
                    ผลงานสัญญาเดิม <span className="text-[11.5px] text-ink-3 font-normal">(10%)</span>
                  </span>
                  <span className="font-mono text-[12px] font-semibold tnum text-ink">
                    {match.breakdown.portfolio.score}
                    <span className="text-[10.5px] text-ink-3 font-normal">/100</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      match.breakdown.portfolio.score >= 80
                        ? "bg-open"
                        : match.breakdown.portfolio.score >= 50
                        ? "bg-ink-2"
                        : "bg-amber-500"
                    }`}
                    style={{ width: `${match.breakdown.portfolio.score}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] leading-thai text-ink-3">
                  {match.breakdown.portfolio.meetsThreshold
                    ? "✓ ผลงานสัญญาเดี่ยวสูงสุดของคุณผ่านเกณฑ์ขั้นต่ำโดยประมาณ"
                    : `ประมาณการเกณฑ์ผลงานขั้นต่ำ ~${formatTHB(match.breakdown.portfolio.estimatedRequired)} (ผลงานสูงสุดในโปรไฟล์: ${formatTHB(match.breakdown.portfolio.userMax)})`}
                </p>
              </div>

              {/* 5. Entity Type (10%) */}
              <div>
                <div className="flex items-center justify-between text-[12.5px] leading-thai">
                  <span className="text-ink font-medium">
                    สถานะผู้ยื่นข้อเสนอ <span className="text-[11.5px] text-ink-3 font-normal">(10%)</span>
                  </span>
                  <span className="font-mono text-[12px] font-semibold tnum text-ink">
                    {match.breakdown.entity.score}
                    <span className="text-[10.5px] text-ink-3 font-normal">/100</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      match.breakdown.entity.score >= 80
                        ? "bg-open"
                        : match.breakdown.entity.score >= 50
                        ? "bg-ink-2"
                        : "bg-amber-500"
                    }`}
                    style={{ width: `${match.breakdown.entity.score}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] leading-thai text-ink-3">
                  {match.breakdown.entity.disqualifiedDirectBid
                    ? "⚠️ TOR กำหนดเฉพาะนิติบุคคล แต่โปรไฟล์ลงทะเบียนเป็นบุคคลธรรมดา (แนะนำเข้าร่วมแบบ Joint Venture หรือ Subcontract)"
                    : "✓ สถานะนิติบุคคล/บุคคลธรรมดาตรงตามเงื่อนไขที่กำหนด"}
                </p>
              </div>

              {/* 6. Certifications & Standards (5%) */}
              <div>
                <div className="flex items-center justify-between text-[12.5px] leading-thai">
                  <span className="text-ink font-medium">
                    ใบรับรองและมาตรฐาน <span className="text-[11.5px] text-ink-3 font-normal">(5%)</span>
                  </span>
                  <span className="font-mono text-[12px] font-semibold tnum text-ink">
                    {match.breakdown.certifications.score}
                    <span className="text-[10.5px] text-ink-3 font-normal">/100</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      match.breakdown.certifications.score >= 80
                        ? "bg-open"
                        : match.breakdown.certifications.score >= 50
                        ? "bg-ink-2"
                        : "bg-amber-500"
                    }`}
                    style={{ width: `${match.breakdown.certifications.score}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] leading-thai text-ink-3">
                  {match.breakdown.certifications.totalRequired > 0
                    ? match.breakdown.certifications.matched.length > 0
                      ? `✓ ตรง ${match.breakdown.certifications.matched.length} จาก ${match.breakdown.certifications.totalRequired} มาตรฐานที่ระบุ`
                      : `ยังไม่มีใบรับรองที่ตรงจาก ${match.breakdown.certifications.totalRequired} รายการที่กำหนด`
                    : "TOR ไม่ระบุใบรับรองภาคบังคับ"}
                </p>
              </div>
            </div>
          </div>

          {/* Highlights & Checkmarks */}
          {match.breakdown.highlightsTh.length > 0 ? (
            <div className="mt-4 space-y-1.5 border-t border-line/60 pt-3.5">
              {match.breakdown.highlightsTh.map((hl, idx) => (
                <div key={idx} className="flex items-start gap-2 text-[13px] leading-thai text-ink">
                  <span className="text-open font-bold">✓</span>
                  <span>{hl}</span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Warnings & Considerations */}
          {match.breakdown.warningsTh.length > 0 ? (
            <div className="mt-3 space-y-2 border-t border-line/60 pt-3">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                ข้อควรระวังหรือสิ่งที่ขาด:
              </span>
              {match.breakdown.warningsTh.map((wn, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 text-[12.5px] leading-thai text-ink-2"
                >
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">⚠️</span>
                  <span>{wn}</span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Missing Skills breakdown */}
          {match.missing.length > 0 ? (
            <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-3 text-[12px]">
              <span className="text-ink-3">ทักษะที่ยังไม่มีในโปรไฟล์:</span>
              {match.missing.map((techName) => (
                <span
                  key={techName}
                  className="rounded-[2px] border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-3"
                >
                  ○ {techName}
                </span>
              ))}
            </div>
          ) : null}

          {/* Strategic Guidance & Recommendations */}
          {(match.disqualifiedDirectBid ||
            match.breakdown.portfolio.score < 80 ||
            match.breakdown.certifications.score < 70) ? (
            <div className="mt-4 rounded-md border border-line bg-surface-2/40 p-3.5">
              <h4 className="text-[12px] font-semibold text-ink flex items-center gap-1.5">
                <span>💡</span>
                <span>แนวทางและคำแนะนำเชิงกลยุทธ์สำหรับคุณ</span>
              </h4>
              <ul className="mt-2 space-y-2 text-[12px] leading-thai text-ink-2">
                {match.disqualifiedDirectBid ? (
                  <li className="flex items-start gap-2">
                    <span className="text-ink-3">•</span>
                    <span>
                      <strong className="text-ink font-medium">แนวทางเข้าร่วม:</strong>{" "}
                      โครงการนี้ระบุคุณสมบัติเฉพาะนิติบุคคล แต่คุณลงทะเบียนเป็นบุคคลธรรมดา
                      แนะนำรวมกลุ่มเป็น <em>กิจการร่วมค้า (Joint Venture)</em>{" "}
                      หรือติดต่อผู้เสนอราคารายใหญ่เพื่อรับงานในฐานะ{" "}
                      <em>ผู้รับเหมาช่วง (Subcontractor)</em> ในระบบส่วนที่คุณเชี่ยวชาญ
                    </span>
                  </li>
                ) : null}

                {match.breakdown.portfolio.score < 80 &&
                (facts.referencePriceTHB ?? facts.budgetTHB ?? 0) > 0 ? (
                  <li className="flex items-start gap-2">
                    <span className="text-ink-3">•</span>
                    <span>
                      <strong className="text-ink font-medium">เกณฑ์ผลงานสัญญาเดิม:</strong>{" "}
                      งานจัดซื้อจัดจ้างภาครัฐขนาดนี้มักกำหนดผลงานสัญญาเดียวไม่น้อยกว่า 40% (ประมาณ{" "}
                      {formatTHB(
                        Math.round((facts.referencePriceTHB ?? facts.budgetTHB ?? 0) * 0.4)
                      )}
                      ) การร่วมงานแบบ Subcontract หรือโครงการวิธีเฉพาะเจาะจง (≤ ฿500,000)
                      จะช่วยสะสมหนังสือรับรองผลงานเพื่อยื่นเป็นคู่สัญญาหลักในอนาคต
                    </span>
                  </li>
                ) : null}

                {match.breakdown.certifications.score < 70 ? (
                  <li className="flex items-start gap-2">
                    <span className="text-ink-3">•</span>
                    <span>
                      <strong className="text-ink font-medium">การยกระดับมาตรฐาน:</strong>{" "}
                      โครงการนี้มีข้อกำหนดด้านมาตรฐาน/ใบรับรอง
                      การได้รับรองมาตรฐานสากลที่หน่วยงานรัฐยอมรับ เช่น ISO/IEC 29110
                      จะช่วยเพิ่มแต้มต่อและปลดล็อกการยื่นข้อเสนอในโครงการรัฐอีกเป็นจำนวนมาก
                    </span>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          <div className="mt-4 border-t border-line/60 pt-3 flex items-center justify-between text-[11.5px]">
            <span className="text-ink-3">
              ผลการจับคู่คำนวณจากโปรไฟล์ของคุณ และไม่ถือเป็นผลการตรวจคุณสมบัติอย่างเป็นทางการ
            </span>
            <Link
              href="/profile"
              className="font-medium text-ink-2 underline underline-offset-2 hover:text-ink whitespace-nowrap ml-2"
            >
              ปรับแต่งโปรไฟล์ →
            </Link>
          </div>
        </AccentPanel>
      ) : !isAuthenticated ? (
        <Panel className="px-4 py-5 sm:px-6 sm:py-6">
          <SectionHeading sub="ประเมินความเข้ากันได้ของทักษะ สถาปัตยกรรมระบบ ช่วงงบประมาณ และเกณฑ์คุณสมบัติ">
            ความตรงกับคุณ (Profile Match)
          </SectionHeading>
          <div className="mt-3 rounded-[3px] border border-line bg-surface-2/60 p-4">
            <p className="text-[13px] leading-thai text-ink-2">
              ลงชื่อเข้าใช้ระบบเพื่อดูคะแนนความตรงกับโปรไฟล์ของคุณ ตรวจสอบว่าทักษะและงบประมาณตรงกับที่ทีมของคุณรับได้หรือไม่ พร้อมแจ้งเตือนเกณฑ์เฉพาะนิติบุคคล
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Link href="/auth" className={`${btn.secondary} text-[12px]`}>
                ลงชื่อเข้าใช้เพื่อดูผลจับคู่
              </Link>
              <span className="text-[11px] text-ink-3">
                ดูข้อมูลประกาศได้ครบถ้วนโดยไม่ต้องมีบัญชี
              </span>
            </div>
          </div>
        </Panel>
      ) : null}

      {/* 2. LOCK-SPEC & REQUIREMENT DEVIATIONS */}
      {lockSpec ? (
        <AccentPanel tone={lockTone} className="px-4 py-5 sm:px-6 sm:py-6">
          <SectionHeading
            sub="วิเคราะห์ข้อกำหนดทางเทคนิคและคุณสมบัติผู้ยื่นข้อเสนอตามแนวทางจัดซื้อจัดจ้างภาครัฐ (ว 214)"
            right={<LockSpecBadge level={lockLevel} score={lockScore ?? 0} outOf100 />}
          >
            วิเคราะห์ความเสี่ยงล็อกสเปก (Lock-Spec Risk)
          </SectionHeading>

          <div className="mt-2">
            <p className="text-[15px] leading-thai font-semibold text-ink">
              {lockSpec.verdictText}
            </p>
          </div>

          {/* Modular Finding Cards */}
          {lockSpec.findings && lockSpec.findings.length > 0 ? (
            <div className="mt-5 flex flex-col gap-4">
              {lockSpec.findings.map((finding, idx) => (
                <div
                  key={finding.id || idx}
                  className="rounded-[3px] border border-line bg-surface p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12px] font-bold text-ink-3">
                        #{String(idx + 1).padStart(2, "0")}
                      </span>
                      <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2 border border-line">
                        {formatCategoryLabel(finding.category)}
                      </span>
                    </div>

                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                        finding.severity === "high"
                          ? "bg-risk-bg text-risk border border-risk-line"
                          : "bg-amend-bg text-amend border border-amend-line"
                      }`}
                    >
                      {finding.severity === "high"
                        ? "ข้อจำกัดระดับสูง (+35 คะแนน)"
                        : "ข้อจำกัดระดับปานกลาง"}
                    </span>
                  </div>

                  <h4 className="mt-2.5 text-[14.5px] leading-thai font-semibold text-ink">
                    {finding.title}
                  </h4>

                  {finding.normalBenchmark ? (
                    <div className="mt-3 rounded-[3px] border border-line bg-surface-2/80 p-3 text-[13px] leading-thai">
                      <div className="font-semibold text-ink-2">
                        กฎหมายและระเบียบที่เกี่ยวข้อง:
                      </div>
                      <p className="mt-1 text-ink">{finding.normalBenchmark}</p>
                    </div>
                  ) : null}

                  {finding.sourceExcerpt ? (
                    <Well className="mt-2.5 border-l-2 border-l-line-2 px-3 py-2.5 text-[12.5px] text-ink-2">
                      <div className="mb-1 text-[11.5px] font-semibold text-ink-3">
                        ข้อกำหนดที่ระบบตรวจพบ:
                      </div>
                      <p className="italic">“{finding.sourceExcerpt}”</p>
                      {finding.sourceLocation ? (
                        <p className="mt-1.5 text-[11px] text-ink-3">
                          <span className="font-medium text-ink-2">อ้างอิงหมวด/ตำแหน่ง: </span>
                          <span>{finding.sourceLocation}</span>
                        </p>
                      ) : null}
                    </Well>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[3px] border border-open-line bg-open-bg/40 p-4 text-[13.5px] leading-thai text-open">
              ✓ ไม่พบเงื่อนไขล็อกสเปกหรือข้อกำหนดที่เบี่ยงเบนจากมาตรฐาน ข้อกำหนดเปิดกว้างสำหรับผู้ยื่นข้อเสนอทั่วไป
            </div>
          )}
        </AccentPanel>
      ) : (
        <NotAnalysed heading="วิเคราะห์ความเสี่ยงล็อกสเปก (Lock-Spec Risk)" />
      )}

      {/* 3. PRICE REALITY CHECK */}
      {price ? (
        <AccentPanel tone={priceTone} className="px-4 py-5 sm:px-6 sm:py-6">
          <SectionHeading
            sub="เปรียบเทียบราคากลางกับค่ามัธยฐานและค่าเฉลี่ยของโครงการที่ใกล้เคียงกันในอดีต"
            right={<InsightPriceBadge diffPercentage={price.diffPercentage} sampleSize={sampleCount} />}
          >
            ตรวจสอบความสมเหตุสมผลของราคา (Price Reality Check)
          </SectionHeading>

          {!hasSufficientPeers ? (
            <div className="mt-3 rounded-[3px] border border-line bg-surface-2/70 p-3.5 text-[13px] leading-thai text-ink-2">
              <div className="flex items-start gap-2.5">
                <span className="text-[16px] leading-none pt-0.5">ℹ️</span>
                <div>
                  <p className="font-semibold text-ink">
                    ข้อมูลโครงการเปรียบเทียบในอดีตยังไม่เพียงพอ (พบ {sampleCount} โครงการ)
                  </p>
                  <p className="mt-1 text-[12px] text-ink-3">
                    ระบบกำหนดเกณฑ์ขั้นต่ำอย่างน้อย 5 โครงการเพื่อคำนวณราคากลางและส่วนต่างราคาอย่างน่าเชื่อถือ จึงปิดการประเมินส่วนต่างราคาชั่วคราวเพื่อป้องกันข้อสรุปที่คลาดเคลื่อน
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[15px] leading-thai font-semibold text-ink">
              {price.interpretation || "ไม่มีข้อมูลสรุปผลการวิเคราะห์ราคา"}
            </p>
          )}

          {/* Benchmarks & Deviations Grid */}
          <div className={`mt-4 grid grid-cols-1 gap-3.5 rounded-[3px] border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3 ${
            !hasSufficientPeers ? "opacity-60 grayscale-[40%] select-none" : ""
          }`}>
            {/* 1. Target Evaluated Price / Budget */}
            <div className="rounded-[3px] border border-line/60 bg-surface-2/40 p-3">
              <Label>ราคากลางโครงการนี้ (Target Price)</Label>
              <p className="mt-1 font-mono text-[17px] font-semibold text-ink">
                {formatMoney(price.referencePriceTHB || facts.referencePriceTHB || facts.budgetTHB)}
              </p>
              {facts.budgetTHB && facts.budgetTHB !== (price.referencePriceTHB || facts.referencePriceTHB) ? (
                <p className="mt-1 text-[11.5px] text-ink-3">
                  งบประมาณ: <span className="font-mono">{formatMoney(facts.budgetTHB)}</span>
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-ink-3">
                  {price.referencePriceTHB || facts.referencePriceTHB
                    ? "ราคากลางทางการจากเอกสาร TOR"
                    : "ใช้วงเงินงบประมาณอ้างอิง"}
                </p>
              )}
            </div>

            {/* 2. Historical Median (Primary Benchmark) */}
            <div className="rounded-[3px] border border-line/60 bg-surface-2/40 p-3">
              <div className="flex items-center justify-between">
                <Label>ค่ามัธยฐานในอดีต (เกณฑ์หลัก)</Label>
              </div>
              <p className="mt-1 font-mono text-[17px] font-semibold text-ink-2">
                {formatBenchmarkMoney(price.historicalMedianTHB)}
              </p>
              <p className="mt-1 text-[11px] text-ink-3">
                ค่ากึ่งกลางของโครงการอ้างอิง (50th %ile)
              </p>
            </div>

            {/* 3. Historical Average (Secondary Benchmark) */}
            <div className="rounded-[3px] border border-line/60 bg-surface-2/40 p-3">
              <div className="flex items-center justify-between">
                <Label>ค่าเฉลี่ยในอดีต (เกณฑ์รอง)</Label>
              </div>
              <p className="mt-1 font-mono text-[17px] font-semibold text-ink-2">
                {formatBenchmarkMoney(price.historicalAverageTHB)}
              </p>
              <p className="mt-1 text-[11px] text-ink-3">
                ค่าเฉลี่ยคณิตศาสตร์ของโครงการใกล้เคียง
              </p>
            </div>

            {/* 4. Deviation vs Historical Median */}
            <div className="rounded-[3px] border border-line/60 bg-surface-2/40 p-3">
              <Label>ส่วนต่างเทียบมัธยฐาน (vs Median)</Label>
              {!hasSufficientPeers ? (
                <>
                  <p className="mt-1 font-mono text-[17px] font-bold text-ink-3">—</p>
                  <p className="mt-1 text-[11px] text-ink-3">
                    ยังไม่ประเมิน (ข้อมูลไม่ถึง 5 โครงการ)
                  </p>
                </>
              ) : (() => {
                const diff = formatSignedDiff(price.diffAmountTHB, price.diffPercentage);
                const toneClass = !diff.hasValue
                  ? "text-ink-3"
                  : (price.diffPercentage ?? 0) > 15
                  ? "text-amend"
                  : (price.diffPercentage ?? 0) < -15
                  ? "text-risk"
                  : "text-open";
                return (
                  <>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <p className={`font-mono text-[17px] font-bold ${toneClass}`}>
                        {diff.text}
                      </p>
                      {price.diffPercentage != null && (
                        <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${
                          price.diffPercentage < -15
                            ? "bg-risk-bg text-risk border border-risk-line"
                            : price.diffPercentage > 15
                            ? "bg-amend-bg text-amend border border-amend-line"
                            : "bg-open-bg text-open border border-open-line"
                        }`}>
                          {price.diffPercentage < -15
                            ? "งบต่ำกว่าตลาดมาก"
                            : price.diffPercentage > 15
                            ? "งบสูงกว่าตลาด"
                            : "ใกล้เคียงราคาตลาด"}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-ink-3">
                      {!diff.hasValue
                        ? "ไม่สามารถคำนวณส่วนต่างได้"
                        : Math.abs(price.diffPercentage ?? 0) <= 15
                        ? "อยู่ในช่วงมาตรฐานปกติ (±15%)"
                        : (price.diffPercentage ?? 0) > 15
                        ? "งบประมาณสูงกว่าเกณฑ์มัธยฐานในอดีต (มีกรอบงบประมาณเปิดกว้าง)"
                        : "⚠️ ระวัง: งบต่ำกว่าเกณฑ์ตลาดมาก ผู้รับจ้างอาจเสี่ยงทำงานขาดทุน"}
                    </p>
                  </>
                );
              })()}
            </div>

            {/* 5. Deviation vs Historical Average */}
            <div className="rounded-[3px] border border-line/60 bg-surface-2/40 p-3">
              <Label>ส่วนต่างเทียบค่าเฉลี่ย (vs Average)</Label>
              {!hasSufficientPeers ? (
                <>
                  <p className="mt-1 font-mono text-[17px] font-medium text-ink-3">—</p>
                  <p className="mt-1 text-[11px] text-ink-3">
                    ยังไม่ประเมิน (ข้อมูลไม่ถึง 5 โครงการ)
                  </p>
                </>
              ) : (() => {
                const avgDiff = formatSignedDiff(
                  price.diffAverageAmountTHB ?? price.diffAmountTHB,
                  price.diffAveragePercentage ?? null
                );
                return (
                  <>
                    <p className="mt-1 font-mono text-[17px] font-medium text-ink-2">
                      {avgDiff.text}
                    </p>
                    <p className="mt-1 text-[11px] text-ink-3">
                      {avgDiff.hasValue
                        ? "เปรียบเทียบกับค่าเฉลี่ยงบประมาณรวม"
                        : "ไม่มีข้อมูลส่วนต่างค่าเฉลี่ย"}
                    </p>
                  </>
                );
              })()}
            </div>

            {/* 6. Comparable Projects Count & Reliability */}
            <div className="rounded-[3px] border border-line/60 bg-surface-2/40 p-3">
              <Label>โครงการเปรียบเทียบ & ความน่าเชื่อถือ</Label>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-[17px] font-semibold text-ink">
                  {sampleCount}{" "}
                  <span className="text-[13px] font-normal text-ink-3">โครงการ</span>
                </span>
                {hasSufficientPeers ? (
                  <span className="rounded bg-open-bg px-2 py-0.5 text-[11px] font-medium text-open border border-open-line">
                    ข้อมูลเพียงพอ (≥5)
                  </span>
                ) : (
                  <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-3 border border-line">
                    ข้อมูลไม่เพียงพอ (&lt;5)
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-ink-3">
                {hasSufficientPeers
                  ? "มีข้อมูลเพียงพอต่อการคำนวณราคาตลาด"
                  : "เกณฑ์ขั้นต่ำ 5 โครงการในการประเมิน"}
              </p>
            </div>
          </div>

          {/* Peer projects table */}
          {price.comparableProjects && price.comparableProjects.length > 0 ? (
            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-[13.5px] font-semibold text-ink">
                  โครงการเปรียบเทียบที่ใช้คำนวณ
                </h4>
                <span className="font-mono text-[11.5px] text-ink-3">
                  แสดง {Math.min(visiblePeersCount, price.comparableProjects.length)} จากทั้งหมด {price.comparableProjects.length} โครงการ
                </span>
              </div>
              <div className="mt-2 overflow-x-auto rounded-[3px] border border-line">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="border-b border-line bg-surface-2/60 text-ink-3">
                    <tr>
                      <th className="px-3 py-2 font-medium">ชื่อโครงการ</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap shrink-0 text-center w-[120px]">
                        ปีงบประมาณ
                      </th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap shrink-0 text-right w-[150px]">
                        ราคากลาง
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-surface">
                    {price.comparableProjects.slice(0, visiblePeersCount).map((peer, idx) => (
                      <tr key={idx} className="hover:bg-surface-2/30">
                        <td className="px-3 py-2 font-medium text-ink min-w-[240px]">{peer.title}</td>
                        <td className="px-3 py-2 font-mono text-ink-3 whitespace-nowrap shrink-0 text-center">
                          {peer.year}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-medium text-ink whitespace-nowrap shrink-0">
                          {formatMoney(peer.referencePriceTHB)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {price.comparableProjects.length > visiblePeersCount && (
                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setVisiblePeersCount((prev) => prev + 10)}
                    className="inline-flex items-center gap-1.5 rounded-[3px] border border-line bg-surface-2 px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-surface-3 transition-colors shadow-sm cursor-pointer"
                  >
                    <span>+</span>
                    <span>
                      แสดงเพิ่มอีก {Math.min(10, price.comparableProjects.length - visiblePeersCount)} โครงการ
                    </span>
                  </button>
                  <span className="font-mono text-[11px] text-ink-3">
                    {Math.min(visiblePeersCount, price.comparableProjects.length)} / {price.comparableProjects.length}
                  </span>
                </div>
              )}

              {visiblePeersCount > 3 && price.comparableProjects.length <= visiblePeersCount && (
                <div className="mt-2 text-right">
                  <button
                    type="button"
                    onClick={() => setVisiblePeersCount(3)}
                    className="text-[11.5px] text-ink-3 hover:text-ink underline cursor-pointer"
                  >
                    ย่อกลับเหลือ 3 โครงการ
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </AccentPanel>
      ) : (
        <NotAnalysed heading="ตรวจสอบความสมเหตุสมผลของราคา (Price Reality Check)" />
      )}
    </div>
  );
}
