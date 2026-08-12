import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Thai is the source language of every document on this platform, so the UI
// face is chosen for its Thai coverage first; its Latin companion carries the
// English tech terms that run inline through Thai sentences.
const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-plex-thai",
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "TORchlight — BMA procurement discovery",
  description:
    "Find, read and sanity-check Bangkok government IT procurement documents without opening the PDF.",
};

// Applies the stored theme before first paint so the page never flashes.
const themeScript = `
try {
  var t = localStorage.getItem("torchlight-theme");
  if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
} catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${plexThai.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
