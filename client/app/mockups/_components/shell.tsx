"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProfile, LangToggle, ThemeToggle } from "./prefs";

/**
 * The signed-in chrome.
 *
 * There is deliberately no wordmark or logo here. The product has no agreed
 * name yet, and a placeholder brand in the masthead only invites review
 * comments about the brand instead of about the screens. Navigation carries
 * the top-left position instead, which is where a returning user's eye goes
 * anyway.
 */

const NAV = [
  { href: "/mockups/catalog", label: { th: "ค้นหาประกาศ", en: "Browse" } },
  { href: "/mockups/watchlist", label: { th: "ที่ติดตาม", en: "Watchlist" } },
  { href: "/mockups/watchdog", label: { th: "ตรวจสอบ", en: "Watchdog" } },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile } = useProfile();

  return (
    <div className="flex min-h-full flex-col">
      {/* Mockups must never be mistaken for the shipped product (AGENTS §2). */}
      <div className="border-b border-line bg-surface-3">
        <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-4 py-2">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-ink-2">
            Mockup
          </span>
          <span className="hidden text-[13px] text-ink-3 sm:inline">
            Fixture data, no backend. Phase 1 UI exploration.
          </span>
          <Link
            href="/mockups"
            className="ml-auto text-[13px] text-ink-2 underline underline-offset-2 hover:text-ink"
          >
            All screens
          </Link>
        </div>
      </div>

      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] items-center gap-4 px-4 py-2.5">
          <nav className="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-[3px] px-3 py-2 text-[14px] whitespace-nowrap transition-colors ${
                    active
                      ? "bg-surface-3 font-semibold text-ink"
                      : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  {item.label.en}
                </Link>
              );
            })}
            <span className="mx-1 h-4 w-px shrink-0 bg-line-2" />
            <Link
              href="/mockups/admin"
              className={`rounded-[3px] px-3 py-2 font-mono text-[12px] whitespace-nowrap uppercase tracking-[0.1em] transition-colors ${
                pathname.startsWith("/mockups/admin")
                  ? "bg-surface-3 text-ink"
                  : "text-ink-3 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              Admin
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <LangToggle />
            <ThemeToggle />
            <Link
              href="/mockups/notifications"
              aria-label="Notification preferences"
              className="relative flex h-[30px] w-[30px] items-center justify-center rounded-[3px] border border-line bg-surface-2 text-ink-2 transition-colors hover:text-ink"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M4 6.5a4 4 0 1 1 8 0c0 3 1 4 1 4H3s1-1 1-4Z"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  fill="none"
                />
                <path d="M6.5 13a1.6 1.6 0 0 0 3 0" stroke="currentColor" strokeWidth="1.3" />
              </svg>
              <span className="absolute -right-[3px] -top-[3px] h-2.5 w-2.5 rounded-full border border-surface bg-amend" />
            </Link>
            <Link
              href="/mockups/profile"
              className={`flex h-[30px] items-center rounded-[3px] border px-2.5 text-[14px] transition-colors ${
                pathname.startsWith("/mockups/profile")
                  ? "border-line-2 bg-surface-3 text-ink"
                  : "border-line bg-surface-2 text-ink-2 hover:text-ink"
              }`}
            >
              {profile.name}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-5 text-[13px] text-ink-2">
          <span className="leading-thai">
            เครื่องมือค้นหาโครงการ ไม่ใช่ระบบยื่นข้อเสนอ · A discovery tool, not a bidding
            assistant.
          </span>
          <span className="ml-auto font-mono text-ink-3">01219346 · Kasetsart University</span>
        </div>
      </footer>
    </div>
  );
}
