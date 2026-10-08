import { Router, Request, Response } from 'express';
import authRoutes from './auth.routes';
import dispositivosRoutes from './dispositivos.routes';

const router = Router();

// Endpoint de salud
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', app: 'EcoPlaca API' });
});

// Enrutadores de módulos
router.use('/auth', authRoutes);
router.use('/dispositivos', dispositivosRoutes);

export default router;
