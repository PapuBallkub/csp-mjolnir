import dotenv from 'dotenv';

dotenv.config();

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
  mongoUri: required(
    'MONGO_URI',
    'Copy server/.env.example to server/.env and fill it in. For a local mongod, use mongodb://localhost:27017/mjolnir.',
  ),
  // Signs the session cookie. Required for the same reason MONGO_URI is: a
  // development fallback here is a hardcoded signing key, and a hardcoded
  // signing key that reaches production lets anyone mint a session for any
  // account. Unlike MONGO_URI this one is per-developer — generate your own,
  // and the only thing a mismatch costs is your own local sessions.
  jwtSecret: required(
    'JWT_SECRET',
    'Generate one with: node -e "console.log(crypto.randomUUID() + crypto.randomUUID())".',
  ),
};

export const isProduction = env.nodeEnv === 'production';
