import { Router } from 'express';
import { dispositivosController } from '../controllers/dispositivos.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.get('/', dispositivosController.getDispositivos);
router.get('/:id', dispositivosController.getDispositivoById);
router.post('/', dispositivosController.createDispositivo);
router.patch('/:id/estado', authenticateToken, dispositivosController.updateEstado);

export default router;
