"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { TorInsightDetail } from "../../_lib/api";
import { type RiskLevel } from "../../_data/tors";
import { markerSource, pendingChange } from "../../_lib/changes";
import { getEgpAnnouncementUrl, getFiscalYear } from "../../_lib/format";
import { useProfile } from "../prefs";
import { useAuth } from "../auth";
import { deadlineOf, stageOf } from "../../_lib/stage";
import { matchFor } from "../../_lib/match";
import { btn } from "../ui";
import { getScopeSize } from "./_lib/tor-helpers";
import { TorHeader } from "./TorHeader";
import { TorAside } from "./TorAside";
import { OverviewTab } from "./tabs/OverviewTab";
import { TechnicalSpecsTab } from "./tabs/TechnicalSpecsTab";
import { DecisionSupportTab } from "./tabs/DecisionSupportTab";
import { EligibilityHistoryTab } from "./tabs/EligibilityHistoryTab";

// Dynamic import for PDF preview modal to optimize initial bundle size
const PdfPreviewModal = dynamic(
  () => import("../PdfPreviewModal").then((mod) => mod.PdfPreviewModal),
  { ssr: false }
);

export type TabKey = "overview" | "specs" | "analysis" | "eligibility";

interface TabItem {
  key: TabKey;
  label: string;
  icon: string;
  badge?: string | number | null;
  badgeTone?: "open" | "amend" | "risk" | "neutral";
}

export function TorDetail({
  insight,
}: {
  insight: TorInsightDetail;
}) {
  const { profile } = useProfile();
  const { user, status: authStatus, addToWatchlist, removeFromWatchlist } = useAuth();
  const isAuthenticated = authStatus === "authenticated" && !!user;
  const router = useRouter();

  const handleBackToSearch = (e: React.MouseEvent) => {
    if (typeof window !== "undefined") {
      if (document.referrer) {
        try {
          const ref = new URL(document.referrer);
          if (ref.origin === window.location.origin && ref.pathname === "/search") {
            e.preventDefault();
            router.back();
            return;
          }
        } catch {}
      }

      try {
        const lastSearch = sessionStorage.getItem("gipdp_last_search_url");
        if (lastSearch) {
          const parsed = new URL(lastSearch, window.location.origin);
          if (parsed.origin === window.location.origin && parsed.pathname === "/search") {
            e.preventDefault();
            router.push(lastSearch);
            return;
          }
        }
      } catch {}

      if (window.location.hash === "#profile-match") {
        e.preventDefault();
        router.push("/search?mode=match");
        return;
      }
    }
  };

  const projectId = insight.projectId;
  const isSaved = user?.watchlist?.includes(projectId) ?? false;
  const [toggleLoading, setToggleLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);

  // Tab State & Hash sync
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash === "#profile-match" || hash === "#analysis" || hash === "#lock-spec" || hash === "#price") {
        return "analysis";
      }
      if (hash === "#specs" || hash === "#tech") {
        return "specs";
      }
      if (hash === "#changes" || hash === "#eligibility") {
        return "eligibility";
      }
    }
    return "overview";
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === "#profile-match" || hash === "#analysis" || hash === "#lock-spec" || hash === "#price") {
        setActiveTab("analysis");
      } else if (hash === "#specs" || hash === "#tech") {
        setActiveTab("specs");
      } else if (hash === "#changes" || hash === "#eligibility") {
        setActiveTab("eligibility");
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (!showAuthModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAuthModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showAuthModal]);

  const handleWatchlistClick = async () => {
    if (!isAuthenticated) {
      setShowAuthModal(true);
      return;
    }
    setToggleLoading(true);
    if (isSaved) {
      await removeFromWatchlist(projectId);
    } else {
      await addToWatchlist(projectId);
    }
    setToggleLoading(false);
  };

  const iden = insight.identification;
  const facts = insight.facts;
  const lockSpec = insight.analytics.lockSpec;
  const amend = insight.amendmentInfo;
  const stage = stageOf({
    status: iden.status,
    latestAnnouncement: insight.latestAnnouncement,
    contractSigned: insight.contractSigned,
  });
  const deadline = deadlineOf(iden.status, facts);
  const changes = insight.amendments ?? [];
  const marker = markerSource(insight, stage.saysChanged);
  const pending = pendingChange(changes);

  const scope = getScopeSize(facts.referencePriceTHB || facts.budgetTHB);
  const fiscalYear = getFiscalYear(facts.postedDate, insight.projectId);
  const officialEgpUrl =
    facts.webUrl && !facts.webUrl.includes("process3.gprocurement.go.th")
      ? facts.webUrl
      : getEgpAnnouncementUrl(projectId);

  const match = isAuthenticated ? matchFor(insight, profile) : null;
  const matchedSkills = match ? match.matched : [];

  const lockScore = lockSpec?.riskScore ?? null;
  const lockLevel: RiskLevel = lockScore === null ? "low" : lockScore >= 70 ? "high" : lockScore >= 35 ? "medium" : "low";
  const lockTone: "open" | "amend" | "risk" =
    lockLevel === "high" ? "risk" : lockLevel === "medium" ? "amend" : "open";

  const tabs: TabItem[] = [
    {
      key: "overview",
      label: "ภาพรวม & ขอบเขตงาน",
      icon: "📋",
    },
    {
      key: "specs",
      label: "ข้อกำหนดทางเทคนิค",
      icon: "⚙️",
      badge: insight.technicalRequirements.requiredTechnologies?.length
        ? `${insight.technicalRequirements.requiredTechnologies.length} stack`
        : null,
      badgeTone: "neutral",
    },
    {
      key: "analysis",
      label: "การวิเคราะห์ & ความเหมาะสม",
      icon: "🔍",
      badge: isAuthenticated && match ? `${match.score}% ตรง` : lockScore != null && lockScore >= 35 ? "ตรวจพบความเสี่ยง" : null,
      badgeTone: isAuthenticated && match ? "open" : lockScore != null && lockScore >= 70 ? "risk" : "amend",
    },
    {
      key: "eligibility",
      label: "คุณสมบัติ & เอกสาร",
      icon: "📑",
      badge: amend.isAmended ? "แก้ไขแล้ว" : null,
      badgeTone: "amend",
    },
  ];

  return (
    <article className="pb-16">
      {/* 1. HEADER */}
      <TorHeader
        insight={insight}
        handleBackToSearch={handleBackToSearch}
        stage={stage}
        marker={marker}
        pending={pending}
        lockLevel={lockLevel}
        lockScore={lockScore}
        scope={scope}
        fiscalYear={fiscalYear}
        deadline={deadline}
        officialEgpUrl={officialEgpUrl}
        match={match}
        isAuthenticated={isAuthenticated}
        onPreviewPdf={() => setIsPdfModalOpen(true)}
      />

      {/* 2. STICKY SEGMENTED CONTROL (TABS) */}
      <div className="sticky top-[53px] z-20 border-b border-line bg-surface/95 backdrop-blur-md shadow-xs">
        <div className="mx-auto max-w-[1240px] px-4">
          <nav
            role="tablist"
            aria-label="หัวข้อรายละเอียดโครงการ"
            className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2.5 no-scrollbar"
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`tab-panel-${tab.key}`}
                  onClick={() => {
                    setActiveTab(tab.key);
                    if (typeof window !== "undefined") {
                      window.history.replaceState(null, "", `#${tab.key}`);
                    }
                  }}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-[4px] px-3.5 py-2 text-[13px] font-medium transition-all cursor-pointer ${
                    isActive
                      ? "bg-ink text-surface shadow-sm"
                      : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  <span className="text-[14px]">{tab.icon}</span>
                  <span>{tab.label}</span>

                  {tab.badge ? (
                    <span
                      className={`rounded px-1.5 py-0.2 font-mono text-[10.5px] font-semibold leading-tight ${
                        isActive
                          ? "bg-surface/20 text-surface"
                          : tab.badgeTone === "open"
                          ? "bg-open-bg text-open border border-open-line"
                          : tab.badgeTone === "risk"
                          ? "bg-risk-bg text-risk border border-risk-line"
                          : tab.badgeTone === "amend"
                          ? "bg-amend-bg text-amend border border-amend-line"
                          : "bg-surface-3 text-ink-3"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* 3. MAIN BODY & ASIDE GRID */}
      <div className="mx-auto grid max-w-[1240px] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ASIDE COLUMN */}
        <div className="order-1 lg:order-2">
          <TorAside
            insight={insight}
            fiscalYear={fiscalYear}
            officialEgpUrl={officialEgpUrl}
            match={match}
            isAuthenticated={isAuthenticated}
            isSaved={isSaved}
            toggleLoading={toggleLoading}
            onWatchlistClick={handleWatchlistClick}
            onPreviewPdf={() => setIsPdfModalOpen(true)}
            deadline={deadline}
          />
        </div>

        {/* MAIN COLUMN (TAB CONTENT) */}
        <div className="order-2 lg:order-1 flex min-w-0 flex-col gap-6">
          {/* Status Alert if Closed or Cancelled */}
          {iden.status === "Closed" || iden.status === "Cancelled" ? (
            <div className="rounded-[3px] border border-l-[4px] border-line border-l-closed bg-closed-bg px-4 py-3.5">
              <p className="text-[15px] font-semibold text-ink">
                โครงการนี้สิ้นสุดการรับข้อเสนอแล้ว
              </p>
              <p className="mt-1 text-[13px] text-ink-2">
                โครงการนี้พ้นกำหนดยื่นข้อเสนอหรือมีการประกาศผลเรียบร้อยแล้ว ไม่จำเป็นต้องอ่านต่อเพื่อเตรียมยื่นซอง
              </p>
            </div>
          ) : null}

          {/* ACTIVE TAB CONTENT */}
          <div id={`tab-panel-${activeTab}`} role="tabpanel">
            {activeTab === "overview" && <OverviewTab insight={insight} />}
            {activeTab === "specs" && (
              <TechnicalSpecsTab insight={insight} matchedSkills={matchedSkills} />
            )}
            {activeTab === "analysis" && (
              <DecisionSupportTab
                insight={insight}
                match={match}
                isAuthenticated={isAuthenticated}
                lockLevel={lockLevel}
                lockScore={lockScore}
                lockTone={lockTone}
              />
            )}
            {activeTab === "eligibility" && <EligibilityHistoryTab insight={insight} />}
          </div>

          <div className="flex items-center justify-between border-t border-line pt-4">
            <Link href="/search" onClick={handleBackToSearch} className={btn.ghost}>
              ← กลับไปหน้ารายการค้นหา
            </Link>
          </div>
        </div>
      </div>

      {/* Auth Modal for Watchlist */}
      {showAuthModal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="watchlist-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[2px] animate-in fade-in duration-150"
          onClick={() => setShowAuthModal(false)}
        >
          <div
            className="relative w-full max-w-md rounded-[4px] border border-line bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowAuthModal(false)}
              className="absolute right-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-[3px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
              aria-label="ปิดหน้าต่าง"
            >
              ✕
            </button>

            <div className="flex h-11 w-11 items-center justify-center rounded-[3px] border border-line bg-surface-2 text-ink">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
              </svg>
            </div>

            <h3 id="watchlist-modal-title" className="mt-4 text-[17px] font-semibold text-ink">
              ลงชื่อเข้าใช้เพื่อบันทึกรายการที่ติดตาม
            </h3>

            <p className="mt-2 text-[13px] leading-thai text-ink-2">
              เมื่อลงชื่อเข้าใช้ คุณจะสามารถติดตามประกาศนี้และรับการแจ้งเตือนทันทีเมื่อมีการออกเอกสารแก้ไข TOR (Amendment) หรือประกาศผู้ชนะ
            </p>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                className={btn.secondary}
              >
                ยกเลิก
              </button>
              <Link
                href={`/auth?next=${encodeURIComponent(`/tor/${projectId}`)}`}
                className={btn.primary}
              >
                ลงชื่อเข้าใช้
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* Original Document PDF Preview Modal */}
      <PdfPreviewModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        projectId={projectId}
        title={iden.titleTh}
        agency={iden.agency}
        procurementMethod={facts.procurementMethod}
        officialEgpUrl={officialEgpUrl}
        lang="th"
      />
    </article>
  );
}
