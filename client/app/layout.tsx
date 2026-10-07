import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { AuthProvider } from "./_components/auth";
import { PrefsProvider } from "./_components/prefs";
import "./globals.css";

// Unified IBM Plex typography family:
// IBM Plex Sans Thai (designed by Cadson Demak) pairs with IBM Plex Sans (Latin)
// and IBM Plex Mono (tabular metrics and project IDs) for cohesive proportions.
const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  variable: "--font-plex-thai",
  subsets: ["thai"],
  weight: ["300", "400", "500", "600", "700"],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Mjölnir — BMA procurement discovery",
  description:
    "Find, read and sanity-check Bangkok government IT procurement documents without opening the PDF.",
};

// Applies the stored theme before first paint so the page never flashes.
const themeScript = `
try {
  var t = localStorage.getItem("mjolnir-theme");
  if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
} catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${ibmPlexSansThai.variable} ${ibmPlexSans.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        {/*
          AuthProvider wraps PrefsProvider, not the other way round: the
          profile has to react to signing in and out, and a child can read a
          parent's context but not the reverse.
        */}
        <AuthProvider>
          <PrefsProvider>{children}</PrefsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
