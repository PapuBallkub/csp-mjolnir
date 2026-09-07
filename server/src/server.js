import { env } from '#common/config/env.js';
import { connectDatabase, disconnectDatabase } from '#common/db/connect.js';

import { createApp } from './app.js';

async function start() {
  // Connect before listening: an API that answers requests against a database
  // it never reached is worse than one that refuses to boot.
  const connection = await connectDatabase();
  console.log(`MongoDB connected to ${connection.name}`);

  const server = createApp().listen(env.port, () => {
    console.log(`Server is running on http://localhost:${env.port}`);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      server.close(async () => {
        await disconnectDatabase();
        process.exit(0);
      });
    });
  }
}

start().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
