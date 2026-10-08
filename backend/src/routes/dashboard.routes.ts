import { Router } from 'express';
import { getMetricas } from '../controllers/dashboard.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/roles.middleware';

const router: Router = Router();
router.get('/metricas', authenticateToken, authorizeRoles('ADMIN', 'DONOR', 'TECHNICIAN'), getMetricas);
export default router;
