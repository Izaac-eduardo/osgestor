import { Router } from 'express';
import { changePasswordController, loginController, logoutController, meController } from '../controllers/auth.controller.js';
import { requireAuthentication } from '../middleware/authentication.js';
import { loginRateLimit } from '../middleware/auth-rate-limit.js';
import { requireAllowedOrigin } from '../middleware/origin-protection.js';

export const authRoutes = Router();
authRoutes.post('/login', requireAllowedOrigin, loginRateLimit, loginController);
authRoutes.post('/register', (_request, response) => { response.status(404).json({ message: 'Rota não encontrada.' }); });
authRoutes.post('/logout', requireAllowedOrigin, requireAuthentication, logoutController);
authRoutes.get('/me', requireAuthentication, meController);
authRoutes.post('/change-password', requireAllowedOrigin, requireAuthentication, changePasswordController);
