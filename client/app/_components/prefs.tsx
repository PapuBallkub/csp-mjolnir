"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { demoProfile, type Lang, type Profile, type ScopeSize } from "../_data/tors";
import type { ApiError, UserProfile } from "../_lib/api";
import { useAuth } from "./auth";

/**
 * Content language. Source documents are Thai and most users read Thai, so
 * that is the default; the toggle switches everything that *describes a
 * document* — titles, agencies, summaries, verdict wording — while the
 * navigation chrome stays in English, which is how bilingual teams here
 * actually work.
 */
const LangContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void }>({
  lang: "th",
  setLang: () => {},
});

/**
 * FR-12. When signed in, the profile is whatever the server last returned.
 * When signed out, a guest-local profile lets someone try the matcher on
 * /search without an account.
 */
type ProfileValue = {
  profile: Profile;
  setProfile: (profile: Profile) => void;
  /** True when a save is in flight. */
  saving: boolean;
  /** Calls the API. Returns the error, or null on success. */
  saveProfile: (fields: Partial<UserProfile>) => Promise<ApiError | null>;
};

const ProfileContext = createContext<ProfileValue>({
  profile: demoProfile,
  setProfile: () => {},
  saving: false,
  saveProfile: async () => null,
});

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("th");
  const { status, user, updateProfile: authUpdateProfile } = useAuth();

  const [guestProfile, setGuestProfile] = useState<Profile>(demoProfile);
  const [saving, setSaving] = useState(false);

  const profile: Profile =
    status === "authenticated" && user
      ? {
          name: user.name,
          role: { th: "ผู้ใช้ระบบ", en: "Platform User" },
          email: user.email,
          skills: user.profile?.skills ?? [],
          budgetMin: user.profile?.budgetMin ?? 0,
          budgetMax: user.profile?.budgetMax ?? 0,
          scopeSizes: (user.profile?.scopeSizes ?? []) as ScopeSize[],
          smeRegistered: false,
          watchlist: guestProfile.watchlist,
        }
      : guestProfile;

  const setProfile = useCallback((p: Profile) => {
    setGuestProfile(p);
  }, []);

  const saveProfile = useCallback(
    async (fields: Partial<UserProfile>) => {
      if (status !== "authenticated") return null;
      setSaving(true);
      const error = await authUpdateProfile(fields);
      setSaving(false);
      return error;
    },
    [status, authUpdateProfile],
  );

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <ProfileContext.Provider value={{ profile, setProfile, saving, saveProfile }}>
        {children}
      </ProfileContext.Provider>
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}

export function useProfile() {
  return useContext(ProfileContext);
}

export function LangToggle() {
  const { lang, setLang } = useLang();
  const options: { value: Lang; label: string }[] = [
    { value: "th", label: "ไทย" },
    { value: "en", label: "EN" },
  ];

  return (
    <div
      className="flex items-center rounded-[3px] border border-line bg-surface-2 p-[2px]"
      role="group"
      aria-label="Content language"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setLang(option.value)}
          aria-pressed={lang === option.value}
          className={`flex h-5 w-9 items-center justify-center rounded-[2px] text-[11px] font-medium transition-all duration-150 ${
            lang === option.value ? "bg-ink text-surface shadow-xs" : "text-ink-3 hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type Theme = "light" | "dark";

/**
 * The theme lives on the document element and in localStorage, both of which
 * are outside React — so it is read as an external store rather than mirrored
 * into state, which also keeps every toggle on the page in agreement.
 */
const themeListeners = new Set<() => void>();

function subscribeToTheme(callback: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  themeListeners.add(callback);
  media.addEventListener("change", callback);
  return () => {
    themeListeners.delete(callback);
    media.removeEventListener("change", callback);
  };
}

function readTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "dark" || chosen === "light") return chosen;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(next: Theme) {
  const update = () => {
    document.documentElement.dataset.theme = next;
    localStorage.setItem("mjolnir-theme", next);
    for (const listener of themeListeners) listener();
  };

  if (typeof document === "undefined") {
    update();
    return;
  }

  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => void;
  };

  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(update);
  } else {
    document.documentElement.classList.add("theme-transitioning");
    update();
    window.setTimeout(() => {
      document.documentElement.classList.remove("theme-transitioning");
    }, 260);
  }
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToTheme, readTheme, () => "light" as Theme);
  const apply = applyTheme;

  return (
    <button
      type="button"
      onClick={() => apply(theme === "dark" ? "light" : "dark")}
      className="flex h-[26px] w-[26px] items-center justify-center rounded-[3px] border border-line bg-surface-2 text-ink-2 transition-colors hover:text-ink"
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5Z" fill="currentColor" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <circle cx="8" cy="8" r="3" fill="currentColor" />
          <path
            d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1M12.9 12.9l-1.1-1.1M4.2 4.2 3.1 3.1"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
