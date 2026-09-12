import { Router } from 'express';

import {
  completeGoogleSignIn,
  login,
  logout,
  readCurrentUser,
  register,
  startGoogleSignIn,
} from './auth.controller.js';
import { requireAuth } from './auth.middleware.js';

export const authRoutes = Router();

authRoutes.post('/register', register);
authRoutes.post('/login', login);
authRoutes.post('/logout', logout);

authRoutes.get('/google', startGoogleSignIn);
authRoutes.get('/google/callback', completeGoogleSignIn);

// What the client calls on load to find out whether its cookie is still good.
authRoutes.get('/me', requireAuth, readCurrentUser);
