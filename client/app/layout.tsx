import type { Metadata } from "next";
import { Noto_Sans_Thai, Inter, IBM_Plex_Mono } from "next/font/google";
import { PrefsProvider } from "./_components/prefs";
import "./globals.css";

// Noto Sans Thai provides optimal screen legibility with clear letter loops
// for dense text, while Inter pairs cleanly for Latin technical terms.
const notoSansThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai"],
  weight: ["300", "400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
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
      className={`${notoSansThai.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <PrefsProvider>{children}</PrefsProvider>
      </body>
    </html>
  );
}
