import { Router } from 'express';
import { listAuditController } from '../controllers/audit.controller.js';
import { requireRole } from '../middleware/authorization.js';

export const auditRoutes = Router();
auditRoutes.use(requireRole('ADMIN', 'GESTOR'));
auditRoutes.get('/', listAuditController);
