/**
 * Validates a `?next=` return path before anything navigates to it.
 *
 * `router.replace()` will follow an absolute URL perfectly happily, so passing
 * the parameter through unchecked makes `/auth?next=https://evil.com` a working
 * open redirect on a sign-in page — the one place a user is primed to type a
 * password. This is the only function in the client with a security
 * consequence, which is why it lives alone and has its own tests.
 *
 * Returns null rather than throwing, and never a default: the caller knows
 * where it wants to land when there is no usable destination, and sign-in and
 * sign-up deliberately disagree about that.
 */
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;

  // Must be a path on this site, not a URL. "/watchlist" yes, "https://..." no,
  // and "watchlist" no — a relative path resolves against wherever we are now.
  if (!value.startsWith("/")) return null;

  // "//evil.com" is protocol-relative and navigates off-site. The backslash
  // variants are the same attack: some browsers normalise "\" to "/" in a URL,
  // so "/\evil.com" and "\evil.com" reach the same place as "//evil.com".
  if (value.startsWith("//") || value.startsWith("/\\")) return null;

  // A newline can split a header, and control characters are never legitimate
  // in a path we generated.
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;

  return value;
}
