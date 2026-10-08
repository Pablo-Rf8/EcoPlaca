import { Router } from 'express';
import authRoutes from './auth.routes';
import componentRoutes from './component.routes';
import reservationRoutes from './reservation.routes';
import impactRoutes from './impact.routes';
import { sendSuccess } from '../utils/response.util';

const apiRouter = Router();

// Health Check Endpoint
apiRouter.get('/health', (req, res) => {
  sendSuccess(res, {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'EcoPlaca Backend API',
    version: '1.0.0'
  }, 'Servicio EcoPlaca funcionando correctamente');
});

// Enrutadores de módulos
apiRouter.use('/auth', authRoutes);
apiRouter.use('/components', componentRoutes);
apiRouter.use('/reservations', reservationRoutes);
apiRouter.use('/impact', impactRoutes);

export default apiRouter;
