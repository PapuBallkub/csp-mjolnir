"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { displayName, useAuth } from "./auth";
import { ThemeToggle } from "./prefs";

/**
 * The hammer, drawn flat and geometric rather than mythic — this is an
 * instrument, not a fantasy brand. It reads at 18px, which is the only size
 * that matters in the masthead.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <svg viewBox="0 0 20 20" className="h-[18px] w-[18px] text-ink shrink-0" aria-hidden="true">
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
  { href: "/search", label: "ค้นหาประกาศ" },
  { href: "/watchlist", label: "รายการติดตาม" },
  { href: "/watchdog", label: "ตรวจสอบราคา/การแก้ไข" },
] as const;

export function HeaderControls({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const { status, user, signOut } = useAuth();
  const signInHref = `/auth?next=${encodeURIComponent(pathname || "/")}`;

  return (
    <div className={`flex shrink-0 items-center gap-2 ${className}`}>
      <ThemeToggle />
      <Link
        href="/notifications"
        aria-label="ตั้งค่าการแจ้งเตือน"
        title="การแจ้งเตือน"
        className="flex h-[26px] w-[26px] items-center justify-center rounded-[3px] border border-line bg-surface-2 text-ink-2 transition-colors hover:text-ink"
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
      </Link>
      {status === "loading" ? (
        // A fixed-size placeholder, not "Sign in": the answer is not
        // known yet, and guessing wrong flashes the wrong thing at
        // everyone on every page load. Same height and a fixed width, so
        // resolving it moves nothing.
        <span
          aria-hidden="true"
          className="h-[26px] w-[26px] sm:w-[92px] rounded-[3px] border border-line bg-surface-2"
        />
      ) : status === "authenticated" ? (
        <span className="flex items-center gap-1">
          <Link
            href="/profile"
            title={user.email}
            aria-label={`โปรไฟล์ของ ${displayName(user)}`}
            className={`flex h-[26px] items-center rounded-[3px] border px-2 text-[12px] transition-colors ${
              pathname?.startsWith("/profile")
                ? "border-line-2 bg-surface-3 text-ink"
                : "border-line bg-surface-2 text-ink-2 hover:text-ink"
            }`}
          >
            <span className="sm:hidden font-mono text-[11px] font-semibold text-ink" aria-hidden="true">
              👤
            </span>
            <span className="hidden sm:inline max-w-[130px] truncate">
              {displayName(user)}
            </span>
          </Link>
          <button
            type="button"
            onClick={() => signOut()}
            aria-label="ออกจากระบบ"
            title="ออกจากระบบ"
            className="flex h-[26px] w-[26px] items-center justify-center rounded-[3px] border border-line bg-surface-2 text-ink-3 transition-colors hover:text-ink cursor-pointer shrink-0"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
              <path
                d="M6 13.5H3.5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1H6M10 11l3-3-3-3M13 8H6.5"
                stroke="currentColor"
                strokeWidth="1.3"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </span>
      ) : (
        <Link
          href={signInHref}
          className="flex h-[26px] items-center rounded-[3px] border border-line-2 bg-surface px-2.5 text-[12px] font-medium text-ink transition-colors hover:bg-surface-2"
        >
          เข้าสู่ระบบ
        </Link>
      )}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status, user } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex min-h-[52px] max-w-[1240px] items-center gap-2.5 sm:gap-4 px-3 sm:px-4 py-2.5">
          <Link
            href="/"
            className="flex h-[26px] items-center text-ink transition-opacity hover:opacity-70 shrink-0"
            title="หน้าแรก"
            aria-label="หน้าแรก"
          >
            <svg
              viewBox="0 0 20 20"
              className="h-[19px] w-[19px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.65"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3.25 8.75 L10 3.25 L16.75 8.75 V16.5 A1 1 0 0 1 15.75 17.5 H4.25 A1 1 0 0 1 3.25 16.5 Z" />
              <path d="M7.5 17.5 V11.25 H12.5 V17.5" />
            </svg>
          </Link>

          <nav className="-mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1 [mask-image:linear-gradient(to_right,black_calc(100%-18px),transparent_100%)] sm:[mask-image:none]">
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

            {/* The divider goes with the link, or an orphan hairline is left
                floating in the nav. This takes the admin surface off the public
                page; it does not make /admin private, since that page reads
                fixtures that ship in the bundle. See 0011. */}
            {status === "authenticated" && user.role === "admin" ? (
              <>
                <span className="mx-1 h-4 w-px shrink-0 bg-line" />
                <Link
                  href="/admin"
                  className={`rounded-[3px] px-2.5 py-1.5 text-[13px] whitespace-nowrap transition-colors ${
                    pathname.startsWith("/admin")
                      ? "bg-surface-3 font-medium text-ink"
                      : "text-ink-3 hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  ผู้ดูแลระบบ
                </Link>
              </>
            ) : null}
          </nav>

          <HeaderControls />
        </div>
      </header>

      <main className="flex-1 bg-canvas">{children}</main>

      <footer className="mt-auto border-t border-line bg-surface">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 text-[11px] text-ink-3">
          <Wordmark className="opacity-60" />
          <span className="leading-thai">
            เครื่องมือค้นหาและวิเคราะห์ประกาศจัดซื้อจัดจ้างภาครัฐด้าน IT (ไม่ใช่ระบบยื่นข้อเสนอทางการของ e-GP)
          </span>
          <span className="ml-auto font-mono">01219346 · Kasetsart University</span>
        </div>
      </footer>
    </div>
  );
}
