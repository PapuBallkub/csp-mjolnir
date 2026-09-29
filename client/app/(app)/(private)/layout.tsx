"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "../../_components/auth";
import { SignInPrompt } from "../../_components/sign-in-prompt";
import { useLang } from "../../_components/prefs";

/**
 * The three routes the SRS reserves for signed-in users: profile and
 * preferences, saved opportunities, and notifications. Everything else —
 * landing, search, TOR detail, the watchdog dashboard — stays open to guests.
 *
 * A route group rather than a check inside each page, so the rule is visible
 * in the file tree. The fourth private page someone adds lands here and is
 * covered without anyone remembering to do anything. The URLs are unchanged:
 * a (group) never appears in the path.
 *
 * This is UX, not security. The real boundary is requireAuth on the API. It
 * has to be client-side: the session cookie is httpOnly and, in production,
 * host-only on a different origin, so Next middleware cannot read it — and in
 * development it *can*, which is worse, because a middleware guard would pass
 * locally and fail silently in production. See 0012.
 */
export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const pathname = usePathname();
  const { lang } = useLang();

  // Children never mount until we know, so there is no flash of a page the
  // guest is about to lose.
  if (status === "loading") {
    return <div className="mx-auto min-h-[60vh] max-w-[1240px] px-4 py-10" aria-busy="true" />;
  }

  if (status === "anonymous") {
    const copy = PROMPTS[promptKeyFor(pathname)][lang];
    return (
      <div className="mx-auto max-w-[1240px] px-4 py-10">
        <SignInPrompt
          headline={copy.headline}
          body={copy.body}
          cta={copy.cta}
          next={pathname}
        />
      </div>
    );
  }

  return <>{children}</>;
}

type PromptKey = "profile" | "watchlist" | "notifications";

function promptKeyFor(pathname: string): PromptKey {
  if (pathname.startsWith("/watchlist")) return "watchlist";
  if (pathname.startsWith("/notifications")) return "notifications";
  return "profile";
}

/**
 * Per-route copy, because the honest answer differs. "Sign in to continue"
 * tells someone nothing about why they would want to.
 */
const PROMPTS: Record<PromptKey, Record<"th" | "en", { headline: string; body: string; cta: string }>> = {
  watchlist: {
    th: {
      headline: "โครงการที่บันทึกไว้อยู่ในบัญชีของคุณ",
      body: "สมัครแล้วเราจะเฝ้าดูไฟล์ต้นทางของทุกโครงการที่คุณบันทึก และแจ้งคุณในวันที่เอกสารถูกแก้ไข",
      cta: "สมัครหรือเข้าสู่ระบบ",
    },
    en: {
      headline: "Saved projects live in your account",
      body: "Sign in and we will watch the source file of everything you save, then tell you the day it changes.",
      cta: "Sign in or create an account",
    },
  },
  profile: {
    th: {
      headline: "โปรไฟล์คือสิ่งที่ระบบจับคู่ใช้อ่าน",
      body: "บอกเราว่าคุณทำอะไรได้ แล้วรายการประกาศจะจัดลำดับใหม่ให้ตรงกับคุณ",
      cta: "สมัครหรือเข้าสู่ระบบ",
    },
    en: {
      headline: "Your profile is what the matcher reads",
      body: "Sign in to tell us what you build, and the browse list re-ranks itself around it.",
      cta: "Sign in or create an account",
    },
  },
  notifications: {
    th: {
      headline: "การแจ้งเตือนต้องมีปลายทางที่จะส่งไป",
      body: "สมัครเพื่อเลือกว่าจะให้เราส่งอีเมลเรื่องอะไร และบ่อยแค่ไหน",
      cta: "สมัครหรือเข้าสู่ระบบ",
    },
    en: {
      headline: "Alerts need somewhere to send them",
      body: "Sign in to choose what we email you, and when.",
      cta: "Sign in or create an account",
    },
  },
};
