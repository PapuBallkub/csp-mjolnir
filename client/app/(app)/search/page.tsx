"use client";

import { Suspense, useEffect, useState } from "react";
import { torFacets } from "../../_lib/api";
import { saveLastSearchUrl } from "./_lib/search-params";
import { formatUpdated } from "./_components/SearchCommon";
import { FilterModeView } from "./_components/FilterModeView";

function BrowsePageContent() {
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Save current search location in sessionStorage on mount
  useEffect(() => {
    saveLastSearchUrl();
    torFacets().then((result) => {
      if (result.ok) setLastUpdated(result.data.lastUpdated);
    });
  }, []);

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6">
      {/* Page Header */}
      <header className="mb-6 border-b border-line pb-4">
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
      </header>

      {/* Main Filter & Match Catalog View */}
      <FilterModeView />
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
