import type { Metadata } from "next";
import { Kanit } from "next/font/google";
import localFont from "next/font/local";
import { AuthProvider } from "./_components/auth";
import { PrefsProvider } from "./_components/prefs";
import "./globals.css";

// Kanit (Cadson Demak) covers Thai and Latin in one family, so mixed strings
// like "ติดตั้ง NGINX Plus บน Windows Server 2019" share one set of metrics.
// It is not a variable font: each weight is its own file, so load only the
// weights the UI uses (font-normal / medium / semibold / bold). next/font
// self-hosts the files at build time; visitors never call Google.
const kanit = Kanit({
  weight: ["400", "500", "600", "700"],
  subsets: ["thai", "latin"],
  variable: "--font-kanit",
  display: "swap",
});

// IBM Plex Mono stays for tabular metrics and project IDs.
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
  title: "GIPDP (Mjölnir) — แพลตฟอร์มค้นหาและวิเคราะห์ประกาศจัดซื้อจัดจ้าง IT ภาครัฐ",
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
      className={`${kanit.variable} ${plexMono.variable} h-full antialiased`}
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
