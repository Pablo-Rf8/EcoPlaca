import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConnection, Connection } from 'mysql2/promise';
import { RowDataPacket } from 'mysql2';
import { allowedOrigins, requiredEnv } from '../src/config/env';

// Run against an already started API backed by a separate QA database:
// ECOPLACA_INTEGRATION=1 node --test -r ts-node/register/transpile-only tests/integration.test.ts
// API_URL defaults to http://127.0.0.1:3000. Fixtures are unique and retained for inspection.
// No database reset, migration, seed, or deletion of existing records is performed.
interface Envelope<T> { success: boolean; data: T; error?: string; }
interface ApiResult<T> { status: number; body: Envelope<T>; headers: Headers; }
interface Account { id: number; token: string; }
interface Category { id: number; codigo: string; nombre: string; descripcion: string | null; factorCo2Kg: number; }
interface Centre { id: number; nombre: string; direccion: string; ciudad: string; telefono: string | null; capacidadKg: number; categoriasIds: number[]; activo: boolean; }
interface Device { id: number; titulo: string; donanteId: number; centroAcopioId: number; estadoDisponibilidad: string; pesoKg: number; co2EvitadoKg: number; marca?: string | null; especificaciones?: Record<string, unknown>; createdAt: string; updatedAt?: string; }
interface Order { id: number; tecnicoId: number; dispositivoId: number; estado: string; }
interface Metrics { totalKgRecuperados: number; co2EvitadoKg: number; transferenciasPorEstado: Record<string, number>; }
interface ApiOptions { token?: string; body?: unknown; rawBody?: string; headers?: Record<string, string>; }
const hasEnv = (name: string): boolean => !!process.env[name]?.trim();
const integrationConfigured = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD']
  .every(hasEnv);

test('REST and MySQL integration on an isolated local database', {
  skip: process.env.ECOPLACA_INTEGRATION !== '1' || !integrationConfigured, timeout: 120000
}, async t => {
  const database = requiredEnv('DB_NAME');
  assert.ok(database === 'ecoplaca_qa' || database.endsWith('_test'), 'Integration requires DB_NAME=ecoplaca_qa or a name ending in _test');
  const url = new URL(process.env.API_URL ?? 'http://127.0.0.1:3000');
  const loopback = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
  assert.ok(url.protocol === 'http:' && loopback.has(url.hostname) && !url.username && !url.password
    && url.pathname === '/' && !url.search && !url.hash, 'API_URL must be a plain HTTP loopback origin');
  assert.ok(loopback.has(requiredEnv('DB_HOST')), 'Integration requires a loopback DB_HOST');
  const tag = randomUUID().replace(/-/g, '').slice(0, 12);
  const password = `QA-password-${tag}!`;
  const email = (name: string): string => `qa-${tag}-${name}@example.test`;
  const api = async <T = unknown>(method: string, route: string, options: ApiOptions = {}): Promise<ApiResult<T>> => {
    const headers: Record<string, string> = { ...options.headers };
    if (options.token) headers['Authorization'] = `Bearer ${options.token}`;
    if (options.body !== undefined || options.rawBody !== undefined) headers['Content-Type'] = 'application/json';
    const result = await fetch(`${url.origin}/api${route}`, {
      method, headers, body: options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
      signal: AbortSignal.timeout(10000)
    });
    const content = await result.text();
    const body = content ? JSON.parse(content) as Envelope<T> : {} as Envelope<T>;
    return { status: result.status, body, headers: result.headers };
  };
  const expectStatus = <T>(result: ApiResult<T>, status: number): T => {
    assert.equal(result.status, status, result.body.error ?? `Unexpected HTTP status ${result.status}`);
    if (status >= 200 && status < 300 && status !== 204) assert.equal(result.body.success, true);
    return result.body.data;
  };
  const login = async (name: string, userPassword: string = password): Promise<Account> => {
    const result = expectStatus(await api<{ token: string; usuario: { id: number } }>('POST', '/auth/login', {
      body: { email: ` ${email(name).toUpperCase()} `, password: userPassword }
    }), 200);
    return { id: result.usuario.id, token: result.token };
  };
  const register = async (name: string, rolId: number, userPassword: string = password): Promise<number> => {
    const result = expectStatus(await api<{ id: number; email: string; nombreCompleto: string }>('POST', '/auth/register', {
      body: { nombreCompleto: ` Donante QA ${tag} ${name} `, email: ` ${email(name).toUpperCase()} `, password: userPassword, rolId }
    }), 201);
    assert.equal(result.email, email(name));
    assert.equal(result.nombreCompleto, `Donante QA ${tag} ${name}`);
    return result.id;
  };
  let db: Connection | undefined;
  let admin: Account;
  let donor: Account;
  let otherDonor: Account;
  let technician: Account;
  let otherTechnician: Account;
  let category: Category;
  let origin: Centre;
  let destination: Centre;
  let inactive: Centre;
  let device: Device;
  let order: Order;
  let responsible: Account;
  let unrelated: Account;
  let baseline: Metrics;
  let beforeTwins: Metrics;
  const twins: Device[] = [];
  const metrics = async (): Promise<Metrics> => expectStatus(await api<Metrics>('GET', '/dashboard/metricas', { token: admin.token }), 200);
  const delta = (after: number, before: number): number => Math.round((after - before) * 100) / 100;
  const centreBody = (centre: Centre, categoriasIds: number[] = centre.categoriasIds): unknown => ({
    nombre: centre.nombre, direccion: centre.direccion, ciudad: centre.ciudad, telefono: centre.telefono,
    capacidadKg: centre.capacidadKg, categoriasIds
  });
  const deviceBody = (pesoKg: number, titulo: string): unknown => ({
    titulo, categoriaId: category.id, centroAcopioId: origin.id, estadoFuncional: 'REPARABLE', pesoKg,
    marca: 'QA', notas: 'Datos sintéticos de pruebas de integración', especificaciones: { prueba: tag, puertos: ['USB', 'HDMI'], memoria: { gb: 16 } }
  });
  try {
    await t.test('the local API and database are available and the seed admin can log in', async () => {
      const health = await fetch(`${url.origin}/api/health`, { signal: AbortSignal.timeout(10000) });
      assert.equal(health.status, 200);
      assert.equal((await health.json() as { status: string }).status, 'ok');
      db = await createConnection({ host: requiredEnv('DB_HOST'), port: Number(process.env.DB_PORT ?? '3306'),
        user: requiredEnv('DB_USER'), password: requiredEnv('DB_PASSWORD'), database, timezone: 'Z' });
      const [selected] = await db.query<(RowDataPacket & { name: string })[]>('SELECT DATABASE() AS name');
      assert.equal(selected[0].name, database);
      const result = expectStatus(await api<{ token: string; usuario: { id: number; rol: string } }>('POST', '/auth/login', {
        body: { email: requiredEnv('SEED_ADMIN_EMAIL'), password: requiredEnv('SEED_ADMIN_PASSWORD') }
      }), 200);
      assert.equal(result.usuario.rol, 'ADMIN');
      admin = { id: result.usuario.id, token: result.token };
    });

    await t.test('registration and login normalize names/email, duplicates conflict, and ADMIN self-registration is rejected', async () => {
      assert.equal((await loginAfterRegistration('donor', 2)).id > 0, true);
      donor = await login('donor');
      expectStatus(await api('POST', '/auth/register', { body: {
        nombreCompleto: 'Duplicado QA', email: email('donor'), password, rolId: 2
      } }), 409);
      expectStatus(await api('POST', '/auth/register', { body: {
        nombreCompleto: 'Administrador QA', email: email('admin-forbidden'), password, rolId: 1
      } }), 400);
      otherDonor = await loginAfterRegistration('other-donor', 2);
      technician = await loginAfterRegistration('technician', 3);
      otherTechnician = await loginAfterRegistration('other-technician', 3);
      const profile = expectStatus(await api<{ id: number; email: string }>('GET', '/auth/perfil', { token: donor.token }), 200);
      assert.equal(profile.id, donor.id);
      assert.equal(profile.email, email('donor'));
    });

    await t.test('Unicode passwords accept exactly 72 bytes and reject longer registration/login input', async () => {
      const exact = 'á'.repeat(36);
      assert.equal(Buffer.byteLength(exact, 'utf8'), 72);
      await register('unicode', 2, exact);
      assert.ok((await login('unicode', exact)).token);
      expectStatus(await api('POST', '/auth/register', { body: {
        nombreCompleto: 'Unicode QA', email: email('unicode-too-long'), password: exact + 'a', rolId: 2
      } }), 400);
      expectStatus(await api('POST', '/auth/login', { body: { email: email('unicode'), password: exact + 'a' } }), 400);
      expectStatus(await api('POST', '/auth/login', { body: { email: email('donor'), password: 'wrong-password' } }), 401);
    });

    await t.test('CORS accepts a configured origin, rejects another origin, and malformed JSON is a client error', async () => {
      const acceptedOrigin = allowedOrigins()[0];
      const accepted = await api('OPTIONS', '/dispositivos', { headers: {
        Origin: acceptedOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization'
      } });
      assert.equal(accepted.status, 204);
      assert.equal(accepted.headers.get('access-control-allow-origin'), acceptedOrigin);
      expectStatus(await api('GET', '/health', { headers: { Origin: 'http://blocked-origin.invalid' } }), 403);
      expectStatus(await api('POST', '/auth/register', { rawBody: '{"email":' }), 400);
      expectStatus(await api('GET', '/dispositivos?estado[]=DISPONIBLE'), 400);
      expectStatus(await api('GET', '/dispositivos?categoriaId[]=1'), 400);
      expectStatus(await api('GET', '/dispositivos?busqueda[]=QA'), 400);
    });

    await t.test('admin creates an isolated category/centres while role restrictions remain enforced', async () => {
      const payload = { codigo: `RAEE-IT-${tag.toUpperCase()}`, nombre: `Categoría QA ${tag}`, descripcion: 'Datos sintéticos', factorCo2Kg: 35.5 };
      expectStatus(await api('POST', '/categorias', { token: donor.token, body: payload }), 403);
      category = expectStatus(await api<Category>('POST', '/categorias', { token: admin.token, body: payload }), 201);
      const createCentre = async (name: string): Promise<Centre> => expectStatus(await api<Centre>('POST', '/centros', {
        token: admin.token, body: { nombre: `Centro QA ${tag} ${name}`, direccion: 'Dirección sintética QA', ciudad: 'Guatemala',
          telefono: null, capacidadKg: 100, categoriasIds: [category.id] }
      }), 201);
      origin = await createCentre('origen');
      destination = await createCentre('destino');
      inactive = await createCentre('inactivo');
      expectStatus(await api('PATCH', `/centros/${inactive.id}/desactivar`, { token: admin.token }), 200);
      baseline = await metrics();
    });

    await t.test('device creation, owner editing, non-owner denial and deletion work end to end', async () => {
      expectStatus(await api('POST', '/dispositivos', { body: deviceBody(1, `Sin sesión QA ${tag}`) }), 401);
      expectStatus(await api('POST', '/dispositivos', { token: technician.token, body: deviceBody(1, `Técnico QA ${tag}`) }), 403);
      const temp = expectStatus(await api<Device>('POST', '/dispositivos', { token: donor.token,
        body: { ...(deviceBody(1, 'T'.repeat(150)) as object), marca: 'M'.repeat(100) } }), 201);
      assert.equal(temp.donanteId, donor.id);
      assert.equal(temp.titulo.length, 150);
      assert.equal(temp.marca!.length, 100);
      const stored = expectStatus(await api<Device>('GET', `/dispositivos/${temp.id}`), 200);
      assert.deepEqual(stored.especificaciones, { prueba: tag, puertos: ['USB', 'HDMI'], memoria: { gb: 16 } });
      assert.match(stored.createdAt, /Z$/);
      assert.ok(Number.isFinite(Date.parse(stored.createdAt)));
      assert.match(stored.updatedAt!, /Z$/);
      const update = { ...(deviceBody(1.1, `Temporal actualizado QA ${tag}`) as object), marca: '  ' };
      expectStatus(await api('PUT', `/dispositivos/${temp.id}`, { token: otherDonor.token, body: update }), 403);
      expectStatus(await api('DELETE', `/dispositivos/${temp.id}`, { token: otherDonor.token }), 403);
      const changed = expectStatus(await api<Device>('PUT', `/dispositivos/${temp.id}`, { token: donor.token, body: update }), 200);
      assert.equal(changed.pesoKg, 1.1);
      assert.equal(changed.marca, null);
      assert.equal(changed.titulo, `Temporal actualizado QA ${tag}`);
      expectStatus(await api('DELETE', `/dispositivos/${temp.id}`, { token: donor.token }), 200);
      expectStatus(await api('GET', `/dispositivos/${temp.id}`), 404);
    });

    await t.test('sub-decimal weights and inactive centres cannot create hardware', async () => {
      expectStatus(await api('POST', '/dispositivos', { token: donor.token, body: deviceBody(1e-9, `Peso inválido QA ${tag}`) }), 400);
      expectStatus(await api('POST', '/dispositivos', { token: donor.token,
        body: { ...(deviceBody(1, `Centro inactivo QA ${tag}`) as object), centroAcopioId: inactive.id } }), 409);
      device = expectStatus(await api<Device>('POST', '/dispositivos', { token: donor.token, body: deviceBody(1.25, `Transferencia QA ${tag}`) }), 201);
      assert.equal(device.co2EvitadoKg, 44.38);
      expectStatus(await api('PUT', `/dispositivos/${device.id}`, { token: donor.token, body: deviceBody(1e-9, device.titulo) }), 400);
      expectStatus(await api('POST', '/transferencias', { token: technician.token, body: {
        dispositivoId: device.id, centroDestinoId: inactive.id, motivo: 'Destino inactivo QA'
      } }), 409);
      assert.equal(expectStatus(await api<Device>('GET', `/dispositivos/${device.id}`), 200).estadoDisponibilidad, 'DISPONIBLE');
    });

    await t.test('concurrent technician reservations produce one order and one conflict', async () => {
      const accounts = [technician, otherTechnician];
      const results = await Promise.all(accounts.map(account => api<Order>('POST', '/transferencias', { token: account.token,
        body: { dispositivoId: device.id, centroDestinoId: destination.id, motivo: `Reserva simultánea QA ${tag}` } })));
      assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
      const winner = results.findIndex(result => result.status === 201);
      order = expectStatus(results[winner], 201);
      responsible = accounts[winner]; unrelated = accounts[1 - winner];
      assert.equal(order.tecnicoId, responsible.id);
      const [rows] = await db!.query<(RowDataPacket & { count: number })[]>(
        'SELECT COUNT(*) AS count FROM ordenes_transferencia WHERE dispositivo_id = ?', [device.id]);
      assert.equal(rows[0].count, 1);
      assert.equal(expectStatus(await api<Device>('GET', `/dispositivos/${device.id}`), 200).estadoDisponibilidad, 'RESERVADO');
    });

    await t.test('active transfers keep their origin/destination active and their required categories', async () => {
      for (const centre of [origin, destination]) {
        expectStatus(await api('PATCH', `/centros/${centre.id}/desactivar`, { token: admin.token }), 409);
        expectStatus(await api('PUT', `/centros/${centre.id}`, { token: admin.token, body: centreBody(centre, []) }), 409);
        const unchanged = expectStatus(await api<Centre>('GET', `/centros/${centre.id}`), 200);
        assert.equal(unchanged.activo, true);
        assert.deepEqual(unchanged.categoriasIds, [category.id]);
      }
      expectStatus(await api('DELETE', `/dispositivos/${device.id}`, { token: donor.token }), 409);
      expectStatus(await api('PATCH', `/dispositivos/${device.id}/estado`, { token: admin.token, body: { estadoDisponibilidad: 'RECICLADO' } }), 409);
    });

    await t.test('another technician cannot confirm delivery and concurrent confirmations complete once', async () => {
      expectStatus(await api('PATCH', `/transferencias/${order.id}/completar`, { token: unrelated.token }), 403);
      const results = await Promise.all([1, 2].map(() => api('PATCH', `/transferencias/${order.id}/completar`, { token: responsible.token })));
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      const [rows] = await db!.query<(RowDataPacket & { estado: string; disponible: string; centro: number; completado: Date | null })[]>(
        `SELECT o.estado, o.fecha_completado AS completado, d.estado_disponibilidad AS disponible, d.centro_acopio_id AS centro
         FROM ordenes_transferencia o JOIN dispositivos d ON d.id = o.dispositivo_id WHERE o.id = ?`, [order.id]);
      assert.equal(rows[0].estado, 'COMPLETADA');
      assert.equal(rows[0].disponible, 'ENTREGADO');
      assert.equal(rows[0].centro, destination.id);
      assert.ok(rows[0].completado);
      const after = await metrics();
      assert.equal(delta(after.totalKgRecuperados, baseline.totalKgRecuperados), 1.25);
      assert.equal(delta(after.co2EvitadoKg, baseline.co2EvitadoKg), 44.38);
      assert.equal(after.transferenciasPorEstado['COMPLETADA'] - baseline.transferenciasPorEstado['COMPLETADA'], 1);
    });

    await t.test('two recovered 0.01 kg devices preserve the sum of their individual CO2 rounding', async () => {
      beforeTwins = await metrics();
      for (const index of [1, 2]) {
        const twin = expectStatus(await api<Device>('POST', '/dispositivos', { token: donor.token,
          body: deviceBody(0.01, `Redondeo QA ${tag} ${index}`) }), 201);
        assert.equal(twin.co2EvitadoKg, 0.36);
        twins.push(twin);
        expectStatus(await api('PATCH', `/dispositivos/${twin.id}/estado`, { token: admin.token,
          body: { estadoDisponibilidad: 'RECICLADO' } }), 200);
      }
      const [rows] = await db!.query<(RowDataPacket & { co2: string | number })[]>(
        'SELECT co2_evitado_kg AS co2 FROM dispositivos WHERE id IN (?, ?) ORDER BY id', twins.map(twin => twin.id));
      assert.deepEqual(rows.map(row => Number(row.co2)), [0.36, 0.36]);
      const after = await metrics();
      assert.equal(delta(after.totalKgRecuperados, beforeTwins.totalKgRecuperados), 0.02);
      assert.equal(delta(after.co2EvitadoKg, beforeTwins.co2EvitadoKg), 0.72);
    });

    await t.test('changing the category factor updates devices, SQL values and dashboard totals together', async () => {
      const changed = expectStatus(await api<Category>('PUT', `/categorias/${category.id}`, { token: admin.token,
        body: { codigo: category.codigo, nombre: category.nombre, descripcion: category.descripcion, factorCo2Kg: 40 } }), 200);
      assert.equal(changed.factorCo2Kg, 40);
      const [rows] = await db!.query<(RowDataPacket & { id: number; co2: string | number })[]>(
        'SELECT id, co2_evitado_kg AS co2 FROM dispositivos WHERE categoria_id = ? ORDER BY id', [category.id]);
      assert.deepEqual(rows.map(row => [row.id, Number(row.co2)]), [[device.id, 50], ...twins.map(twin => [twin.id, 0.4])]);
      assert.equal(expectStatus(await api<Device>('GET', `/dispositivos/${device.id}`), 200).co2EvitadoKg, 50);
      const after = await metrics();
      assert.equal(delta(after.totalKgRecuperados, baseline.totalKgRecuperados), 1.27);
      assert.equal(delta(after.co2EvitadoKg, baseline.co2EvitadoKg), 50.8);
    });

    await t.test('centres can deactivate after completion and referenced categories cannot be deleted', async () => {
      for (const centre of [origin, destination]) {
        const disabled = expectStatus(await api<Centre>('PATCH', `/centros/${centre.id}/desactivar`, { token: admin.token }), 200);
        assert.equal(disabled.activo, false);
        assert.deepEqual(disabled.categoriasIds, [category.id]);
      }
      expectStatus(await api('DELETE', `/categorias/${category.id}`, { token: admin.token }), 409);
      expectStatus(await api('DELETE', `/dispositivos/${device.id}`, { token: admin.token }), 409);
    });

    await t.test('a SQL-controlled publication deadlock is a retryable conflict instead of a server error', { timeout: 20000 }, async () => {
      const deadlockCategory = expectStatus(await api<Category>('POST', '/categorias', { token: admin.token,
        body: { codigo: `RAEE-DL-${tag.toUpperCase()}`, nombre: `Concurrencia QA ${tag}`, descripcion: null, factorCo2Kg: 35.5 } }), 201);
      const centre = expectStatus(await api<Centre>('POST', '/centros', { token: admin.token,
        body: { nombre: `Concurrencia QA ${tag}`, direccion: 'Datos sintéticos', ciudad: 'Guatemala', telefono: null,
          capacidadKg: 100, categoriasIds: [deadlockCategory.id] } }), 201);
      const fixture = { titulo: `Bloqueo QA ${tag}`, categoriaId: deadlockCategory.id, centroAcopioId: centre.id,
        estadoFuncional: 'REPARABLE', pesoKg: 0.01 };
      const guard = expectStatus(await api<Device>('POST', '/dispositivos', { token: donor.token, body: fixture }), 201);
      const settings = { host: requiredEnv('DB_HOST'), port: Number(process.env.DB_PORT ?? '3306'),
        user: requiredEnv('DB_USER'), password: requiredEnv('DB_PASSWORD'), database };
      const blocker = await createConnection(settings);
      let probe: Connection | undefined;
      let pending: Promise<ApiResult<Device>> | undefined;
      let transactionVictim = false;
      try {
        await blocker.beginTransaction();
        await blocker.execute('SELECT centro_id FROM centros_categorias WHERE centro_id = ? AND categoria_id = ? FOR UPDATE',
          [centre.id, deadlockCategory.id]);
        // Give this transaction more undo work so InnoDB normally selects the API transaction as its victim.
        // All changes use this test's own fixture and are rolled back below.
        for (let index = 0; index < 30; index++) {
          await blocker.execute('UPDATE dispositivos SET notas = ? WHERE id = ?', [`Trabajo revertible QA ${index}`, guard.id]);
        }
        pending = api<Device>('POST', '/dispositivos', { token: donor.token, body: { ...fixture, titulo: `Publicación concurrente QA ${tag}` } });
        probe = await createConnection(settings);
        let locked = false;
        for (let attempt = 0; attempt < 200; attempt++) {
          try { await probe.execute('SELECT id FROM categorias_raee WHERE id = ? FOR UPDATE NOWAIT', [deadlockCategory.id]); }
          catch (error: unknown) {
            const sql = error as { code?: string; errno?: number };
            if (sql.code === 'ER_LOCK_NOWAIT' || sql.errno === 3572) { locked = true; break; }
            throw error;
          }
          await new Promise<void>(resolve => setTimeout(resolve, 25));
        }
        assert.ok(locked, 'The publication must hold the category before the controlled deadlock is triggered');
        try { await blocker.execute('SELECT id FROM categorias_raee WHERE id = ? FOR UPDATE', [deadlockCategory.id]); }
        catch (error: unknown) {
          assert.equal((error as { code?: string }).code, 'ER_LOCK_DEADLOCK');
          transactionVictim = true;
        }
        await blocker.rollback();
        const result = await pending;
        // Victim choice belongs to InnoDB. Both outcomes are safe, while an HTTP 500 is always a regression.
        assert.equal(result.status, transactionVictim ? 201 : 409);
        if (result.status === 409) assert.equal(result.body.error, 'Conflicto concurrente. Intenta nuevamente.');
        const [rows] = await db!.query<(RowDataPacket & { count: number })[]>(
          'SELECT COUNT(*) AS count FROM dispositivos WHERE categoria_id = ?', [deadlockCategory.id]);
        assert.equal(rows[0].count, transactionVictim ? 2 : 1);
        const [guardRows] = await db!.query<(RowDataPacket & { notas: string | null })[]>(
          'SELECT notas FROM dispositivos WHERE id = ?', [guard.id]);
        assert.equal(guardRows[0].notas, null);
        if (result.status === 409) {
          expectStatus(await api('POST', '/dispositivos', { token: donor.token, body: { ...fixture, titulo: `Reintento QA ${tag}` } }), 201);
        }
      } finally {
        await blocker.rollback();
        await probe?.end();
        await blocker.end();
        // Drain the request even if a preceding assertion fails, after releasing its SQL blocker.
        await pending?.catch(() => {});
      }
    });
  } finally {
    await db?.end();
  }

  async function loginAfterRegistration(name: string, rolId: number): Promise<Account> {
    const id = await register(name, rolId);
    const account = await login(name);
    assert.equal(account.id, id);
    return account;
  }
});
