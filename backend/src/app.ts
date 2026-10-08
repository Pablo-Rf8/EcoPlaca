import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { envConfig } from './config/env.config';
import { requestLogger } from './middleware/logger.middleware';
import { notFoundHandler, errorHandler } from './middleware/error.middleware';
import apiRouter from './routes';

export function createApp(): Application {
  const app: Application = express();

  // Configuración de CORS
  app.use(cors({
    origin: (origin, callback) => {
      // Permitir solicitudes locales de Angular o sin origen (ej. curl, Postman, api.http)
      if (!origin || origin === envConfig.corsOrigin || origin.startsWith('http://localhost:')) {
        callback(null, true);
      } else {
        callback(null, true); // En desarrollo permitimos orígenes amigables
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
  }));

  // Parsers de contenido
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Middleware de logging de peticiones
  app.use(requestLogger);

  // Ruta raíz de bienvenida e información de la API
  app.get('/', (req: Request, res: Response) => {
    res.json({
      name: 'EcoPlaca API',
      description: 'Plataforma para la gestión circular y trazabilidad de RAEE',
      version: '1.0.0',
      status: 'active',
      documentation: `${envConfig.apiPrefix}/health`
    });
  });

  // Montaje de rutas de la API bajo el prefijo configurado (/api)
  app.use(envConfig.apiPrefix, apiRouter);

  // Manejo de 404 (Rutas inexistentes)
  app.use(notFoundHandler);

  // Manejo centralizado de errores (500)
  app.use(errorHandler);

  return app;
}

export default createApp();
