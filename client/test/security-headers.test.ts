import assert from "node:assert/strict";
import { test } from "node:test";

import nextConfig, { buildCspHeader } from "../next.config.ts";

test("client next.config exports required security headers for all routes", async () => {
  assert.ok(nextConfig.headers, "nextConfig.headers must be defined");
  const headersConfig = await nextConfig.headers();
  assert.ok(Array.isArray(headersConfig), "headersConfig must be an array");

  const globalRule = headersConfig.find((r) => r.source === "/(.*)");
  assert.ok(globalRule, "must have a header rule matching /(.*)");

  const headerMap = new Map<string, string>();
  for (const h of globalRule.headers) {
    headerMap.set(h.key.toLowerCase(), h.value);
  }

  // Strict-Transport-Security (V3.7.1, V3.7.2, V3.7.3)
  const hsts = headerMap.get("strict-transport-security");
  assert.ok(hsts, "Strict-Transport-Security header must be present");
  assert.match(hsts, /max-age=\d+/, "HSTS must have max-age");
  const maxAgeMatch = hsts.match(/max-age=(\d+)/);
  const maxAge = Number(maxAgeMatch?.[1]);
  assert.ok(maxAge >= 31536000, "HSTS max-age must be at least 1 year (31536000)");
  assert.ok(hsts.includes("includeSubDomains"), "HSTS must include includeSubDomains");

  // Content-Security-Policy (V3.2.1, V3.4.6)
  const csp = headerMap.get("content-security-policy");
  assert.ok(csp, "Content-Security-Policy header must be present");
  assert.ok(csp.includes("default-src 'self'"), "CSP must set default-src 'self'");
  assert.ok(csp.includes("frame-ancestors 'none'"), "CSP must disallow framing with frame-ancestors 'none'");
  assert.ok(csp.includes("base-uri 'self'"), "CSP must restrict base-uri to 'self'");
  assert.ok(csp.includes("form-action 'self'"), "CSP must restrict form-action to 'self'");

  // X-Frame-Options (V3.4.3)
  assert.equal(headerMap.get("x-frame-options"), "DENY", "X-Frame-Options must be DENY");

  // X-Content-Type-Options (V3.4.1)
  assert.equal(headerMap.get("x-content-type-options"), "nosniff", "X-Content-Type-Options must be nosniff");

  // Referrer-Policy (V3.4.5)
  assert.equal(
    headerMap.get("referrer-policy"),
    "strict-origin-when-cross-origin",
    "Referrer-Policy must be strict-origin-when-cross-origin"
  );

  // Cross-Origin-Opener-Policy (V3.4.8)
  assert.equal(
    headerMap.get("cross-origin-opener-policy"),
    "same-origin-allow-popups",
    "Cross-Origin-Opener-Policy must be same-origin-allow-popups"
  );

  // Cross-Origin-Resource-Policy (V3.5.8)
  assert.equal(
    headerMap.get("cross-origin-resource-policy"),
    "same-origin",
    "Cross-Origin-Resource-Policy must be same-origin"
  );

  // Permissions-Policy (V3.4.7)
  const permissionsPolicy = headerMap.get("permissions-policy");
  assert.ok(permissionsPolicy, "Permissions-Policy must be present");
  assert.ok(permissionsPolicy.includes("camera=()"), "Permissions-Policy must disable camera");
  assert.ok(permissionsPolicy.includes("microphone=()"), "Permissions-Policy must disable microphone");
  assert.ok(permissionsPolicy.includes("geolocation=()"), "Permissions-Policy must disable geolocation");
  assert.ok(permissionsPolicy.includes("payment=()"), "Permissions-Policy must disable payment");
  assert.ok(permissionsPolicy.includes("usb=()"), "Permissions-Policy must disable usb");
  assert.ok(permissionsPolicy.includes("screen-wake-lock=()"), "Permissions-Policy must disable screen-wake-lock");
});

test("CSP builder hardens directives for production mode (ASVS V3.2.4, V3.2.6)", () => {
  const prodCsp = buildCspHeader(true);
  // ASVS V3.2.4: No 'unsafe-eval' in production
  assert.ok(!prodCsp.includes("'unsafe-eval'"), "Production CSP must not allow 'unsafe-eval'");
  // ASVS V3.2.6: Automatic upgrade to HTTPS
  assert.ok(
    prodCsp.includes("upgrade-insecure-requests;"),
    "Production CSP must include upgrade-insecure-requests"
  );

  const devCsp = buildCspHeader(false);
  // Development mode allows 'unsafe-eval' for Next.js Fast Refresh
  assert.ok(devCsp.includes("'unsafe-eval'"), "Dev CSP includes 'unsafe-eval' for Fast Refresh");
  assert.ok(
    !devCsp.includes("upgrade-insecure-requests;"),
    "Dev CSP must not force upgrade-insecure-requests on http://localhost"
  );
});
