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
  // Signs the session cookie. Required like MONGO_URI: a fallback here is a
  // hardcoded key, and in production that lets anyone mint any session.
  // Per-developer, not shared, so a mismatch only drops your local sessions.
  jwtSecret: required(
    'JWT_SECRET',
    'Generate one with: node -e "console.log(crypto.randomUUID() + crypto.randomUUID())".',
  ),
};

export const isProduction = env.nodeEnv === 'production';
