import type { ReactNode } from "react";
import { Shell } from "../_components/shell";

/** The signed-in product chrome. `/auth` sits outside it (no shell on login). */
export default function AppShellLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
