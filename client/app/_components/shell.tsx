"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, LogOut, User, X } from "lucide-react";
import { displayName, useAuth } from "./auth";
import { ThemeToggle } from "./prefs";
import { fetchNotifications } from "../_lib/api";

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

// In-memory dismissal state for current page session (resets on full browser reload)
let calloutDismissedInSession = false;
let lastSeenUnreadCount = 0;

export function HeaderControls({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const { status, user, signOut } = useAuth();
  const signInHref = `/auth?next=${encodeURIComponent(pathname || "/")}`;

  const [unreadCount, setUnreadCount] = useState(0);
  const [showCallout, setShowCallout] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const autoCloseTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch unread count when user is authenticated
  useEffect(() => {
    if (status !== "authenticated" || !user?.id) {
      setUnreadCount(0);
      setShowCallout(false);
      return;
    }

    let active = true;
    fetchNotifications({ limit: 1 }).then((res) => {
      if (!active || !res.ok) return;
      const count = res.data.unreadCount;
      setUnreadCount(count);

      // If new unread notifications arrive while browsing, allow callout to show
      if (count > lastSeenUnreadCount && lastSeenUnreadCount > 0) {
        calloutDismissedInSession = false;
      }
      lastSeenUnreadCount = count;

      // Clean up legacy storage keys
      try {
        sessionStorage.removeItem("gipdp_bell_callout_dismissed");
        sessionStorage.removeItem(`gipdp_bell_callout_dismissed_${user.id}`);
      } catch {
        // Ignore
      }

      // Show callout if there are unread items and user hasn't closed it during this page session
      if (count > 0 && !calloutDismissedInSession) {
        setShowCallout(true);
      }
    });

    return () => {
      active = false;
    };
  }, [status, pathname, user?.id]);

  // Listen for realtime notification updates (e.g. entering /notifications/[id] or marking read)
  useEffect(() => {
    function handleNotificationsUpdated(e: Event) {
      const customEvent = e as CustomEvent<{ unreadCount?: number }>;
      if (typeof customEvent?.detail?.unreadCount === "number") {
        const count = customEvent.detail.unreadCount;
        setUnreadCount(count);
        if (count === 0) {
          setShowCallout(false);
        }
        return;
      }

      if (status === "authenticated" && user?.id) {
        fetchNotifications({ limit: 1 }).then((res) => {
          if (res.ok) {
            const count = res.data.unreadCount;
            setUnreadCount(count);
            if (count === 0) {
              setShowCallout(false);
            }
          }
        });
      }
    }

    window.addEventListener("notifications-updated", handleNotificationsUpdated);
    return () => {
      window.removeEventListener("notifications-updated", handleNotificationsUpdated);
    };
  }, [status, user?.id]);

  // Auto-close callout after 6 seconds (pauses on hover)
  useEffect(() => {
    if (!showCallout || isPaused) {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
      return;
    }

    autoCloseTimerRef.current = setTimeout(() => {
      handleDismissCallout();
    }, 6200);

    return () => {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    };
  }, [showCallout, isPaused, user?.id, unreadCount]);

  function handleDismissCallout() {
    calloutDismissedInSession = true;
    setShowCallout(false);
  }

  function handlePauseTimer() {
    setIsPaused(true);
  }

  function handleResumeTimer() {
    setIsPaused(false);
  }

  return (
    <div className={`flex shrink-0 items-center gap-2 ${className}`}>
      <ThemeToggle />
      <div className="relative">
        <Link
          href="/notifications"
          onClick={handleDismissCallout}
          aria-label={
            unreadCount > 0
              ? `การแจ้งเตือน (${unreadCount} รายการใหม่)`
              : "การแจ้งเตือน"
          }
          title="การแจ้งเตือน"
          className="relative flex h-[26px] w-[26px] items-center justify-center rounded-[3px] border border-line bg-surface-2 text-ink-2 transition-colors hover:text-ink"
        >
          <Bell className="h-3.5 w-3.5" />
          {unreadCount > 0 ? (
            <span
              className="absolute -top-1.5 -right-1.5 z-10 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-xs pointer-events-none"
              aria-hidden="true"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Link>

        {showCallout && unreadCount > 0 ? (
          <div
            role="status"
            aria-live="polite"
            onMouseEnter={handlePauseTimer}
            onMouseLeave={handleResumeTimer}
            className="absolute right-0 top-full z-50 mt-2 w-max max-w-[280px] rounded-md border border-line-2 bg-surface-2 p-2.5 pb-3.5 shadow-lg animate-in fade-in slide-in-from-top-1"
          >
            {/* The little upward arrow pointing to the bell */}
            <div
              className="absolute -top-1.5 right-2 h-2.5 w-2.5 rotate-45 border-l border-t border-line-2 bg-surface-2"
              aria-hidden="true"
            />

            <div className="relative flex items-center justify-between gap-3">
              <Link
                href="/notifications"
                onClick={handleDismissCallout}
                className="text-[12px] font-medium leading-tight text-ink hover:underline"
              >
                {`คุณมี ${unreadCount} การแจ้งเตือนที่ยังไม่ได้อ่าน`}
              </Link>
              <button
                type="button"
                onClick={handleDismissCallout}
                aria-label="ปิด"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            {/* Countdown bar at bottom: drains from right to left */}
            <div className="absolute bottom-0 left-0 right-0 h-[2.5px] overflow-hidden rounded-b-md bg-line">
              <div
                onAnimationEnd={handleDismissCallout}
                className="h-full w-full bg-red-600/85 animate-toast-progress origin-left"
                style={{ animationPlayState: isPaused ? "paused" : "running" }}
              />
            </div>
          </div>
        ) : null}
      </div>
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
            <User className="sm:hidden h-3.5 w-3.5 text-ink shrink-0" />
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
            <LogOut className="h-3.5 w-3.5" />
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
