import { Router } from 'express';

import { login, logout, readCurrentUser, register } from './auth.controller.js';
import { requireAuth } from './auth.middleware.js';

export const authRoutes = Router();

authRoutes.post('/register', register);
authRoutes.post('/login', login);
authRoutes.post('/logout', logout);

// What the client calls on load to find out whether the cookie it is holding is
// still good, and who it belongs to.
authRoutes.get('/me', requireAuth, readCurrentUser);
