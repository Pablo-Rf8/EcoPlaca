import { Router } from 'express';
import { solicitarTransferencia, completarTransferencia, misOrdenes } from '../controllers/transferencias.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/roles.middleware';

const router: Router = Router();
router.use(authenticateToken);
router.get('/mis-ordenes', authorizeRoles('ADMIN', 'TECHNICIAN'), misOrdenes);
router.post('/', authorizeRoles('TECHNICIAN'), solicitarTransferencia);
router.patch('/:id/completar', authorizeRoles('ADMIN', 'TECHNICIAN'), completarTransferencia);
export default router;
