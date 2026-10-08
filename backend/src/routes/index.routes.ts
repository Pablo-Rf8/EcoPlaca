import { Router, Request, Response } from 'express';
import authRoutes from './auth.routes';
import dispositivosRoutes from './dispositivos.routes';
import transferenciasRoutes from './transferencias.routes';
import dashboardRoutes from './dashboard.routes';
import categoriasRoutes from './categorias.routes';
import centrosRoutes from './centros.routes';

const router = Router();

// Endpoint de salud
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', app: 'EcoPlaca API' });
});

// Enrutadores de módulos
router.use('/auth', authRoutes);
router.use('/dispositivos', dispositivosRoutes);
router.use('/transferencias', transferenciasRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/categorias', categoriasRoutes);
router.use('/centros', centrosRoutes);

export default router;
