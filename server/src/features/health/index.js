// The public surface of this feature. Other features import from here and never
// reach into the files beside it.
export { healthRoutes } from './health.routes.js';
export { getHealth } from './health.service.js';
