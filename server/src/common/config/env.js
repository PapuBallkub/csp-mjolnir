import dotenv from 'dotenv';

dotenv.config();

// "true"/"false" from the environment; anything else keeps the default, so a
// typo can't flip a safety setting
function flag(value, fallback) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function required(name, hint) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. ${hint}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 8000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
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
  jwtSecret: required(
    'JWT_SECRET',
    'Generate one with: node -e "console.log(crypto.randomUUID() + crypto.randomUUID())".',
  ),
  // Optional, unlike the two above: the server runs fine without Google
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
};

export const isProduction = env.nodeEnv === 'production';

export const isGoogleConfigured = Boolean(
  env.google.clientId && env.google.clientSecret && env.google.redirectUri,
);
