# EcoPlaca - Tarea 2

Código completo de los archivos existentes revisados. Validación: TypeScript con --noEmit aprobada. No se ejecutaron pruebas contra MySQL.

## backend/src/models/transferencia.model.ts  ```typescript export type EstadoTransferencia =
  | 'PENDIENTE' | 'EN_TRANSITO' | 'RECIBIDO' | 'CANCELADO' | 'COMPLETADA';

export interface Transferencia {
  id: number;
  dispositivoId: number;
  tecnicoId: number;
  centroOrigenId: number;
  centroDestinoId: number | null;
  estado: EstadoTransferencia;
  motivo: string;
  fechaSolicitud: Date;
  fechaCompletado: Date | null;
}

export interface SolicitarTransferenciaDTO {
  dispositivoId: number;
  centroDestinoId?: number | null;
  motivo: string;
}
 ``` 
## backend/src/controllers/transferencias.controller.ts  ```typescript import { NextFunction, Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { PoolConnection } from 'mysql2/promise';
import pool from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { EstadoTransferencia, SolicitarTransferenciaDTO } from '../models/transferencia.model';
import { EstadoDisponibilidad } from '../models/dispositivo.model';
import { sendError, sendSuccess } from '../utils/response.util';

interface DispositivoRow extends RowDataPacket {
  id: number;
  categoria_id: number;
  centro_acopio_id: number | null;
  estado_disponibilidad: EstadoDisponibilidad;
}

interface OrdenRow extends RowDataPacket {
  id: number;
  dispositivo_id: number;
  tecnico_id: number;
  centro_destino_id: number | null;
  estado: EstadoTransferencia;
}

function positiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

async function rollback(connection: PoolConnection | undefined): Promise<void> {
  if (!connection) return;
  try {
    await connection.rollback();
  } catch (error: unknown) {
    // Una conexión que no permite rollback no debe volver al pool.
    console.error('Error al revertir transferencia', error);
    connection.destroy();
  }
}

export async function solicitarTransferencia(
  req: AuthRequest, res: Response, next: NextFunction
): Promise<void> {
  if (!req.usuario) {
    sendError(res, 'Autenticación requerida', 401);
    return;
  }
  const body: Partial<SolicitarTransferenciaDTO> | null = req.body;
  if (!body || !positiveId(body.dispositivoId) || typeof body.motivo !== 'string'
      || !body.motivo.trim() || body.motivo.trim().length > 255
      || (body.centroDestinoId != null && !positiveId(body.centroDestinoId))) {
    sendError(res, 'Se requieren dispositivoId positivo, motivo de 1 a 255 caracteres y centroDestinoId válido', 400);
    return;
  }
  let connection: PoolConnection | undefined;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [devices] = await connection.execute<DispositivoRow[]>(
      'SELECT id, categoria_id, centro_acopio_id, estado_disponibilidad FROM dispositivos WHERE id = ? FOR UPDATE',
      [body.dispositivoId]
    );
    const device: DispositivoRow | undefined = devices[0];
    if (!device) {
      await rollback(connection);
      sendError(res, 'Dispositivo no encontrado', 404);
      return;
    }
    const [activeOrders] = await connection.execute<RowDataPacket[]>(
      `SELECT id FROM ordenes_transferencia WHERE dispositivo_id = ?
       AND estado IN ('PENDIENTE', 'EN_TRANSITO') FOR UPDATE`, [device.id]
    );
    if (device.estado_disponibilidad !== 'DISPONIBLE' || activeOrders.length > 0) {
      await rollback(connection);
      sendError(res, 'El dispositivo no está disponible o ya tiene una transferencia activa', 409);
      return;
    }
    if (device.centro_acopio_id === null) {
      await rollback(connection);
      sendError(res, 'El dispositivo necesita un centro de origen', 409);
      return;
    }
    const destination: number | null = body.centroDestinoId ?? null;
    const [centers] = await connection.execute<RowDataPacket[]>(
      `SELECT c.id FROM centros_acopio c JOIN centros_categorias cc ON cc.centro_id = c.id
       WHERE c.id IN (?, ?) AND c.activo = TRUE AND cc.categoria_id = ? FOR UPDATE`,
      [device.centro_acopio_id, destination, device.categoria_id]
    );
    const requiredCenters: number = destination !== null && destination !== device.centro_acopio_id ? 2 : 1;
    if (centers.length !== requiredCenters) {
      await rollback(connection);
      sendError(res, 'Los centros deben estar activos y admitir la categoría del dispositivo', 409);
      return;
    }
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ordenes_transferencia
       (dispositivo_id, tecnico_id, centro_origen_id, centro_destino_id, estado, motivo)
       VALUES (?, ?, ?, ?, 'PENDIENTE', ?)`,
      [device.id, req.usuario.id, device.centro_acopio_id, destination, body.motivo.trim()]
    );
    await connection.execute<ResultSetHeader>(
      "UPDATE dispositivos SET estado_disponibilidad = 'RESERVADO' WHERE id = ?", [device.id]
    );
    await connection.commit();
    sendSuccess(res, { id: result.insertId, dispositivoId: device.id, tecnicoId: req.usuario.id,
      centroOrigenId: device.centro_acopio_id, centroDestinoId: destination,
      motivo: body.motivo.trim(), estado: 'PENDIENTE', estadoDisponibilidad: 'RESERVADO' },
    'Transferencia solicitada', 201);
  } catch (error: unknown) {
    await rollback(connection);
    next(error);
  } finally {
    connection?.release();
  }
}

export async function completarTransferencia(
  req: AuthRequest, res: Response, next: NextFunction
): Promise<void> {
  if (!req.usuario) {
    sendError(res, 'Autenticación requerida', 401);
    return;
  }
  const rawId: string = String(req.params.id);
  const id: number = Number(rawId);
  if (!/^\d+$/.test(rawId) || !positiveId(id)) {
    sendError(res, 'ID de transferencia inválido', 400);
    return;
  }
  let connection: PoolConnection | undefined;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    // Obtener el ID primero permite bloquear siempre dispositivo antes que orden.
    const [references] = await connection.execute<OrdenRow[]>(
      'SELECT dispositivo_id FROM ordenes_transferencia WHERE id = ?', [id]
    );
    if (!references[0]) {
      await rollback(connection);
      sendError(res, 'Transferencia no encontrada', 404);
      return;
    }
    const [devices] = await connection.execute<DispositivoRow[]>(
      'SELECT id, estado_disponibilidad FROM dispositivos WHERE id = ? FOR UPDATE',
      [references[0].dispositivo_id]
    );
    const [orders] = await connection.execute<OrdenRow[]>(
      'SELECT id, dispositivo_id, tecnico_id, centro_destino_id, estado FROM ordenes_transferencia WHERE id = ? FOR UPDATE', [id]
    );
    const order: OrdenRow | undefined = orders[0];
    if (!order) {
      await rollback(connection);
      sendError(res, 'Transferencia no encontrada', 404);
      return;
    }
    if (res.locals.rol !== 'ADMIN' && order.tecnico_id !== req.usuario.id) {
      await rollback(connection);
      sendError(res, 'Solo el técnico responsable o un administrador puede confirmar la entrega', 403);
      return;
    }
    if (!['PENDIENTE', 'EN_TRANSITO'].includes(order.estado)
        || devices[0]?.estado_disponibilidad !== 'RESERVADO'
        || devices[0]?.id !== order.dispositivo_id) {
      await rollback(connection);
      sendError(res, 'La orden y el dispositivo no permiten confirmar la entrega', 409);
      return;
    }
    await connection.execute<ResultSetHeader>(
      "UPDATE ordenes_transferencia SET estado = 'COMPLETADA', fecha_completado = CURRENT_TIMESTAMP WHERE id = ?", [id]
    );
    await connection.execute<ResultSetHeader>(
      `UPDATE dispositivos SET estado_disponibilidad = 'ENTREGADO',
       centro_acopio_id = COALESCE(?, centro_acopio_id) WHERE id = ?`,
      [order.centro_destino_id, order.dispositivo_id]
    );
    await connection.commit();
    sendSuccess(res, { id, dispositivoId: order.dispositivo_id,
      estado: 'COMPLETADA', estadoDisponibilidad: 'ENTREGADO' }, 'Entrega física confirmada');
  } catch (error: unknown) {
    await rollback(connection);
    next(error);
  } finally {
    connection?.release();
  }
}
 ``` 
## backend/src/controllers/dashboard.controller.ts  ```typescript import { NextFunction, Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { EstadoTransferencia } from '../models/transferencia.model';
import { calculateAvoidedCo2 } from '../utils/carbonCalculator.util';
import { sendSuccess } from '../utils/response.util';

interface MetricaRow extends RowDataPacket {
  tipo: 'RAEE' | 'TRANSFERENCIA';
  clave: string;
  valor: string | number;
}

export async function getMetricas(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Una sola sentencia obtiene métricas coherentes sin multiplicar pesos por órdenes.
    const [rows] = await pool.execute<MetricaRow[]>(
      `SELECT 'RAEE' AS tipo, c.codigo AS clave, SUM(d.peso_kg) AS valor
       FROM dispositivos d JOIN categorias_raee c ON c.id = d.categoria_id
       WHERE d.estado_disponibilidad IN ('ENTREGADO', 'RECICLADO') GROUP BY c.id, c.codigo
       UNION ALL
       SELECT 'TRANSFERENCIA' AS tipo, estado AS clave, COUNT(*) AS valor
       FROM ordenes_transferencia GROUP BY estado`
    );
    let totalKgRecuperados: number = 0;
    let co2EvitadoKg: number = 0;
    const transferenciasPorEstado: Record<EstadoTransferencia, number> = {
      PENDIENTE: 0, EN_TRANSITO: 0, RECIBIDO: 0, CANCELADO: 0, COMPLETADA: 0
    };
    for (const row of rows) {
      const value: number = Number(row.valor);
      if (row.tipo === 'RAEE') {
        totalKgRecuperados += value;
        co2EvitadoKg += calculateAvoidedCo2(value, row.clave.replace(/^RAEE-/, 'CAT-'));
      } else if (Object.prototype.hasOwnProperty.call(transferenciasPorEstado, row.clave)) {
        transferenciasPorEstado[row.clave as EstadoTransferencia] = value;
      }
    }
    res.setHeader('Cache-Control', 'no-store');
    sendSuccess(res, { totalKgRecuperados: Math.round(totalKgRecuperados * 100) / 100,
      co2EvitadoKg: Math.round(co2EvitadoKg * 100) / 100, transferenciasPorEstado });
  } catch (error: unknown) {
    next(error);
  }
}
 ``` 
## backend/src/routes/transferencias.routes.ts  ```typescript import { Router } from 'express';
import { solicitarTransferencia, completarTransferencia } from '../controllers/transferencias.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/roles.middleware';

const router: Router = Router();
router.use(authenticateToken);
router.post('/', authorizeRoles('TECHNICIAN'), solicitarTransferencia);
router.patch('/:id/completar', authorizeRoles('ADMIN', 'TECHNICIAN'), completarTransferencia);
export default router;
 ``` 
## backend/src/routes/dashboard.routes.ts  ```typescript import { Router } from 'express';
import { getMetricas } from '../controllers/dashboard.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { authorizeRoles } from '../middleware/roles.middleware';

const router: Router = Router();
router.get('/metricas', authenticateToken, authorizeRoles('ADMIN', 'DONOR', 'TECHNICIAN'), getMetricas);
export default router;
 ``` 
## backend/src/routes/index.routes.ts  ```typescript import { Router, Request, Response } from 'express';
import authRoutes from './auth.routes';
import dispositivosRoutes from './dispositivos.routes';
import transferenciasRoutes from './transferencias.routes';
import dashboardRoutes from './dashboard.routes';

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

export default router;
 ``` 
## backend/api.http  ```http @baseUrl = http://localhost:3000/api
@contentType = application/json
@dispositivoTransferenciaId = 2

### 1. Health Check (Verificación de estado)
GET {{baseUrl}}/health
Accept: {{contentType}}

### 2. Autenticación - Login de Administrador
# @name loginAdmin
POST {{baseUrl}}/auth/login
Content-Type: {{contentType}}

{
  "email": "admin@ecoplaca.org",
  "password": "ecoplaca2026"
}

### Guardar token JWT recibido
@authToken = {{loginAdmin.response.body.data.token}}

### 3. Autenticación - Registro de nuevo usuario
POST {{baseUrl}}/auth/register
Content-Type: {{contentType}}

{
  "nombreCompleto": "Mario Taller de Reparación",
  "email": "mario.taller@ejemplo.com",
  "password": "ecoplaca2026",
  "rolId": 3,
  "telefono": "+52 33 9988 1122",
  "direccion": "Av. Vallarta 1500, Guadalajara"
}

### 4. Consultar Perfil con Token
GET {{baseUrl}}/auth/perfil
Authorization: Bearer {{authToken}}
Accept: {{contentType}}

### 5. Listar todos los dispositivos catalogados
GET {{baseUrl}}/dispositivos
Accept: {{contentType}}

### 6. Filtrar dispositivos disponibles y en estado funcional reparable
GET {{baseUrl}}/dispositivos?estado=DISPONIBLE&estadoFuncional=REPARABLE
Accept: {{contentType}}

### 7. Buscar dispositivos por texto libre
GET {{baseUrl}}/dispositivos?busqueda=Ryzen
Accept: {{contentType}}

### 8. Obtener detalle de un dispositivo por ID
GET {{baseUrl}}/dispositivos/1
Accept: {{contentType}}

### 9. Catalogar un nuevo dispositivo RAEE
POST {{baseUrl}}/dispositivos
Content-Type: {{contentType}}

{
  "titulo": "Placa Madre Gigabyte B550 AORUS Elite AX V2",
  "categoriaId": 1,
  "donanteId": 2,
  "centroAcopioId": 1,
  "marca": "Gigabyte",
  "modelo": "B550 AORUS Elite AX V2",
  "numeroSerie": "SN-GB550-99812",
  "estadoFuncional": "REPARABLE",
  "pesoKg": 1.10,
  "especificaciones": {
    "socket": "AM4",
    "chipset": "AMD B550",
    "formato": "ATX"
  },
  "notas": "Donada con BIOS corrupta. Requiere reprogramación de chip SPI Flash."
}

### 10. Actualizar estado de un dispositivo
PATCH {{baseUrl}}/dispositivos/1/estado
Authorization: Bearer {{authToken}}
Content-Type: {{contentType}}

{
  "estadoDisponibilidad": "RESERVADO",
  "estadoFuncional": "REPARABLE",
  "notas": "Apartado para taller de estudiantes de bachillerato técnico."
}

### 11. Login del técnico responsable
# @name loginTecnico
POST {{baseUrl}}/auth/login
Content-Type: {{contentType}}

{
  "email": "laura.tecnico@ecoplaca.org",
  "password": "ecoplaca2026"
}

@tecnicoToken = {{loginTecnico.response.body.data.token}}

### 12. Métricas antes de la entrega (200)
GET {{baseUrl}}/dashboard/metricas
Authorization: Bearer {{tecnicoToken}}

### 13. Solicitar transferencia (201, dispositivo RESERVADO)
# Usar un dispositivo DISPONIBLE sin órdenes activas; el dispositivo seed 2 cumple.
# @name solicitarTransferencia
POST {{baseUrl}}/transferencias
Authorization: Bearer {{tecnicoToken}}
Content-Type: {{contentType}}

{
  "dispositivoId": {{dispositivoTransferenciaId}},
  "centroDestinoId": 2,
  "motivo": "Recuperación para taller de reparación"
}

@transferenciaId = {{solicitarTransferencia.response.body.data.id}}

### 14. Reservar nuevamente el mismo dispositivo (409)
POST {{baseUrl}}/transferencias
Authorization: Bearer {{tecnicoToken}}
Content-Type: {{contentType}}

{
  "dispositivoId": {{dispositivoTransferenciaId}},
  "centroDestinoId": 2,
  "motivo": "Segunda solicitud que debe rechazarse"
}

### 15. Confirmar entrega física (200, COMPLETADA y ENTREGADO)
PATCH {{baseUrl}}/transferencias/{{transferenciaId}}/completar
Authorization: Bearer {{tecnicoToken}}

### 16. Repetir confirmación (409, métricas sin duplicación)
PATCH {{baseUrl}}/transferencias/{{transferenciaId}}/completar
Authorization: Bearer {{tecnicoToken}}

### 17. Métricas después de la entrega (200)
# Con el dispositivo seed 2: incremento de 1.60 kg y 29.12 kg CO2.
GET {{baseUrl}}/dashboard/metricas
Authorization: Bearer {{tecnicoToken}}

### 18. Solicitud inválida (400)
POST {{baseUrl}}/transferencias
Authorization: Bearer {{tecnicoToken}}
Content-Type: {{contentType}}

{
  "dispositivoId": -1,
  "motivo": ""
}

### 19. Dashboard sin JWT (401)
GET {{baseUrl}}/dashboard/metricas

### 20. Administrador solicita como técnico (403)
POST {{baseUrl}}/transferencias
Authorization: Bearer {{authToken}}
Content-Type: {{contentType}}

{
  "dispositivoId": {{dispositivoTransferenciaId}},
  "motivo": "Solicitud con rol no autorizado"
}
 ``` 