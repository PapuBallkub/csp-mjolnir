"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProfile, LangToggle, ThemeToggle } from "./prefs";

/**
 * The hammer, drawn flat and geometric rather than mythic — this is an
 * instrument, not a fantasy brand. It reads at 18px, which is the only size
 * that matters in the masthead.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 20 20" className="h-[18px] w-[18px] text-ink" aria-hidden="true">
        <path
          d="M2.5 2.5 H17.5 V8.6 H12.4 V11.4 H14 V17.5 H6 V11.4 H7.6 V8.6 H2.5 Z"
          fill="currentColor"
        />
      </svg>
      <span className="text-[15px] leading-none font-semibold tracking-tight text-ink">
        Mjölnir
      </span>
    </span>
  );
}

const NAV = [
  { href: "/catalog", label: "Browse" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/watchdog", label: "Watchdog" },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile } = useProfile();

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] items-center gap-4 px-4 py-2.5">
          <Link href="/catalog" className="shrink-0">
            <Wordmark />
          </Link>

          <nav className="-mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-[3px] px-2.5 py-1.5 text-[13px] whitespace-nowrap transition-colors ${
                    active
                      ? "bg-surface-3 font-medium text-ink"
                      : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <span className="mx-1 h-4 w-px shrink-0 bg-line" />
            <Link
              href="/admin"
              className={`rounded-[3px] px-2.5 py-1.5 font-mono text-[11px] whitespace-nowrap uppercase tracking-[0.1em] transition-colors ${
                pathname.startsWith("/admin")
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
              href="/notifications"
              aria-label="Notification preferences"
              className="relative flex h-[26px] w-[26px] items-center justify-center rounded-[3px] border border-line bg-surface-2 text-ink-2 transition-colors hover:text-ink"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
                <path
                  d="M4 6.5a4 4 0 1 1 8 0c0 3 1 4 1 4H3s1-1 1-4Z"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  fill="none"
                />
                <path d="M6.5 13a1.6 1.6 0 0 0 3 0" stroke="currentColor" strokeWidth="1.3" />
              </svg>
              <span className="absolute -right-[3px] -top-[3px] h-2 w-2 rounded-full border border-surface bg-amend" />
            </Link>
            <Link
              href="/profile"
              className={`flex h-[26px] items-center rounded-[3px] border px-2 text-[12px] transition-colors ${
                pathname.startsWith("/profile")
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
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 text-[11px] text-ink-3">
          <Wordmark className="opacity-60" />
          <span className="leading-thai">
            เครื่องมือค้นหาโครงการ ไม่ใช่ระบบยื่นข้อเสนอ · A discovery tool, not a bidding
            assistant.
          </span>
          <span className="ml-auto font-mono">01219346 · Kasetsart University</span>
        </div>
      </footer>
    </div>
  );
}
