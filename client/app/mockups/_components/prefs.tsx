"use client";

import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { demoProfile, type Lang, type Profile } from "../_data/tors";

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
 * The profile lives above the routes so editing skills on /profile changes the
 * ranking on /catalog without a round trip — which is the whole point of
 * splitting the two, and the thing a static mockup would fail to show.
 */
const ProfileContext = createContext<{
  profile: Profile;
  setProfile: (profile: Profile) => void;
}>({ profile: demoProfile, setProfile: () => {} });

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("th");
  const [profile, setProfile] = useState<Profile>(demoProfile);

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <ProfileContext.Provider value={{ profile, setProfile }}>{children}</ProfileContext.Provider>
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
          className={`rounded-[2px] px-2 py-[3px] text-[13px] font-medium transition-colors ${
            lang === option.value ? "bg-ink text-surface" : "text-ink-3 hover:text-ink"
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
  document.documentElement.dataset.theme = next;
  localStorage.setItem("bma-tor-theme", next);
  for (const listener of themeListeners) listener();
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
