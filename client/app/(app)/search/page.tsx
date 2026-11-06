"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { torFacets } from "../../_lib/api";
import { type Mode } from "./_lib/types";
import { parseMode, saveLastSearchUrl, syncUrlToBrowser } from "./_lib/search-params";
import { formatUpdated } from "./_components/SearchCommon";
import { FilterModeView } from "./_components/FilterModeView";
import { MatchModeView } from "./_components/MatchModeView";

function BrowsePageContent() {
  const searchParams = useSearchParams();

  const [mode, setModeState] = useState<Mode>(() => parseMode(searchParams));
  const [strongCount, setStrongCount] = useState<number | undefined>(undefined);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  function setMode(nextMode: Mode) {
    setModeState(nextMode);
    if (nextMode === "match") {
      syncUrlToBrowser("?mode=match");
    } else {
      syncUrlToBrowser("");
    }
  }

  // Handle browser Back / Forward buttons (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const sp = new URLSearchParams(window.location.search);
      setModeState(parseMode(sp));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Save current search location in sessionStorage on mount
  useEffect(() => {
    saveLastSearchUrl();
    torFacets().then((result) => {
      if (result.ok) setLastUpdated(result.data.lastUpdated);
    });
  }, []);

  const MODES: { id: Mode; label: string; badge?: number }[] = [
    { id: "filter", label: "ค้นหาและกรอง" },
    {
      id: "match",
      label: "ตรงกับโปรไฟล์ฉัน",
      badge: strongCount,
    },
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6">
      {/* Page Header */}
      <header className="mb-6 border-b border-line pb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">
            ค้นหาประกาศจัดซื้อจัดจ้าง IT
          </h1>
          <p className="mt-1 text-[13px] leading-thai text-ink-2">
            ค้นหา กรอง และอ่านสรุปสาระสำคัญของเอกสาร TOR ด้านเทคโนโลยีจากหน่วยงานภาครัฐ
            {lastUpdated ? (
              <>
                {" · "}
                อัปเดตล่าสุด {formatUpdated(lastUpdated, "th")}
              </>
            ) : null}
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div
            className="inline-flex rounded-[3px] border border-line bg-surface-2 p-[3px]"
            role="group"
            aria-label="วิธีเลือกดูประกาศ"
          >
            {MODES.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setMode(option.id)}
                aria-pressed={mode === option.id}
                className={`flex items-center justify-center gap-2 rounded-[2px] px-3 py-1.5 text-[13px] font-medium transition-all duration-150 cursor-pointer ${
                  option.id === "filter" ? "min-w-[110px]" : "min-w-[165px]"
                } ${
                  mode === option.id
                    ? "bg-surface text-ink shadow-sm font-semibold"
                    : "text-ink-3 hover:text-ink"
                }`}
              >
                <span>{option.label}</span>
                {option.badge !== undefined ? (
                  <span
                    className={`rounded-[2px] px-1 font-mono tnum text-[11px] ${
                      mode === option.id ? "bg-open-bg text-open" : "bg-surface-3 text-ink-3"
                    }`}
                  >
                    {option.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <p className="text-[12px] leading-thai text-ink-3">
            {mode === "filter"
              ? "กรองเองตามเทคโนโลยี ราคากลาง กำหนดยื่น และหน่วยงาน"
              : "เรียงตามความเหมาะสมจากทักษะและช่วงงบที่คุณบันทึกไว้ในโปรไฟล์"}
          </p>
        </div>
      </header>

      {/* Main Mode View */}
      {mode === "filter" ? (
        <FilterModeView />
      ) : (
        <MatchModeView
          onStrongCountChange={setStrongCount}
          onSwitchToFilter={() => setMode("filter")}
        />
      )}
    </div>
  );
}

export default function BrowsePage() {
  return (
    <Suspense fallback={null}>
      <BrowsePageContent />
    </Suspense>
  );
}
