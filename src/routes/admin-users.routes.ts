import { Router } from 'express';
import { createAdminUser, getAdminUser, listAdminUsers, patchAdminUser, patchAdminUserStatus, resetAdminUserPassword } from '../controllers/admin-users.controller.js';
import { requireRole } from '../middleware/authorization.js';

export const adminUsersRoutes = Router();
adminUsersRoutes.use(requireRole('ADMIN'));
adminUsersRoutes.get('/', listAdminUsers);
adminUsersRoutes.get('/:id', getAdminUser);
adminUsersRoutes.post('/', createAdminUser);
adminUsersRoutes.patch('/:id', patchAdminUser);
adminUsersRoutes.patch('/:id/status', patchAdminUserStatus);
adminUsersRoutes.post('/:id/reset-password', resetAdminUserPassword);
