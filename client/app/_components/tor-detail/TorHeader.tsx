import { Fragment } from "react";
import Link from "next/link";
import type { ChangeSource, TorInsightDetail } from "../../_lib/api";
import { type RiskLevel } from "../../_data/tors";
import { categoryLabel } from "../../_lib/categories";
import {
  ChangeMarker,
  CompaniesOnlyBadge,
  isDead,
  LifecycleBadge,
} from "../verdict";
import { countdownText, daysLeft } from "../deadline";
import { type Stage } from "../../_lib/stage";
import type { Match } from "../../_lib/match";
import { formatDateString, ChangeNotice } from "./_lib/tor-helpers";

function ReviewNotice({
  review,
  webUrl,
  onPreviewPdf,
}: {
  review: TorInsightDetail["review"];
  webUrl: string | null;
  onPreviewPdf?: () => void;
}) {
  if (review.origin === "demo") {
    return (
      <p className="mt-3 max-w-4xl rounded-[3px] border border-amend-line bg-amend-bg px-3 py-2 text-[12.5px] leading-thai text-amend">
        ข้อมูลตัวอย่างสำหรับทดสอบหน้าจอ — เนื้อหาและผลวิเคราะห์ในหน้านี้สร้างขึ้นเอง ไม่ได้อ่านจากเอกสาร TOR จริง
      </p>
    );
  }
  if (review.checked) return null;

  return (
    <div className="mt-3 max-w-4xl rounded-[3px] border border-line bg-surface-2 px-3 py-2 text-[12.5px] leading-thai text-ink-2">
      <p className="font-medium text-ink">
        สรุปโดย AI จากเอกสาร TOR · ยังไม่มีเจ้าหน้าที่ตรวจสอบ
      </p>
      <p className="mt-0.5">
        {onPreviewPdf ? (
          <button
            type="button"
            onClick={onPreviewPdf}
            className="underline hover:text-ink font-medium cursor-pointer"
          >
            พรีวิวเอกสารต้นฉบับ (PDF)
          </button>
        ) : (
          "ตรวจสอบกับเอกสารต้นฉบับก่อนตัดสินใจ"
        )}
        {webUrl ? (
          <>
            {" · "}
            <a href={webUrl} target="_blank" rel="noreferrer" className="underline hover:text-ink">
              เปิดใน e-GP
            </a>
          </>
        ) : null}
      </p>
    </div>
  );
}

export function TorHeader({
  insight,
  handleBackToSearch,
  stage,
  marker,
  pending,
  lockLevel,
  lockScore,
  scope,
  fiscalYear,
  deadline,
  officialEgpUrl,
  match,
  isAuthenticated,
  onPreviewPdf,
}: {
  insight: TorInsightDetail;
  handleBackToSearch: (e: React.MouseEvent) => void;
  stage: Stage;
  marker: ChangeSource | null;
  pending: NonNullable<TorInsightDetail["amendments"]>[number] | null;
  lockLevel: RiskLevel;
  lockScore: number | null;
  scope: { th: string; en: string };
  fiscalYear: number | null;
  deadline: { kind: string; date: string | null; label: { th: string; en: string } };
  officialEgpUrl: string | null;
  match: Match | null;
  isAuthenticated: boolean;
  onPreviewPdf: () => void;
}) {
  const iden = insight.identification;
  const price = insight.analytics.priceAnalysis;
  const diffPct = price?.diffPercentage ?? null;
  const sampleCount = price?.sampleSize ?? price?.comparableProjects?.length ?? 0;
  const hasSufficientPeers = sampleCount >= 5;

  const lockTone: "open" | "amend" | "risk" =
    lockLevel === "high" ? "risk" : lockLevel === "medium" ? "amend" : "open";

  const requiredTechCount = insight.technicalRequirements.requiredTechnologies?.length ?? 0;

  return (
    <header className="relative border-b border-line bg-surface">
      <div className="scanlines pointer-events-none absolute inset-0 opacity-50" aria-hidden />

      <div className="relative mx-auto max-w-[1240px] px-4 py-6">
        <nav className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
          <Link href="/search" onClick={handleBackToSearch} className="hover:text-ink hover:underline">
            ค้นหาประกาศ
          </Link>
          <span>/</span>
          <span className="font-mono tnum text-ink-2">{insight.projectId}</span>
          <span className="h-3 w-px bg-line" />
          <span className="font-mono">
            {iden.egpReference
              ? iden.egpReference.toLowerCase().startsWith("e-gp")
                ? iden.egpReference
                : `e-GP ${iden.egpReference}`
              : `e-GP ${insight.projectId}`}
          </span>
        </nav>

        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
          <span className="font-medium text-ink">{iden.agency}</span>
          {iden.department ? (
            <>
              <span className="h-3 w-px bg-line" />
              <span className="text-ink-3">{iden.department}</span>
            </>
          ) : null}
          {(iden.categories ?? []).map((category, index) => (
            <Fragment key={category}>
              {index === 0 ? <span className="h-3 w-px bg-line" /> : null}
              <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-3">
                {categoryLabel(category, "th")}
              </span>
            </Fragment>
          ))}
        </p>

        <h1 className="mt-2 max-w-4xl text-[24px] sm:text-[28px] leading-thai font-semibold tracking-tight text-ink">
          {iden.titleTh || iden.titleEn}
        </h1>

        {iden.titleEn && iden.titleTh !== iden.titleEn ? (
          <p className="mt-1.5 max-w-4xl text-[14px] leading-thai text-ink-3">
            {iden.titleEn}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* Status & Stage */}
          <LifecycleBadge status={iden.status} stage={stage} size="large" />
          {marker ? <ChangeMarker source={marker} /> : null}

          {/* Deadline Countdown Pill (active bids only, avoiding duplicate with LifecycleBadge) */}
          {deadline.date && !isDead(iden.status) ? (() => {
            const days = daysLeft(deadline.date, new Date());
            const cd = countdownText(days);
            const pillStyle =
              days <= 2
                ? "border-risk-line bg-risk-bg text-risk"
                : days <= 7
                ? "border-amend-line bg-amend-bg text-amend"
                : "border-line bg-surface-2 text-ink";
            return (
              <span className={`inline-flex items-center gap-1.5 rounded-[2px] border px-2.5 py-[3px] text-[11.5px] font-semibold tnum ${pillStyle}`}>
                <span>{cd.text}</span>
                <span className="font-normal opacity-75">· {formatDateString(deadline.date)}</span>
              </span>
            );
          })() : null}

          {/* Fiscal Year Badge */}
          {fiscalYear ? (
            <span className="inline-flex items-center rounded-[2px] border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-2 font-mono leading-normal">
              ปีงบประมาณ {fiscalYear}
            </span>
          ) : null}

          {/* Scope Badge */}
          <span className="inline-flex items-center rounded-[2px] border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink-2 leading-normal">
            {scope.th}
          </span>

          {/* Companies Only Badge */}
          {insight.companiesOnly ? <CompaniesOnlyBadge /> : null}
        </div>

        <ReviewNotice
          review={insight.review}
          webUrl={officialEgpUrl}
          onPreviewPdf={onPreviewPdf}
        />
        {pending ? <ChangeNotice change={pending} /> : null}

        {/* Verdict Strip */}
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[3px] border border-line bg-surface-2/60 p-2.5 sm:gap-6 sm:px-4">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-ink-3">วิเคราะห์ล็อกสเปก:</span>
            {lockScore === null ? (
              <span className="text-[12px] text-ink-3">ยังไม่ได้วิเคราะห์</span>
            ) : (
              <span
                className={`font-mono text-[12px] font-semibold ${
                  lockTone === "risk"
                    ? "text-risk"
                    : lockTone === "amend"
                    ? "text-amend"
                    : "text-open"
                }`}
              >
                {lockScore}/100 (
                {lockScore >= 70
                  ? "เสี่ยงสูง"
                  : lockScore >= 35
                  ? "ปานกลาง"
                  : "เสี่ยงต่ำ"}
                )
              </span>
            )}
          </div>

          <div className="hidden h-3 w-px bg-line sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-[12px] text-ink-3">เทียบราคากลางในอดีต:</span>
            {!hasSufficientPeers ? (
              <span className="text-[12px] text-ink-3">ข้อมูลไม่เพียงพอ</span>
            ) : diffPct === null ? (
              <span className="text-[12px] text-ink-3">ยังไม่ได้วิเคราะห์</span>
            ) : (
              <span
                className={`font-mono text-[12px] font-semibold ${
                  diffPct > 15
                    ? "text-amend"
                    : diffPct < -15
                    ? "text-risk"
                    : "text-open"
                }`}
              >
                {diffPct > 0 ? `+${diffPct}%` : `${diffPct}%`}
              </span>
            )}
          </div>

          <div className="hidden h-3 w-px bg-line sm:block" />

          {/* Match with You (Auth-aware) */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-ink-3">ตรงกับคุณ:</span>
            {isAuthenticated && match ? (
              <span className="font-mono text-[12px] font-semibold text-open">
                {match.score}% ({match.matched.length}/{requiredTechCount} ทักษะ)
              </span>
            ) : (
              <Link
                href="/auth"
                className="text-[12px] font-medium text-ink-2 hover:text-ink underline underline-offset-2"
              >
                ลงชื่อเข้าใช้เพื่อดูความตรง
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
