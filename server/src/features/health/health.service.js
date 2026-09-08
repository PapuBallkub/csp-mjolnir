import mongoose from 'mongoose';

const CONNECTION_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

export function getHealth() {
  const { readyState, name } = mongoose.connection;

  return {
    status: readyState === 1 ? 'ok' : 'degraded',
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      state: CONNECTION_STATES[readyState] ?? 'unknown',
      name: name ?? null,
    },
  };
}
