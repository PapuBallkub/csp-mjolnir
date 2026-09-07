import { Router } from 'express';

import { readHealth } from './health.controller.js';

export const healthRoutes = Router();

healthRoutes.get('/', readHealth);
