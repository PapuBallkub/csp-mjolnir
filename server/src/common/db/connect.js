import mongoose from 'mongoose';

import { env, isProduction } from '#common/config/env.js';

// Registers every model before anything can populate a ref. See src/models/index.js.
import '#models/index.js';

export async function connectDatabase() {
  // Building indexes on every boot is fine while the collections are small, but
  // it is not something to do against a populated Atlas cluster.
  mongoose.set('autoIndex', !isProduction);

  await mongoose.connect(env.mongoUri);
  return mongoose.connection;
}

export function disconnectDatabase() {
  return mongoose.disconnect();
}
