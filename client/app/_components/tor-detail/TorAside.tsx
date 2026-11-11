import type { TorInsightDetail } from "../../_lib/api";
import { isDead } from "../verdict";
import { Fact, Label, Panel, btn } from "../ui";
import { formatMoney, formatDateString } from "./_lib/tor-helpers";

export function TorAside({
  insight,
  fiscalYear,
  officialEgpUrl,
  onPreviewPdf,
  deadline,
  isSaved,
  isPopping,
  toggleLoading,
  onWatchlistClick,
}: {
  insight: TorInsightDetail;
  fiscalYear: number | null;
  officialEgpUrl: string | null;
  onPreviewPdf: () => void;
  deadline: { kind: string; date: string | null; label: { th: string; en: string } };
  isSaved?: boolean;
  isPopping?: boolean;
  toggleLoading?: boolean;
  onWatchlistClick?: () => void;
}) {
  const iden = insight.identification;
  const facts = insight.facts;

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

        {/* Document Actions (PDF Preview, Watchlist & Official e-GP Link) */}
        <div className="mt-4 border-t border-line pt-3 pb-1 space-y-2">
          <button
            type="button"
            onClick={onPreviewPdf}
            className={`${btn.primary} flex w-full items-center justify-center gap-1.5 text-[12.5px] cursor-pointer`}
          >
            <span>📄</span>
            <span>พรีวิวเอกสารต้นฉบับ (PDF)</span>
          </button>

          {onWatchlistClick ? (
            <button
              type="button"
              onClick={onWatchlistClick}
              disabled={toggleLoading}
              aria-pressed={isSaved}
              className={`relative flex h-9 w-full shrink-0 items-center justify-center gap-2 rounded-[3px] px-3.5 text-[12.5px] font-medium transition-colors duration-200 cursor-pointer select-none ${
                isSaved
                  ? "border border-open-line bg-open-bg text-open hover:opacity-90"
                  : "border border-line-2 bg-surface text-ink hover:bg-surface-2"
              }`}
            >
              {isPopping ? (
                <span className="pointer-events-none absolute inset-0 rounded-[3px] bg-open/15 animate-pulse-ring" />
              ) : null}

              <span
                className={`inline-flex shrink-0 items-center justify-center transition-transform duration-300 ${
                  isPopping ? "animate-bookmark-pop" : ""
                }`}
              >
                {isSaved ? (
                  <span className="text-open font-bold text-[14px]">✓</span>
                ) : (
                  <span className="text-[13px] text-ink-2">★</span>
                )}
              </span>

              <span className="whitespace-nowrap">
                {isSaved ? "ติดตามประกาศนี้แล้ว" : "บันทึกติดตามประกาศนี้"}
              </span>
            </button>
          ) : null}

          {officialEgpUrl ? (
            <a
              href={officialEgpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[3px] border border-line bg-surface text-[12px] font-medium text-ink-2 transition-colors hover:border-line-2 hover:bg-surface-2 hover:text-ink cursor-pointer"
            >
              <span>เปิดดูบนระบบ e-GP ทางการ</span>
              <span className="text-[11px] text-ink-2">↗</span>
            </a>
          ) : null}
        </div>
      </Panel>
    </aside>
  );
}
