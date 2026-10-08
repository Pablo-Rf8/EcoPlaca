import express, { Application } from 'express';
import cors from 'cors';
import { allowedOrigins } from './config/env';
import { errorHandler } from './middleware/error.middleware';
import indexRoutes from './routes/index.routes';
const app: Application = express();
const origins: string[] = allowedOrigins();
app.use(cors({
  origin(origin, callback): void {
    if (!origin || origins.includes(origin)) callback(null, true);
    else callback(Object.assign(new Error('Origen no permitido por CORS'), { status: 403 }));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false, maxAge: 600
}));
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use('/api', indexRoutes);
app.use((req, res): void => {
  res.status(404).json({ success: false, error: `Ruta no encontrada: [${req.method}] ${req.originalUrl}` });
});
app.use(errorHandler);
export default app;
