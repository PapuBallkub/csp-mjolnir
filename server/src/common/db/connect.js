import mongoose from 'mongoose';

import { env, isProduction } from '#common/config/env.js';

// Registers every model before anything can populate a ref. See src/models/index.js.
import '#models/index.js';

export async function connectDatabase() {
  // Building indexes on every boot is fine while the collections are small, but
  // it is not something to do against a populated Atlas cluster.
  mongoose.set('autoIndex', !isProduction);

  // Set here rather than in each MONGO_URI: the database name is not a secret
  // and not per-developer, and three gitignored .env files that each have to
  // agree on it is exactly the kind of drift nobody can see in a diff. dbName
  // takes precedence over the path in the connection string.
  await mongoose.connect(env.mongoUri, { dbName: 'mjolnir' });

  return mongoose.connection;
}

export function disconnectDatabase() {
  return mongoose.disconnect();
}
