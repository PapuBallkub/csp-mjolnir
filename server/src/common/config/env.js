import dotenv from 'dotenv';

dotenv.config();

// "true"/"false" from the environment; anything else keeps the default, so a
// typo can't flip a safety setting
function flag(value, fallback) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

// `minBytes` counts UTF-8 bytes, which is what a key is. The error never shows
// the value or its length: either one in a deploy log helps guess the secret.
function required(name, hint, { minBytes = 0 } = {}) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. ${hint}`);
  }
  if (Buffer.byteLength(value, 'utf8') < minBytes) {
    throw new Error(`${name} is too short: it must be at least ${minBytes} bytes. ${hint}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 8000),
  // ASVS V3.5, V13.1, V15.2: In production, CORS_ORIGIN is required so the server
  // never falls back to an insecure default origin like localhost with credentials.
  corsOrigin:
    (process.env.NODE_ENV ?? 'development') === 'production' && !process.env.CORS_ORIGIN
      ? required('CORS_ORIGIN', 'Set CORS_ORIGIN to the production client origin (e.g. https://app.gipdp.go.th).')
      : (process.env.CORS_ORIGIN ?? 'http://localhost:3000'),
  // How many reverse proxies stand between the internet and this process, which
  // is the only way Express can work out a caller's real address. 0 is right
  // for a local run and for docker compose, where nothing sits in front.
  //
  // It must stay a count, never `true`: a count is read from the right of
  // X-Forwarded-For, where the proxy's own entries are, while `true` takes the
  // leftmost entry, which the caller writes. Rate limiting keyed on a value the
  // caller chooses is not rate limiting. See docs/deployment-checklist.md.
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 0),
  mongoUri: required(
    'MONGO_URI',
    'Copy server/.env.example to server/.env and fill it in. For a local mongod, use mongodb://localhost:27017/mjolnir.',
  ),
  // Signs the session cookie. Required like MONGO_URI: a fallback here is a
  // hardcoded key, and in production that lets anyone mint any session.
  // Per-developer, not shared, so a mismatch only drops your local sessions.
  // At least 32 bytes: an HS256 key must be no shorter than its 256-bit hash
  // (RFC 7518 §3.2), and anything shorter is the easier secret to guess.
  jwtSecret: required(
    'JWT_SECRET',
    'Generate one with: node -e "console.log(crypto.randomUUID() + crypto.randomUUID())".',
    { minBytes: 32 },
  ),
  // Keys the HMAC that every password goes through before bcrypt
  // (features/auth/password.js). Kept outside the database on purpose: a leaked
  // users collection is useless without it. Its own secret, not derived from
  // JWT_SECRET, so that rotating JWT_SECRET to sign everyone out doesn't also
  // lock everyone out. It can't be rotated itself: every password hash depends
  // on it, and losing it makes every password account unusable, so back it up
  // like MONGO_URI. Per-developer, like JWT_SECRET.
  passwordPepper: required(
    'PASSWORD_PEPPER',
    'Generate one with: node -e "console.log(crypto.randomBytes(32).toString(\'base64\'))".',
    { minBytes: 32 },
  ),
  // Optional, unlike the three above: the server runs fine without Google
  // sign-in, and requiring it would stop CI and every teammate who has not set
  // it up. The routes answer 503 when it is missing.
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? '',
  },
  // Pilot mode: the API shows TOR insights nobody has reviewed yet, and demo
  // data, each labelled as such. Off, it shows only what a person approved
  // with a score of 80 or more (NFR-17). On by default outside production,
  // and on in production only when set explicitly.
  showUnreviewedInsights: flag(
    process.env.SHOW_UNREVIEWED_INSIGHTS,
    (process.env.NODE_ENV ?? 'development') !== 'production',
  ),
  // Email dispatch settings (FR-14, FR-18). Works with Gmail SMTP or standard SMTP.
  // Optional: when user or pass is omitted, email dispatch is disabled.
  email: {
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 465),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.EMAIL_FROM ?? 'GIPDP Procurement Alerts <no-reply@gipdp.go.th>',
  },
};

export const isProduction = env.nodeEnv === 'production';

export const isGoogleConfigured = Boolean(
  env.google.clientId && env.google.clientSecret && env.google.redirectUri,
);

export const isEmailConfigured = Boolean(env.email.user && env.email.pass);
