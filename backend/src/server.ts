import dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno desde .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import app from './app';
import { testConnection } from './config/database';

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`[EcoPlaca API] Servidor ejecutándose en http://localhost:${PORT}`);
  console.log(`[EcoPlaca API] Endpoint de salud: http://localhost:${PORT}/api/health`);
  console.log(`[EcoPlaca API] Rutas base: http://localhost:${PORT}/api`);
  await testConnection();
});
