const ALLOWED_EGP_HOST_SUFFIX = '.gprocurement.go.th';
const ALLOWED_EGP_ROOT_HOST = 'gprocurement.go.th';

// Permits only http/https URLs; blocks javascript:, data:, file:, etc. (ASVS V1.2.2)
export function isSafeHttpUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  try {
    const { protocol } = new URL(rawUrl.trim());
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

// Restricts outbound document fetches to https://*.gprocurement.go.th (ASVS V1.3.6, V1.5.3)
export function isAllowedEgpUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;
    if (parsed.port !== '' && parsed.port !== '443') return false;
    const host = parsed.hostname.toLowerCase();
    return host === ALLOWED_EGP_ROOT_HOST || host.endsWith(ALLOWED_EGP_HOST_SUFFIX);
  } catch {
    return false;
  }
}

// Strips CR/LF/null control characters from email headers (ASVS V1.3.11)
export function sanitizeMailHeader(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\r\n\0]+/g, ' ').trim();
}

// Neutralizes spreadsheet formulas and applies RFC 4180 CSV quoting (ASVS V1.2.10)
export function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';
  let str = String(value);
  if (/^[=+\-@\t\0]/.test(str)) str = `'${str}`;
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}
