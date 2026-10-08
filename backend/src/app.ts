import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/error.middleware';
import indexRoutes from './routes/index.routes';

const app: Application = express();

// Middlewares globales
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Endpoint de salud requerido: GET /api/health
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', app: 'EcoPlaca API' });
});

// Montaje de rutas base bajo el prefijo /api
app.use('/api', indexRoutes);

// Manejo de rutas inexistentes (404)
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Ruta no encontrada: [${req.method}] ${req.originalUrl}`
  });
});

// Middleware de manejo de errores
app.use(errorHandler);

export default app;
