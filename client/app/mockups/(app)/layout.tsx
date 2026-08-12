import type { ReactNode } from "react";
import { Shell } from "../_components/shell";

/** The signed-in product chrome. `/mockups` and `/mockups/auth` sit outside it. */
export default function AppShellLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
