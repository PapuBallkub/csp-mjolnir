import type { NextConfig } from "next";

export function buildCspHeader(isProduction: boolean): string {
  // ASVS V3.2.4: Disallow unsafe-eval in production. Only allowed in dev for Fast Refresh / webpack eval-source-maps.
  const scriptSrc = isProduction
    ? "script-src 'self' 'unsafe-inline';"
    : "script-src 'self' 'unsafe-eval' 'unsafe-inline';";

  // ASVS V3.2.6: In production, automatically upgrade any HTTP requests to HTTPS.
  const upgradeInsecure = isProduction ? "upgrade-insecure-requests;" : "";

  return `
    default-src 'self';
    ${scriptSrc}
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https:;
    font-src 'self' data:;
    object-src 'self' blob:;
    frame-src 'self' blob:;
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    connect-src 'self' http://localhost:8000 https:;
    ${upgradeInsecure}
  `
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ASVS V3.4.7: Expanded hardware & feature restriction policy
export const permissionsPolicyHeader =
  "camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), midi=(), screen-wake-lock=()";

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    const cspHeader = buildCspHeader(isProd);

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspHeader,
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },
          {
            key: "Permissions-Policy",
            value: permissionsPolicyHeader,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
