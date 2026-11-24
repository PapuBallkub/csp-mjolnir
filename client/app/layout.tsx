import type { Metadata } from "next";
import localFont from "next/font/local";
import { AuthProvider } from "./_components/auth";
import { PrefsProvider } from "./_components/prefs";
import "./globals.css";

// Unified IBM Plex typography family:
// IBM Plex Sans Thai (designed by Cadson Demak) pairs with IBM Plex Sans (Latin)
// and IBM Plex Mono (tabular metrics and project IDs) for cohesive proportions.
const ibmPlexSansThai = localFont({
  src: [
    { path: "./fonts/IBMPlexSansThai-Light.woff2", weight: "300", style: "normal" },
    { path: "./fonts/IBMPlexSansThai-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexSansThai-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexSansThai-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/IBMPlexSansThai-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-plex-thai",
  display: "swap",
});

const ibmPlexSans = localFont({
  src: [
    { path: "./fonts/IBMPlexSans-Light.woff2", weight: "300", style: "normal" },
    { path: "./fonts/IBMPlexSans-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexSans-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexSans-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/IBMPlexSans-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = localFont({
  src: [
    { path: "./fonts/IBMPlexMono-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/IBMPlexMono-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/IBMPlexMono-SemiBold.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GIPDP — แพลตฟอร์มค้นหาและวิเคราะห์ประกาศจัดซื้อจัดจ้าง IT ภาครัฐ",
  description:
    "ค้นหา อ่าน และตรวจสอบความเสี่ยงประกาศจัดซื้อจัดจ้างโครงการเทคโนโลยีภาครัฐไทย โดยไม่ต้องเปิดเอกสาร PDF",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
  },
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
      style={{ scrollbarGutter: "stable" }}
      suppressHydrationWarning
    >
      <head>
        <script
          id="mjolnir-theme"
          dangerouslySetInnerHTML={{
            __html: themeScript,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col">
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
