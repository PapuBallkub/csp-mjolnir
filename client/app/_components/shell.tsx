"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, LogOut, Menu, User, X } from "lucide-react";
import { displayName, useAuth } from "./auth";
import { ThemeToggle } from "./prefs";
import { fetchNotifications } from "../_lib/api";

/**
 * GIPDP wordmark: clean typographic mark so every surface
 * (landing, catalog, auth, footer) shares one consistent identity.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center ${className}`}>
      <span className="text-[15px] leading-none font-bold tracking-tight text-ink">
        GIPDP
      </span>
    </span>
  );
}

const NAV = [
  { href: "/search", label: "ค้นหาประกาศ" },
  { href: "/watchlist", label: "รายการติดตาม" },
  { href: "/watchdog", label: "ภาพรวมราคาและความเสี่ยง" },
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

  const isAuthenticated = status === "authenticated" && Boolean(user?.id);
  const activeUnreadCount = isAuthenticated ? unreadCount : 0;
  const activeShowCallout = isAuthenticated ? showCallout : false;

  // Fetch unread count when user is authenticated
  useEffect(() => {
    if (status !== "authenticated" || !user?.id) {
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
    if (!activeShowCallout || isPaused) {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
      return;
    }

    autoCloseTimerRef.current = setTimeout(() => {
      handleDismissCallout();
    }, 6200);

    return () => {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
    };
  }, [activeShowCallout, isPaused, user?.id, activeUnreadCount]);

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

  const isNotificationInbox = pathname === "/notifications";
  const badgeColor = isNotificationInbox ? "bg-pink-500" : "bg-red-600";
  const toastProgressColor = isNotificationInbox ? "bg-pink-500/85" : "bg-red-600/85";

  return (
    <div className={`flex shrink-0 items-center gap-2 ${className}`}>
      <ThemeToggle />
      <div className="relative">
        <Link
          href="/notifications"
          onClick={handleDismissCallout}
          aria-label={
            activeUnreadCount > 0
              ? `การแจ้งเตือน (${activeUnreadCount} รายการใหม่)`
              : "การแจ้งเตือน"
          }
          title="การแจ้งเตือน"
          className="relative flex h-9 w-9 sm:h-[26px] sm:w-[26px] items-center justify-center rounded-[3px] border border-line bg-surface-2 text-ink-2 transition-colors hover:text-ink"
        >
          <Bell className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          {activeUnreadCount > 0 ? (
            <span
              className={`absolute -top-1.5 -right-1.5 z-10 flex h-4 min-w-[16px] items-center justify-center rounded-full ${badgeColor} px-1 text-[10px] font-bold text-white shadow-xs pointer-events-none transition-colors duration-150`}
              aria-hidden="true"
            >
              {activeUnreadCount > 99 ? "99+" : activeUnreadCount}
            </span>
          ) : null}
        </Link>

        {activeShowCallout && activeUnreadCount > 0 ? (
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
                {`คุณมี ${activeUnreadCount} การแจ้งเตือนที่ยังไม่ได้อ่าน`}
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
                className={`h-full w-full ${toastProgressColor} animate-toast-progress origin-left`}
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
          className="h-9 w-9 sm:h-[26px] sm:w-[92px] rounded-[3px] border border-line bg-surface-2"
        />
      ) : status === "authenticated" ? (
        <span className="flex items-center gap-1.5 sm:gap-1">
          <Link
            href="/profile"
            title={user.email}
            aria-label={`โปรไฟล์ของ ${displayName(user)}`}
            className={`flex h-9 w-9 sm:h-[26px] sm:w-auto items-center justify-center rounded-[3px] border sm:px-2 text-[12px] transition-colors ${
              pathname?.startsWith("/profile")
                ? "border-line-2 bg-surface-3 text-ink"
                : "border-line bg-surface-2 text-ink-2 hover:text-ink"
            }`}
          >
            <User className="sm:hidden h-4 w-4 text-ink shrink-0" />
            <span className="hidden sm:inline max-w-[130px] truncate">
              {displayName(user)}
            </span>
          </Link>
          <button
            type="button"
            onClick={() => signOut()}
            aria-label="ออกจากระบบ"
            title="ออกจากระบบ"
            className="flex h-9 w-9 sm:h-[26px] sm:w-[26px] items-center justify-center rounded-[3px] border border-line bg-surface-2 text-ink-2 transition-colors hover:text-ink cursor-pointer shrink-0"
          >
            <LogOut className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </button>
        </span>
      ) : (
        <Link
          href={signInHref}
          className="flex h-9 sm:h-[26px] items-center rounded-[3px] border border-line-2 bg-surface px-3 sm:px-2.5 text-[12.5px] sm:text-[12px] font-medium text-ink transition-colors hover:bg-surface-2"
        >
          เข้าสู่ระบบ
        </Link>
      )}
    </div>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const { status, user } = useAuth();
  const [menuOpenPath, setMenuOpenPath] = useState<string | null>(null);
  const mobileMenuOpen = menuOpenPath === pathname;
  const isAdmin = status === "authenticated" && user.role === "admin";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex min-h-[52px] max-w-[1240px] items-center gap-2 sm:gap-4 px-3 sm:px-4 py-2">
        {/* Mobile Hamburger Toggle (< md) */}
        <button
          type="button"
          onClick={() => setMenuOpenPath(mobileMenuOpen ? null : pathname)}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-site-nav"
          aria-label={mobileMenuOpen ? "ปิดเมนูนำทาง" : "เปิดเมนูนำทาง"}
          className="md:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-[3px] border border-line bg-surface-2 text-ink-2 transition-colors hover:text-ink cursor-pointer"
        >
          {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>

        <Link
          href="/"
          onClick={() => setMenuOpenPath(null)}
          className="flex h-9 sm:h-[26px] items-center text-ink transition-opacity hover:opacity-75 shrink-0"
          title="หน้าแรก GIPDP"
          aria-label="หน้าแรก GIPDP"
        >
          <Wordmark />
        </Link>

        {/* Desktop Navigation (md+) */}
        <nav
          aria-label="เมนูหลัก"
          className="hidden md:flex min-w-0 flex-1 items-center gap-0.5"
        >
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-[3px] px-2.5 py-1.5 text-[13px] whitespace-nowrap transition-colors ${
                  active
                    ? "bg-surface-3 font-medium text-ink"
                    : "text-ink/80 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}

          {isAdmin ? (
            <>
              <span className="mx-1 h-4 w-px shrink-0 bg-line" />
              <Link
                href="/admin"
                className={`rounded-[3px] px-2.5 py-1.5 text-[13px] whitespace-nowrap transition-colors ${
                  pathname.startsWith("/admin")
                    ? "bg-surface-3 font-medium text-ink"
                    : "text-ink/75 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                ผู้ดูแลระบบ
              </Link>
            </>
          ) : null}
        </nav>

        <div className="ml-auto md:ml-0">
          <HeaderControls />
        </div>
      </div>

      {/* Mobile Navigation Drawer (< md) */}
      {mobileMenuOpen ? (
        <nav
          id="mobile-site-nav"
          aria-label="เมนูหลักบนมือถือ"
          className="md:hidden border-t border-line bg-surface px-3 py-2.5 shadow-md"
        >
          <div className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpenPath(null)}
                  className={`flex items-center rounded-[3px] px-3 py-2.5 text-[14px] transition-colors ${
                    active
                      ? "bg-surface-3 font-semibold text-ink"
                      : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            {isAdmin ? (
              <>
                <div className="my-1 border-t border-line" />
                <Link
                  href="/admin"
                  onClick={() => setMenuOpenPath(null)}
                  className={`flex items-center rounded-[3px] px-3 py-2.5 text-[14px] transition-colors ${
                    pathname.startsWith("/admin")
                      ? "bg-surface-3 font-semibold text-ink"
                      : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  ผู้ดูแลระบบ
                </Link>
              </>
            ) : null}
          </div>
        </nav>
      ) : null}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 text-[11px] text-ink-3">
        <Wordmark className="opacity-70" />
        <span className="leading-thai">
          แพลตฟอร์มค้นหาและวิเคราะห์ประกาศจัดซื้อจัดจ้างภาครัฐด้าน IT (เครื่องมืออิสระบุคคลที่สาม — การยื่นข้อเสนอและการประมูลทางการทั้งหมดทำผ่านระบบ e-GP ของกรมบัญชีกลาง)
        </span>
        <span className="ml-auto font-mono">01219346 · Kasetsart University</span>
      </div>
    </footer>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <SiteHeader />
      <main className="flex flex-1 flex-col bg-canvas">{children}</main>
      <SiteFooter />
    </div>
  );
}
