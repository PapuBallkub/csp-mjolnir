import type { ReactNode } from "react";
import { PrefsProvider } from "./_components/prefs";

/**
 * Everything under /mockups is Phase-1 design exploration against fixture data.
 * It is kept in its own route tree so exploratory work is never mistaken for
 * production code, and so an approved screen can graduate by moving out.
 */
export default function MockupsLayout({ children }: { children: ReactNode }) {
  return <PrefsProvider>{children}</PrefsProvider>;
}
