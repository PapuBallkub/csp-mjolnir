import Link from "next/link";
import type { TorInsightDetail } from "../../_lib/api";
import { isDead } from "../verdict";
import type { Match } from "../../_lib/match";
import { Fact, Label, Panel, btn } from "../ui";
import { formatMoney, formatDateString } from "./_lib/tor-helpers";

export function TorAside({
  insight,
  fiscalYear,
  officialEgpUrl,
  match,
  isAuthenticated,
  isSaved,
  toggleLoading,
  onWatchlistClick,
  onPreviewPdf,
  deadline,
}: {
  insight: TorInsightDetail;
  fiscalYear: number | null;
  officialEgpUrl: string | null;
  match: Match | null;
  isAuthenticated: boolean;
  isSaved: boolean;
  toggleLoading: boolean;
  onWatchlistClick: () => void;
  onPreviewPdf: () => void;
  deadline: { kind: string; date: string | null; label: { th: string; en: string } };
}) {
  const iden = insight.identification;
  const facts = insight.facts;
  const requiredTechNames: string[] = Array.from(
    new Set((insight.technicalRequirements.requiredTechnologies ?? []).map((t) => t.name).filter(Boolean))
  );

  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-[116px] lg:self-start">
      {/* 1. Core Price & Quick Dates Card */}
      <Panel className="px-4 pt-4 pb-3">
        <Label>ราคากลาง (Reference Price)</Label>
        <p className="mt-1.5 font-mono tnum text-[28px] leading-none font-semibold text-ink">
          {formatMoney(facts.referencePriceTHB || facts.budgetTHB)}
        </p>

        {facts.budgetTHB && facts.budgetTHB !== facts.referencePriceTHB ? (
          <p className="mt-1 text-[12px] text-ink-3">
            วงเงินงบประมาณ: <span className="font-mono">{formatMoney(facts.budgetTHB)}</span>
          </p>
        ) : null}

        <div className="mt-4 flex flex-col border-t border-line/60 pt-2">
          {/* Deadline */}
          {deadline.kind === "comment" ? (
            <Fact label={deadline.label.th}>
              {deadline.date ? (
                isDead(iden.status) ? (
                  <div className="flex flex-col sm:items-end gap-0.5">
                    <span className="tnum text-[14px] font-semibold text-ink">
                      {formatDateString(deadline.date)}
                    </span>
                    <span className="tnum text-[12px] font-medium text-ink-3">
                      ปิดรับความเห็นแล้ว
                    </span>
                  </div>
                ) : (
                  <span className="tnum text-[14px] font-semibold text-ink">
                    {formatDateString(deadline.date)}
                  </span>
                )
              ) : (
                <span className="text-[13px] text-ink-3">ไม่ระบุใน TOR</span>
              )}
            </Fact>
          ) : (
            <Fact label={deadline.label.th}>
              {deadline.date ? (
                isDead(iden.status) ? (
                  <div className="flex flex-col sm:items-end gap-0.5">
                    <span className="tnum text-[14px] font-semibold text-ink">
                      {formatDateString(deadline.date)}
                    </span>
                    <span className="tnum text-[12px] font-medium text-ink-3">
                      ปิดรับข้อเสนอแล้ว
                    </span>
                  </div>
                ) : (
                  <span className="tnum text-[14px] font-semibold text-ink">
                    {formatDateString(deadline.date)}
                  </span>
                )
              ) : (
                <span className="text-[13px] text-ink-3">ไม่ระบุใน TOR</span>
              )}
            </Fact>
          )}

          <Fact label="รหัสโครงการ">
            <span className="font-mono text-[12px] text-ink-2">{insight.projectId}</span>
          </Fact>

          <Fact label="วิธีการจัดหา">
            <span className="text-[12.5px] text-ink-2">
              {facts.procurementMethod || "ไม่ระบุใน TOR"}
            </span>
          </Fact>

          <Fact label="ระยะเวลาดำเนินงาน">
            <span className="text-[12.5px] text-ink-2">
              {facts.deliveryPeriodDays
                ? `${facts.deliveryPeriodDays} วัน`
                : "ไม่ระบุใน TOR"}
            </span>
          </Fact>

          <Fact label="ระยะเวลารับประกัน">
            <span className="text-[12.5px] text-ink-2">
              {facts.warrantyYears
                ? `${facts.warrantyYears} ปี`
                : "ไม่ระบุใน TOR"}
            </span>
          </Fact>

          <Fact label="อัตราค่าปรับล่าช้า">
            <span className="text-[12px] text-ink-2">
              {facts.penaltyClause || "ไม่ระบุใน TOR"}
            </span>
          </Fact>

          <Fact label="วันที่เผยแพร่">
            <span className="tnum text-[12px]">
              {formatDateString(facts.postedDate)}
            </span>
          </Fact>

          <Fact label="ปีงบประมาณ">
            <span className="tnum text-[12.5px] font-semibold text-ink">
              {fiscalYear ? `พ.ศ. ${fiscalYear}` : "ไม่ระบุใน TOR"}
            </span>
          </Fact>
        </div>

        {/* Document Actions (PDF Preview & Official e-GP Link) */}
        <div className="mt-4 border-t border-line pt-3 pb-1 space-y-2">
          <button
            type="button"
            onClick={onPreviewPdf}
            className={`${btn.primary} flex w-full items-center justify-center gap-1.5 text-[12px] cursor-pointer`}
          >
            <span>📄</span>
            <span>พรีวิวเอกสารต้นฉบับ (PDF)</span>
          </button>

          {officialEgpUrl ? (
            <a
              href={officialEgpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${btn.secondary} flex w-full items-center justify-center gap-1.5 text-[12px]`}
            >
              <span>เปิดดูบนระบบ e-GP ทางการ</span>
              <span>↗</span>
            </a>
          ) : null}

          <p className="mt-1.5 text-center text-[11px] leading-relaxed text-ink-3">
            <span className="block">การยื่นข้อเสนอและการประมูลทางการทำผ่าน e-GP เท่านั้น</span>
            <span className="block text-[10.5px] text-ink-3/80">
              (ระบบ e-GP ปิดปรับปรุงประจำวัน 00:00–04:00 น.)
            </span>
          </p>
        </div>
      </Panel>

      {/* 2. Watchlist Action Card */}
      <Panel className="p-4">
        <button
          type="button"
          onClick={onWatchlistClick}
          disabled={toggleLoading}
          className={isSaved ? `${btn.secondary} w-full text-[13px]` : `${btn.primary} w-full text-[13px]`}
          aria-pressed={isSaved}
        >
          {toggleLoading
            ? "กำลังอัปเดต…"
            : isSaved
            ? "✓ ติดตามประกาศนี้แล้ว"
            : "★ บันทึกไว้ติดตามการเปลี่ยนแปลง"}
        </button>
        <p className="mt-2 text-[11px] leading-thai text-ink-3">
          {isSaved
            ? "ระบบจะแจ้งเตือนเมื่อมีการออกเอกสารแก้ไข (Amendment) หรือประกาศผู้ชนะ"
            : "บันทึกเพื่อรับการแจ้งเตือนทันทีเมื่อมีการแก้ไข TOR หรือเลื่อนวันยื่นข้อเสนอ"}
        </p>
      </Panel>

      {/* 3. Capability Match Box (Auth-aware) */}
      <Panel className="p-4">
        <div className="flex items-center justify-between gap-2">
          <Label>ความตรงกับโปรไฟล์คุณ</Label>
          {isAuthenticated && match ? (
            <span className="font-mono text-[14px] font-bold text-open">
              {match.score}%
            </span>
          ) : null}
        </div>

        {isAuthenticated && match ? (
          <>
            <div className="mt-2 flex items-center justify-between text-[11.5px]">
              <span className="text-ink-3">ระดับความตรง:</span>
              <span className="font-semibold text-ink">
                {match.tier === "strong"
                  ? "ตรงมาก"
                  : match.tier === "good"
                  ? "ตรงปานกลาง-สูง"
                  : match.tier === "moderate"
                  ? "ตรงบางส่วน"
                  : "ตรงน้อย"}
              </span>
            </div>

            {match.disqualifiedDirectBid ? (
              <div className="mt-2 rounded-[2px] border border-amber-300 bg-amber-50/80 px-2.5 py-1.5 text-[11px] leading-thai text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                ⚠️ กำหนดเฉพาะนิติบุคคล (คุณเป็นบุคคลธรรมดา)
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
              {requiredTechNames.map((tName, idx) => {
                const isMatched = match.matched.includes(tName);
                return (
                  <span
                    key={`${tName}-${idx}`}
                    className={`inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 text-[11px] ${
                      isMatched
                        ? "border-open-line bg-open-bg text-open font-medium"
                        : "border-line bg-surface-2 text-ink-3"
                    }`}
                  >
                    <span>{isMatched ? "✓" : "○"}</span>
                    <span>{tName}</span>
                  </span>
                );
              })}
            </div>

            <Link
              href="/profile"
              className="mt-3 inline-block text-[11px] text-ink-2 underline underline-offset-2 hover:text-ink"
            >
              ปรับแต่งโปรไฟล์ของคุณ →
            </Link>
          </>
        ) : (
          <div className="mt-2 border-t border-line pt-2.5">
            <p className="text-[12px] leading-thai text-ink-2">
              ลงชื่อเข้าใช้เพื่อดูว่าโครงการนี้ตรงกับทักษะ ช่วงงบ และประเภทกิจการของคุณหรือไม่
            </p>
            <Link
              href="/auth"
              className={`${btn.secondary} mt-3 flex w-full items-center justify-center text-[12px]`}
            >
              ลงชื่อเข้าใช้เพื่อดูผลจับคู่
            </Link>
          </div>
        )}
      </Panel>
    </aside>
  );
}
