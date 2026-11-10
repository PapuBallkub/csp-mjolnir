"use client";

import { useSyncExternalStore } from "react";

export type Breakpoint = "mobile" | "tablet" | "desktop";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }
  const mqlMobile = window.matchMedia("(max-width: 639px)");
  const mqlTablet = window.matchMedia("(min-width: 640px) and (max-width: 1023px)");
  const mqlDesktop = window.matchMedia("(min-width: 1024px)");

  mqlMobile.addEventListener("change", callback);
  mqlTablet.addEventListener("change", callback);
  mqlDesktop.addEventListener("change", callback);

  return () => {
    mqlMobile.removeEventListener("change", callback);
    mqlTablet.removeEventListener("change", callback);
    mqlDesktop.removeEventListener("change", callback);
  };
}

function getSnapshot(): Breakpoint {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "desktop";
  }
  if (window.matchMedia("(max-width: 639px)").matches) return "mobile";
  if (window.matchMedia("(max-width: 1023px)").matches) return "tablet";
  return "desktop";
}

function getServerSnapshot(): Breakpoint {
  return "desktop";
}

/**
 * Hook that listens to viewport breakpoint crossings using matchMedia and useSyncExternalStore.
 * Fires events ONLY when crossing 640px or 1024px, guaranteeing zero CPU overhead during resizing.
 */
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

