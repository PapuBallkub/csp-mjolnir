import { getHealth } from './health.service.js';

export function readHealth(req, res) {
  const health = getHealth();
  res.status(health.status === 'ok' ? 200 : 503).json(health);
}
