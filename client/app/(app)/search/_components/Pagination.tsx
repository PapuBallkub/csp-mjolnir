"use client";

import { useMemo } from "react";

export interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  pageSizeOptions?: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  disabled?: boolean;
}

export function Pagination({
  page,
  pages,
  total,
  pageSize,
  pageSizeOptions = [5, 10, 20],
  onPageChange,
  onPageSizeChange,
  disabled = false,
}: PaginationProps) {
  const safePages = Math.max(1, pages);
  const currentPage = Math.min(Math.max(1, page), safePages);

  const startItem = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, total);

  // Generate numbered window with ellipses
  const pageNumbers = useMemo<(number | "...")[]>(() => {
    if (safePages <= 7) {
      return Array.from({ length: safePages }, (_, i) => i + 1);
    }

    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, "...", safePages];
    }

    if (currentPage >= safePages - 3) {
      return [1, "...", safePages - 4, safePages - 3, safePages - 2, safePages - 1, safePages];
    }

    return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", safePages];
  }, [currentPage, safePages]);

  if (total === 0) return null;

  return (
    <nav
      role="navigation"
      aria-label="การแบ่งหน้า"
      className="mt-6 flex flex-col gap-3 rounded-[4px] border border-line bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      {/* Items Range Summary & Page Size Controls */}
      <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-ink-2">
        <span className="tabular-nums">
          แสดง <strong className="font-semibold text-ink">{startItem.toLocaleString()}</strong>–
          <strong className="font-semibold text-ink">{endItem.toLocaleString()}</strong> จากทั้งหมด{" "}
          <strong className="font-semibold text-ink">{total.toLocaleString()}</strong> ประกาศ
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 border-l border-line pl-3">
            <span className="text-ink-3 text-[12px]">แสดงหน้าละ:</span>
            <div className="inline-flex rounded-[3px] border border-line bg-surface-2 p-[2px]">
              {pageSizeOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onPageSizeChange(opt)}
                  disabled={disabled}
                  className={`flex h-5 items-center justify-center rounded-[2px] px-2 text-[11px] font-medium transition-colors cursor-pointer ${
                    pageSize === opt
                      ? "bg-surface text-ink font-semibold shadow-xs"
                      : "text-ink-3 hover:text-ink"
                  }`}
                  aria-pressed={pageSize === opt}
                  aria-label={`แสดง ${opt} รายการต่อหน้า`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Numbered Pager Controls */}
      {safePages > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          {/* Previous Page */}
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={disabled || currentPage <= 1}
            className={`flex h-7 items-center justify-center rounded-[3px] border px-2.5 text-[12px] font-medium transition-colors cursor-pointer ${
              currentPage <= 1 || disabled
                ? "border-line/60 text-ink-4 cursor-not-allowed opacity-40"
                : "border-line bg-surface-2 text-ink hover:bg-surface-3"
            }`}
            aria-label="ไปยังหน้าก่อนหน้า"
          >
            ‹ ก่อนหน้า
          </button>

          {/* Page Numbers */}
          <div className="hidden sm:flex items-center gap-1">
            {pageNumbers.map((item, index) => {
              if (item === "...") {
                return (
                  <span
                    key={`ellipsis-${index}`}
                    className="flex h-7 w-6 items-center justify-center text-ink-3"
                  >
                    …
                  </span>
                );
              }

              const isCurrent = item === currentPage;
              return (
                <button
                  key={`page-${item}`}
                  type="button"
                  onClick={() => onPageChange(item)}
                  disabled={disabled || isCurrent}
                  className={`flex h-7 min-w-[28px] items-center justify-center rounded-[3px] px-1 text-[12px] font-medium transition-colors cursor-pointer ${
                    isCurrent
                      ? "border border-line bg-ink text-surface font-semibold shadow-xs"
                      : disabled
                        ? "text-ink-4 cursor-not-allowed"
                        : "border border-line bg-surface-2 text-ink hover:bg-surface-3"
                  }`}
                  aria-current={isCurrent ? "page" : undefined}
                  aria-label={`หน้า ${item}`}
                >
                  {item}
                </button>
              );
            })}
          </div>

          {/* Compact page indicator on mobile */}
          <span className="sm:hidden text-[12px] text-ink-2 px-1 tabular-nums">
            {currentPage} / {safePages}
          </span>

          {/* Next Page */}
          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={disabled || currentPage >= safePages}
            className={`flex h-7 items-center justify-center rounded-[3px] border px-2.5 text-[12px] font-medium transition-colors cursor-pointer ${
              currentPage >= safePages || disabled
                ? "border-line/60 text-ink-4 cursor-not-allowed opacity-40"
                : "border-line bg-surface-2 text-ink hover:bg-surface-3"
            }`}
            aria-label="ไปยังหน้าถัดไป"
          >
            ถัดไป ›
          </button>
        </div>
      )}
    </nav>
  );
}
