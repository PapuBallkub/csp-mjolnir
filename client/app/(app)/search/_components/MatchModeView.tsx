"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { listTors, type ApiResult, type TorInsightSummary } from "../../../_lib/api";
import { matchFor } from "../../../_lib/match";
import { useAuth } from "../../../_components/auth";
import { useLang, useProfile } from "../../../_components/prefs";
import { CatalogRow, CatalogRowSkeleton } from "../../../_components/catalog-row";
import { isDead } from "../../../_components/verdict";
import { btn, EmptyState, SectionHeading } from "../../../_components/ui";
import { isHighRisk, MATCH_LIMIT, type Page } from "../_lib/types";
import {
  buildMatchQueryString,
  parseMatchParams,
  syncUrlToBrowser,
} from "../_lib/search-params";
import { failureText } from "./SearchCommon";
import { MatchRail } from "./MatchRail";

export function MatchModeView({
  onStrongCountChange,
  onSwitchToFilter,
}: {
  onStrongCountChange?: (count: number) => void;
  onSwitchToFilter?: () => void;
}) {
  const { lang } = useLang();
  const { profile } = useProfile();
  const { status: authStatus } = useAuth();
  const searchParams = useSearchParams();

  const [scoreFloor, setScoreFloor] = useState(() => parseMatchParams(searchParams).scoreFloor);
  const [hideClosed, setHideClosed] = useState(() => parseMatchParams(searchParams).hideClosed);
  const [hideHighRisk, setHideHighRisk] = useState(() => parseMatchParams(searchParams).hideHighRisk);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Handle browser Back / Forward buttons (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const sp = new URLSearchParams(window.location.search);
      const parsed = parseMatchParams(sp);
      setScoreFloor(parsed.scoreFloor);
      setHideClosed(parsed.hideClosed);
      setHideHighRisk(parsed.hideHighRisk);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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
    });
    syncUrlToBrowser(qs);
  }, [scoreFloor, hideClosed, hideHighRisk]);

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
          ? { ok: true, data: { key: profileKey, ...result.data, at: new Date() } }
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
      <span className="sr-only">{lang === "th" ? "กำลังโหลดประกาศ" : "Loading postings"}</span>
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 5 }, (_, i) => (
          <CatalogRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );

  if (authStatus === "anonymous") {
    return (
      <EmptyState
        headline={
          lang === "th"
            ? "ลงชื่อเข้าใช้ แล้วระบบจะจัดอันดับประกาศตามทักษะของคุณ"
            : "Sign in and we'll rank postings by your skills"
        }
        body={
          lang === "th"
            ? "บันทึกเทคโนโลยีที่คุณทำได้และช่วงงบที่รับไหวไว้ในโปรไฟล์ แล้วประกาศที่ตรงกับคุณที่สุดจะขึ้นมาก่อน ส่วนการค้นหาและอ่านประกาศทุกรายการไม่ต้องลงชื่อเข้าใช้"
            : "Save the technologies you build with and the budget you can take on, and the postings that fit you best come first. Searching and reading every posting needs no account."
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/auth" className={btn.primary}>
              {lang === "th" ? "ลงชื่อเข้าใช้" : "Sign in"}
            </Link>
            {onSwitchToFilter ? (
              <button type="button" onClick={onSwitchToFilter} className={btn.secondary}>
                {lang === "th" ? "ค้นหาเองแทน" : "Search by hand instead"}
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
          headline={lang === "th" ? "จัดอันดับไม่สำเร็จ" : "Couldn't rank the postings"}
          body={failureText(matchResult.error, lang)}
          action={
            <button type="button" onClick={() => setMatchTry((n) => n + 1)} className={btn.secondary}>
              {lang === "th" ? "ลองอีกครั้ง" : "Try again"}
            </button>
          }
        />
      );
    }

    if (matchResult.data.total === 0) {
      return (
        <EmptyState
          headline={
            lang === "th"
              ? "ยังไม่มีประกาศในระบบที่พร้อมประเมิน"
              : "No postings in the system ready for matching yet"
          }
          body={
            lang === "th"
              ? "ยังไม่มีประกาศที่สรุปเสร็จและพร้อมเผยแพร่ ลองกลับมาใหม่ภายหลัง หรือค้นหาประกาศทั้งหมดในระบบ"
              : "No posting has been cleared for publishing yet. Check back later or search all postings."
          }
          action={
            onSwitchToFilter ? (
              <button type="button" onClick={onSwitchToFilter} className={btn.secondary}>
                {lang === "th" ? "ค้นหาเองจากทุกประกาศ" : "Search every posting"}
              </button>
            ) : null
          }
        />
      );
    }

    if (matchResults.length === 0) {
      return (
        <EmptyState
          headline={lang === "th" ? "ไม่มีประกาศที่ผ่านเงื่อนไขนี้" : "Nothing passes these settings"}
          body={
            lang === "th"
              ? "ลองลดคะแนนขั้นต่ำ แสดงงานที่ไม่รับข้อเสนอแล้ว หรือเอาตัวกรองความเสี่ยงออก"
              : "Try a lower score floor, showing projects no longer taking bids, or dropping the risk filter."
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setScoreFloor(0);
                  setHideClosed(false);
                  setHideHighRisk(false);
                }}
                className={btn.secondary}
              >
                {lang === "th" ? "แสดงทุกคะแนนและทุกสถานะ" : "Show all scores and projects"}
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
            {lang === "th"
              ? "💡 คุณยังไม่ได้ระบุทักษะในโปรไฟล์ — ระบบกำลังจัดอันดับจากงบประมาณ สถาปัตยกรรม และเกณฑ์ทั่วไป"
              : "💡 You haven't added tech skills to your profile yet — ranking by budget, archetype, and general eligibility."}
          </span>
          <Link href="/profile" className="ml-2 shrink-0 font-semibold underline hover:opacity-80">
            {lang === "th" ? "ตั้งค่าทักษะ →" : "Add skills →"}
          </Link>
        </div>
      ) : null;

    return (
      <div className="flex flex-col gap-2.5">
        {noSkillsBanner}
        {matchResults.map(({ tor, match }) => (
          <CatalogRow key={tor.projectId} tor={tor} now={matchResult.data.at} match={match} />
        ))}
      </div>
    );
  }

  const rail = (
    <MatchRail
      lang={lang}
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
    countLine =
      lang === "th"
        ? `แสดง ${matchResults.length} จาก ${tors.length} ประกาศที่ประเมินความตรงกับคุณ${
            total > tors.length ? ` (จัดอันดับ ${tors.length} รายการที่ใกล้ครบกำหนดที่สุดจากทั้งหมด ${total})` : ""
          }`
        : `Showing ${matchResults.length} of ${tors.length} scored for you${
            total > tors.length ? ` (ranked the ${tors.length} due soonest of ${total})` : ""
          }`;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* Mobile Drawer Trigger */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setFiltersOpen(!filtersOpen)}
          aria-expanded={filtersOpen}
          className={`${btn.secondary} w-full justify-between`}
        >
          <span>{lang === "th" ? "ตัวกรองและโปรไฟล์" : "Filters and profile"}</span>
          <span className="font-mono text-[11px] text-ink-3">{filtersOpen ? "−" : "+"}</span>
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
            sub={
              lang === "th"
                ? "คะแนนประเมินจากทักษะ (40%), สถาปัตยกรรมระบบ (15%), ช่วงงบ (20%), ผลงานเดิม (10%), สถานะนิติบุคคล (10%) และมาตรฐาน (5%) เครื่องหมาย ✓ คือทักษะที่คุณมี"
                : "Scored on skills (40%), architecture (15%), budget (20%), past portfolio (10%), entity type (10%), and standards (5%). A ✓ marks a skill you have."
            }
          >
            {matchResult?.ok
              ? lang === "th"
                ? `ตรงกับคุณมาก ${strongCount} งาน`
                : `${strongCount} strong matches for you`
              : lang === "th"
                ? "งานที่ตรงกับคุณ"
                : "Postings that fit you"}
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
