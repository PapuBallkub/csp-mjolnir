"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { listTors, type ApiResult, type TorInsightSummary } from "../../../_lib/api";
import { matchFor } from "../../../_lib/match";
import { useAuth } from "../../../_components/auth";
import { useProfile } from "../../../_components/prefs";
import { CatalogRow, CatalogRowSkeleton } from "../../../_components/catalog-row";
import { isDead } from "../../../_components/verdict";
import { btn, EmptyState, SectionHeading } from "../../../_components/ui";
import {
  DEFAULT_PAGE_SIZE,
  isHighRisk,
  MATCH_LIMIT,
  PAGE_SIZE_OPTIONS,
  type Page,
} from "../_lib/types";
import {
  buildMatchQueryString,
  parseMatchParams,
  syncUrlToBrowser,
} from "../_lib/search-params";
import { failureText } from "./SearchCommon";
import { MatchRail } from "./MatchRail";
import { Pagination } from "./Pagination";

export function MatchModeView({
  onStrongCountChange,
  onSwitchToFilter,
}: {
  onStrongCountChange?: (count: number) => void;
  onSwitchToFilter?: () => void;
}) {
  const { profile } = useProfile();
  const { status: authStatus } = useAuth();
  const searchParams = useSearchParams();

  const initialParsed = useMemo(() => parseMatchParams(searchParams), [searchParams]);

  const [scoreFloor, setScoreFloor] = useState(() => initialParsed.scoreFloor);
  const [hideClosed, setHideClosed] = useState(() => initialParsed.hideClosed);
  const [hideHighRisk, setHideHighRisk] = useState(() => initialParsed.hideHighRisk);
  const [page, setPage] = useState<number>(() => initialParsed.page ?? 1);
  const [pageSize, setPageSize] = useState<number>(() => initialParsed.pageSize ?? DEFAULT_PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Handle browser Back / Forward buttons (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const sp = new URLSearchParams(window.location.search);
      const parsed = parseMatchParams(sp);
      setScoreFloor(parsed.scoreFloor);
      setHideClosed(parsed.hideClosed);
      setHideHighRisk(parsed.hideHighRisk);
      setPage(parsed.page ?? 1);
      setPageSize(parsed.pageSize ?? DEFAULT_PAGE_SIZE);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Reset page when filter thresholds change
  const matchFilterSig = `${scoreFloor}:${hideClosed}:${hideHighRisk}`;
  const prevSig = useRef(matchFilterSig);
  useEffect(() => {
    if (prevSig.current !== matchFilterSig) {
      prevSig.current = matchFilterSig;
      setPage(1);
    }
  }, [matchFilterSig]);

  const isInitialMount = useRef(true);

  // Sync state changes to URL query string without reloading
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const qs = buildMatchQueryString({
      scoreFloor,
      hideClosed,
      hideHighRisk,
      page,
      pageSize,
    });
    syncUrlToBrowser(qs);
  }, [scoreFloor, hideClosed, hideHighRisk, page, pageSize]);

  /* ------------------------------- matching ------------------------------- */

  const profileKey = `${authStatus}:${profile.skills.join(",")}:${profile.budgetMin}:${profile.budgetMax}:${profile.entityType}:${(profile.preferredArchetypes ?? []).join(",")}`;
  const canMatch = authStatus === "authenticated";
  const [matchList, setMatchList] = useState<{ key: string; result: ApiResult<Page> } | null>(null);
  const [matchTry, setMatchTry] = useState(0);

  useEffect(() => {
    if (!canMatch) return;
    let cancelled = false;
    listTors({ limit: MATCH_LIMIT }).then((result) => {
      if (cancelled) return;
      setMatchList({
        key: profileKey,
        result: result.ok
          ? { ok: true, data: { ...result.data, key: profileKey, page: 1, pageSize: MATCH_LIMIT, at: new Date() } }
          : result,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [canMatch, profileKey, matchTry]);

  const matchResult = matchList?.key === profileKey ? matchList.result : null;

  const ranked = useMemo(() => {
    if (!matchResult?.ok) return [];
    const items = matchResult.data.tors.map((tor) => ({ tor, match: matchFor(tor, profile) }));
    return items.sort((a, b) => b.match.score - a.match.score);
  }, [matchResult, profile]);

  const isTorClosed = (tor: TorInsightSummary) => isDead(tor.identification.status) || Boolean(tor.contractSigned);
  const strongCount = ranked.filter((row) => row.match.score >= 70 && !isTorClosed(row.tor)).length;

  useEffect(() => {
    if (onStrongCountChange && matchResult?.ok) {
      onStrongCountChange(strongCount);
    }
  }, [strongCount, matchResult?.ok, onStrongCountChange]);

  const matchResults = ranked
    .filter((row) => row.match.score >= scoreFloor)
    .filter((row) => (hideClosed ? !isTorClosed(row.tor) : true))
    .filter((row) => (hideHighRisk ? !isHighRisk(row.tor) : true));

  /* ------------------------------- results -------------------------------- */

  const skeleton = (
    <div aria-busy="true">
      <span className="sr-only">กำลังโหลดประกาศ</span>
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: Math.min(pageSize, 5) }, (_, i) => (
          <CatalogRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );

  if (authStatus === "anonymous") {
    return (
      <EmptyState
        headline="ลงชื่อเข้าใช้ แล้วระบบจะจัดอันดับประกาศตามทักษะของคุณ"
        body="บันทึกเทคโนโลยีที่คุณทำได้และช่วงงบที่รับไหวไว้ในโปรไฟล์ แล้วประกาศที่ตรงกับคุณที่สุดจะขึ้นมาก่อน ส่วนการค้นหาและอ่านประกาศทุกรายการไม่ต้องลงชื่อเข้าใช้"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/auth" className={btn.primary}>
              ลงชื่อเข้าใช้
            </Link>
            {onSwitchToFilter ? (
              <button type="button" onClick={onSwitchToFilter} className={btn.secondary}>
                ค้นหาเองแทน
              </button>
            ) : null}
          </div>
        }
      />
    );
  }

  function renderMatchResults() {
    if (authStatus === "loading") return skeleton;
    if (!matchResult) return skeleton;

    if (!matchResult.ok) {
      return (
        <EmptyState
          headline="จัดอันดับไม่สำเร็จ"
          body={failureText(matchResult.error, "th")}
          action={
            <button type="button" onClick={() => setMatchTry((n) => n + 1)} className={btn.secondary}>
              ลองอีกครั้ง
            </button>
          }
        />
      );
    }

    if (matchResult.data.total === 0) {
      return (
        <EmptyState
          headline="ยังไม่มีประกาศในระบบที่พร้อมประเมิน"
          body="ยังไม่มีประกาศที่สรุปเสร็จและพร้อมเผยแพร่ ลองกลับมาใหม่ภายหลัง หรือค้นหาประกาศทั้งหมดในระบบ"
          action={
            onSwitchToFilter ? (
              <button type="button" onClick={onSwitchToFilter} className={btn.secondary}>
                ค้นหาเองจากทุกประกาศ
              </button>
            ) : null
          }
        />
      );
    }

    if (matchResults.length === 0) {
      return (
        <EmptyState
          headline="ไม่มีประกาศที่ผ่านเงื่อนไขนี้"
          body="ลองลดคะแนนขั้นต่ำ แสดงงานที่ไม่รับข้อเสนอแล้ว หรือเอาตัวกรองความเสี่ยงออก"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setScoreFloor(0);
                  setHideClosed(false);
                  setHideHighRisk(false);
                  setPage(1);
                }}
                className={btn.secondary}
              >
                แสดงทุกคะแนนและทุกสถานะ
              </button>
            </div>
          }
        />
      );
    }

    const noSkillsBanner =
      profile.skills.length === 0 ? (
        <div className="mb-2.5 flex items-center justify-between rounded-[3px] border border-amber-300 bg-amber-50 px-3.5 py-2 text-[12.5px] leading-thai text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <span>
            💡 คุณยังไม่ได้ระบุทักษะในโปรไฟล์ — ระบบกำลังจัดอันดับจากงบประมาณ สถาปัตยกรรม และเกณฑ์ทั่วไป
          </span>
          <Link href="/profile" className="ml-2 shrink-0 font-semibold underline hover:opacity-80">
            ตั้งค่าทักษะ →
          </Link>
        </div>
      ) : null;

    const total = matchResults.length;
    const pages = Math.ceil(total / pageSize);
    const pagedItems = matchResults.slice((page - 1) * pageSize, page * pageSize);

    return (
      <>
        <div className="flex flex-col gap-3">
          {noSkillsBanner}
          {pagedItems.map(({ tor, match }) => (
            <CatalogRow key={tor.projectId} tor={tor} now={matchResult.data.at} match={match} />
          ))}
        </div>

        <Pagination
          page={page}
          pages={pages}
          total={total}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageChange={(nextPage) => {
            setPage(nextPage);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onPageSizeChange={(newPageSize) => {
            setPageSize(newPageSize);
            setPage(1);
          }}
        />
      </>
    );
  }

  const rail = (
    <MatchRail
      lang="th"
      scoreFloor={scoreFloor}
      setScoreFloor={setScoreFloor}
      hideClosed={hideClosed}
      setHideClosed={setHideClosed}
      hideHighRisk={hideHighRisk}
      setHideHighRisk={setHideHighRisk}
      profile={profile}
    />
  );

  let countLine: string | null = null;
  if (matchResult?.ok) {
    const tors = matchResult.data.tors;
    const total = matchResult.data.total;
    countLine = `แสดง ${matchResults.length} จาก ${tors.length} ประกาศที่ประเมินความตรงกับคุณ${
      total > tors.length ? ` (จัดอันดับ ${tors.length} รายการที่ใกล้ครบกำหนดที่สุดจากทั้งหมด ${total})` : ""
    }`;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
      {/* Mobile Drawer Trigger */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setFiltersOpen(!filtersOpen)}
          aria-expanded={filtersOpen}
          className={`${btn.secondary} w-full justify-between cursor-pointer`}
        >
          <span>ตัวกรองและโปรไฟล์</span>
          <span className="font-mono text-[11px] text-ink-3">{filtersOpen ? "▲" : "▼"}</span>
        </button>
        {filtersOpen ? <div className="mt-3">{rail}</div> : null}
      </div>

      {/* Desktop Sticky Rail */}
      <aside className="hidden lg:block">
        <div className="sticky top-[76px] max-h-[calc(100vh-90px)] overflow-y-auto overscroll-contain pr-1.5 [scrollbar-width:thin] [scrollbar-color:var(--line)_transparent]">
          {rail}
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="min-w-0">
        <div className="mb-3">
          <SectionHeading
            sub="คะแนนประเมินจากทักษะ (40%), สถาปัตยกรรมระบบ (15%), ช่วงงบ (20%), ผลงานเดิม (10%), สถานะนิติบุคคล (10%) และมาตรฐาน (5%)"
          >
            {matchResult?.ok ? `ตรงกับคุณมาก ${strongCount} งาน` : "งานที่ตรงกับคุณ"}
          </SectionHeading>
        </div>

        <p className="mb-2 min-h-[16px] tnum text-[12.5px] text-ink-3" aria-live="polite">
          {countLine}
        </p>

        {renderMatchResults()}
      </div>
    </div>
  );
}
