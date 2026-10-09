# EcoPlaca

EcoPlaca es una plataforma web de gestión circular y trazabilidad de residuos de aparatos eléctricos y electrónicos (RAEE o *e-waste*). Conecta a donantes, técnicos y centros de acopio para publicar hardware, reservarlo, confirmar su entrega física y consultar su impacto ambiental estimado.

El proyecto atiende el desperdicio de componentes reutilizables y la necesidad de gestionar los residuos electrónicos de manera trazable. Se vincula con:

- [ODS 11: Ciudades y comunidades sostenibles](https://sdgs.un.org/goals/goal11), mediante la gestión de residuos y la reducción del impacto ambiental urbano.
- [ODS 12: Producción y consumo responsables](https://sdgs.un.org/goals/goal12), mediante la reutilización, recuperación de materiales y reducción de residuos.

El proceso principal es:

```text
Publicación del donante → DISPONIBLE
Reserva del técnico    → RESERVADO + orden PENDIENTE
Recepción física       → ENTREGADO + orden COMPLETADA
Consulta del dashboard → kg recuperados y CO₂ equivalente evitado
```

## Arquitectura y stack tecnológico

| Capa | Tecnologías y responsabilidades |
| --- | --- |
| Frontend | Angular 19.2, TypeScript, componentes Standalone, Signals, RxJS, Reactive Forms, servicios HTTP, interceptores JWT/errores y guards funcionales. |
| Backend | Node.js, Express 4, TypeScript, mysql2, BCrypt y JWT. Controladores, middleware de autenticación/roles y transacciones MySQL. |
| Base de datos | MySQL, motor InnoDB y diseño relacional en 3FN con siete tablas. |
| Pruebas | Node Test Runner con ts-node en backend; Jasmine, Karma y ChromeHeadless en Angular. |

Las tablas son `roles`, `usuarios`, `categorias_raee`, `centros_acopio`, `centros_categorias`, `dispositivos` y `ordenes_transferencia`. La tabla `centros_categorias` resuelve la relación M:N entre centros y categorías.

Las reservas y entregas usan transacciones y bloqueos `SELECT ... FOR UPDATE`. La autorización se verifica en el servidor; los guards del frontend controlan la navegación.

El dashboard consulta MySQL al abrirse, cada 30 segundos y después de eventos de transferencia realizados mediante el servicio de la aplicación. No utiliza WebSockets ni SSE. El CO₂ mostrado es una estimación basada en el peso y el factor de cada categoría.

## Estructura del monorrepositorio

```text
EcoPlaca/
├── backend/
│   ├── src/
│   │   ├── config/          # Entorno y pool MySQL
│   │   ├── controllers/     # Endpoints y reglas de negocio
│   │   ├── middleware/      # JWT, roles y errores
│   │   ├── models/          # Interfaces TypeScript
│   │   ├── routes/          # Enrutadores por módulo
│   │   ├── scripts/         # Migración y seed compilables
│   │   ├── utils/           # Validación, respuestas y cálculo de CO₂
│   │   ├── app.ts
│   │   └── server.ts
│   ├── tests/              # Pruebas del backend
│   ├── .env.example
│   └── api.http            # Peticiones manuales y recorrido completo
├── frontend/
│   ├── src/app/
│   │   ├── components/     # Autenticación, catálogo, publicación y paneles
│   │   ├── config/         # API_URL
│   │   ├── guards/
│   │   ├── interceptors/
│   │   ├── models/
│   │   └── services/
│   └── proxy.conf.json     # Proxy de desarrollo hacia /api
├── DB/
│   ├── migrations/         # Esquema y actualización de estados
│   └── ecoplaca_DB.sql     # Inicialización histórica de desarrollo
├── package.json            # Workspaces backend/frontend
└── README.md
```

`backend/` contiene la API y sus scripts; `frontend/`, la aplicación Angular; `DB/`, los recursos de esquema y migración. Los documentos `ENTREGA_TAREA_*.md` incluyen el código y las validaciones registradas de cada entrega.

## Requisitos previos

| Herramienta | Versión o requisito |
| --- | --- |
| Node.js | 22.x; versión utilizada en la validación: 22.14.0. |
| npm | 10.x; versión utilizada: 10.9.2. |
| MySQL | 8.0.x, con una base creada y permisos para las migraciones. |
| Git | Para clonar el repositorio. |
| Google Chrome | Para ejecutar las pruebas Angular con ChromeHeadless. |

Se utiliza npm con workspaces y `package-lock.json`; pnpm no es necesario para los comandos documentados. TypeScript y Angular CLI se instalan como dependencias del proyecto.

Node.js 22.x es compatible con Angular 19.2 según la [tabla oficial de compatibilidad](https://angular.dev/reference/versions).

## Puesta en marcha en desarrollo

### 1. Clonar el repositorio

```sh
git clone https://github.com/Pablo-Rf8/EcoPlaca.git
cd EcoPlaca
```

### 2. Crear la base MySQL

Desde una sesión administrativa de MySQL, para una instalación local nueva:

```sql
CREATE DATABASE IF NOT EXISTS ecoplaca_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'ecoplaca_user'@'localhost'
  IDENTIFIED BY 'CAMBIA_LA_PASSWORD_LOCAL';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON ecoplaca_db.* TO 'ecoplaca_user'@'localhost';
```

Sustituye la contraseña y adapta el usuario/host a tu instalación. Si el usuario ya existe, `CREATE USER IF NOT EXISTS` conserva su contraseña actual.

Las migraciones crean las tablas dentro de la base configurada; no crean la base ni usuarios de MySQL.

### 3. Configurar el entorno

Copiar la plantilla, sin reemplazar un `.env` existente.

PowerShell:

```powershell
Copy-Item backend/.env.example backend/.env
```

Linux/macOS:

```sh
cp backend/.env.example backend/.env
```

Editar `backend/.env`:

```dotenv
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_USER=ecoplaca_user
DB_PASSWORD=CAMBIA_LA_PASSWORD_LOCAL
DB_NAME=ecoplaca_db
JWT_SECRET=PEGA_AQUI_UNA_CLAVE_ALEATORIA
CORS_ORIGINS=http://localhost:4200

SEED_ADMIN_EMAIL=admin.demo@example.com
SEED_ADMIN_PASSWORD=EcoPlacaDemo2026!
SEED_ADMIN_NOMBRE=Administrador Demo

SEED_CENTRO_NOMBRE=Centro Demo
SEED_CENTRO_DIRECCION=Zona 1
SEED_CENTRO_CIUDAD=Guatemala
```

Este ejemplo usa el puerto MySQL habitual `3306`; si tu instancia está publicada en `3308`, ajusta `DB_PORT`. Las credenciales deben coincidir con la instalación real.

Para generar una clave JWT:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Copiar el resultado en `JWT_SECRET`. `JWT_EXPIRES_IN` configura la duración del token: acepta segundos enteros positivos (por ejemplo, `900`) o un entero positivo con unidad `s`, `m`, `h`, `d` o `w` (por ejemplo, `15m`). Si se omite, usa `7d`. Los valores vacíos, ambiguos o fuera del rango de enteros seguros impiden arrancar el backend.

Las variables `SEED_ADMIN_*` crean un ADMIN opcional. Las tres variables `SEED_CENTRO_*` crean un centro inicial opcional, asociado a las categorías del seed. Para omitirlo, deja las tres vacías. El archivo `.env` está excluido de Git.

### 4. Instalar dependencias

Desde la raíz:

```sh
npm ci
```

La instalación utiliza los workspaces del monorrepositorio. Si modificas dependencias intencionalmente, usa `npm install` para actualizar el lockfile.

### 5. Compilar, migrar y ejecutar el seed

```sh
cd backend
npm run build
npm run db:migrate
npm run db:seed
```

El build es necesario porque las migraciones y el seed ejecutan archivos de `dist/scripts/`.

- `db:migrate` crea las siete tablas si faltan y añade los estados `ENTREGADO` y `COMPLETADA` cuando todavía no existen.
- `db:seed` crea los roles y categorías faltantes, y el ADMIN/centro opcionales.
- Ambos scripts pueden repetirse y comparten un bloqueo para evitar preparaciones simultáneas.
- El seed conserva contraseñas, usuarios y datos existentes.

No utilizar `DB/ecoplaca_DB.sql` sobre una base que deba conservarse: contiene `DROP DATABASE`. Los scripts actuales usan `DB/migrations/`.

### 6. Arrancar el backend

En una terminal ubicada en `backend/`:

```sh
npm run dev
```

API: `http://localhost:3000/api`.

Comprobación de salud: `GET http://localhost:3000/api/health`.

### 7. Arrancar el frontend

En otra terminal, desde la raíz:

```sh
cd frontend
npm start
```

Aplicación: `http://localhost:4200`.

`proxy.conf.json` dirige `/api` a `http://localhost:3000`. Si cambias el puerto del backend, actualiza también el proxy.

Rutas principales: `/catalogo`, `/login`, `/register`, `/nuevo-dispositivo`, `/transferencias` y `/dashboard`.

## Ejecución de pruebas automatizadas

Última validación registrada (9 de octubre de 2026): **72 pruebas unitarias aprobadas**, distribuidas en 36 de backend y 36 de Angular. También pasaron **14 casos de integración con MySQL real** (15 pruebas contando el grupo del runner).

Desde la raíz, ejecutar ambas suites unitarias:

```sh
npm test
```

### Backend: 36 pruebas

Desde la raíz:

```sh
npm run test:backend
```

Verifican publicación, propiedad del dispositivo, aislamiento de órdenes por técnico, CRUD, conflictos, relaciones, CORS, repetición de migración/seed, precisión decimal, CO₂, duración JWT y errores concurrentes. El runner configura variables de prueba y usa MySQL simulado; esta suite no requiere una base ni un `.env` local. La integración se omite en esta ejecución.

### Angular: 36 pruebas

Desde la raíz:

```sh
npm run test:frontend
```

El runner usa ChromeHeadless. En Windows detecta Chrome o Edge instalado; en otros sistemas se puede configurar `CHROME_BIN`. Para especificar un ejecutable en PowerShell:

```powershell
$env:CHROME_BIN = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
npm run test:frontend
```

Verifican sesión, guards, alcance del JWT, filtros, reservas, métricas, publicación, recepción física, navegación por teclado, cambios de sesión entre pestañas y límites de contraseña en bytes UTF-8. La última validación utilizó Edge en modo headless.

Las suites unitarias usan HTTP/MySQL simulados. El recorrido manual está en `backend/api.http`.

### Integración con MySQL real

Iniciar la API con un `.env` que apunte a una base exclusiva para pruebas: `DB_NAME=ecoplaca_qa` o un nombre terminado en `_test`, y `DB_HOST` local. Preparar esa base mediante migración/seed y configurar `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` para una cuenta ADMIN de prueba. `API_URL` permite indicar el origen de la API; su valor predeterminado es `http://127.0.0.1:3000` y solo admite localhost.

Desde la raíz, con la API ya iniciada:

```sh
npm run test:integration
```

Esta suite comprueba registro, login, permisos, CRUD, centros, reservas y recepciones simultáneas, CO₂, fechas y un deadlock controlado con rollback. Crea datos sintéticos únicos y los conserva para inspección; no reinicializa la base ni elimina registros anteriores. La validación registrada usó MySQL 8.0.34 local, además de un recorrido real en navegador de publicación, reserva, entrega y consulta de métricas.

La compilación de producción también se revisó en Edge a 320, 768 y 1440 px: 33 escenarios de pantallas, menús, diálogos y validación de formularios, sin desbordamientos ni errores de JavaScript. Esta revisión utiliza datos simulados en el navegador.

### Comprobar compilación

Desde la raíz:

```sh
npm run build
```

Compila backend y frontend. Los resultados se generan en `backend/dist/` y `frontend/dist/frontend/browser/`.

Las optimizaciones de JavaScript y CSS permanecen activas. La compilación no descarga Google Fonts: la fuente se carga desde el navegador y conserva las fuentes alternativas del CSS cuando no está disponible.

## Catálogo de endpoints de la API

Prefijo común: `/api`. Las peticiones protegidas requieren `Authorization: Bearer <token>`.

### Auth

| Método | Ruta | Acceso | Función |
| --- | --- | --- | --- |
| POST | /auth/register | Público | Registrar DONOR o TECHNICIAN; rolId 2 o 3. |
| POST | /auth/login | Público | Autenticar y obtener JWT/usuario con rol. |
| GET | /auth/perfil | Autenticado | Consultar el perfil activo. |

El registro público no permite ADMIN. El registro devuelve la cuenta creada; para obtener JWT se realiza login.

### Dispositivos

| Método | Ruta | Acceso | Función |
| --- | --- | --- | --- |
| GET | /dispositivos | Público | Listar y filtrar hardware. |
| GET | /dispositivos/:id | Público | Consultar detalle. |
| GET | /dispositivos/opciones-publicacion | DONOR, ADMIN | Categorías y centros activos compatibles. |
| POST | /dispositivos | DONOR, ADMIN | Publicar usando al usuario autenticado como donante. |
| PUT | /dispositivos/:id | DONOR propietario, ADMIN | Editar hardware disponible sin historial de transferencias. |
| DELETE | /dispositivos/:id | DONOR propietario, ADMIN | Retirar hardware disponible sin historial. |
| PATCH | /dispositivos/:id/estado | ADMIN | Actualizar estado funcional/disponibilidad y notas. |

Filtros de listado: `busqueda`, `estado`, `estadoFuncional` y `categoriaId`.

Estados funcionales: `OPERATIVO`, `REPARABLE` y `DESGUACE_RECICLAJE`. El frontend muestra “Repuestos” y “Chatarra” para los dos últimos.

### Transferencias

| Método | Ruta | Acceso | Función |
| --- | --- | --- | --- |
| POST | /transferencias | TECHNICIAN | Reservar un dispositivo disponible y crear la orden. |
| GET | /transferencias/mis-ordenes | TECHNICIAN, ADMIN | Órdenes propias del técnico o todas para ADMIN. |
| PATCH | /transferencias/:id/completar | Técnico responsable, ADMIN | Confirmar recepción: COMPLETADA y ENTREGADO. |

La repetición de una entrega o una reserva incompatible devuelve conflicto `409`.

### Dashboard

| Método | Ruta | Acceso | Función |
| --- | --- | --- | --- |
| GET | /dashboard/metricas | ADMIN, DONOR, TECHNICIAN | Kg recuperados, CO₂ evitado y transferencias por estado. |

Los kg recuperados corresponden a dispositivos `ENTREGADO` o `RECICLADO`. Las transferencias activas son `PENDIENTE` y `EN_TRANSITO`; las completadas usan `COMPLETADA`.

### Categorías

| Método | Ruta | Acceso | Función |
| --- | --- | --- | --- |
| GET | /categorias | Público | Listar categorías. |
| GET | /categorias/:id | Público | Consultar una categoría. |
| POST | /categorias | ADMIN | Crear categoría y factor de CO₂. |
| PUT | /categorias/:id | ADMIN | Actualizar categoría y recalcular CO₂ relacionado. |
| DELETE | /categorias/:id | ADMIN | Eliminar si no hay dispositivos ni centros vinculados. |

Campos: `codigo`, `nombre`, `descripcion` opcional y `factorCo2Kg`. Los códigos comienzan por `RAEE-`.

### Centros

| Método | Ruta | Acceso | Función |
| --- | --- | --- | --- |
| GET | /centros | Público | Listar centros con sus categorías y estado activo. |
| GET | /centros/:id | Público | Consultar un centro. |
| POST | /centros | ADMIN | Crear centro y relaciones M:N. |
| PUT | /centros/:id | ADMIN | Actualizar datos y categorías admitidas. |
| PATCH | /centros/:id/desactivar | ADMIN | Cambiar activo a false conservando el historial. |

Campos: `nombre`, `direccion`, `ciudad`, `telefono` opcional, `capacidadKg` y `categoriasIds`. No se permite retirar categorías de hardware disponible o reservado ubicado en el centro, ni categorías necesarias para transferencias activas hacia él. Desactivar un centro con transferencias activas de origen o destino devuelve conflicto `409`.

La salud de la API se consulta mediante `GET /api/health`, sin autenticación. Las peticiones completas y los casos de error están en `backend/api.http`.

## Credenciales de demostración

El seed TypeScript crea un ADMIN únicamente si se configuran sus variables. **No crea automáticamente cuentas DONOR ni TECHNICIAN**: deben registrarse desde `/register` o `POST /api/auth/register`.

La siguiente tabla corresponde a la preparación de demostración descrita en este README, no a cuentas garantizadas en una base existente:

| Rol | Correo | Contraseña de demostración | Cómo crear la cuenta |
| --- | --- | --- | --- |
| ADMIN | admin.demo@example.com | EcoPlacaDemo2026! | Configurar SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD y ejecutar db:seed. |
| DONOR | donante.demo@example.com | EcoPlacaDemo2026! | Registro con rolId 2. |
| TECHNICIAN | tecnico.demo@example.com | EcoPlacaDemo2026! | Registro con rolId 3. |

Para registrar el donante:

```json
{
  "nombreCompleto": "Donante Demo",
  "email": "donante.demo@example.com",
  "password": "EcoPlacaDemo2026!",
  "rolId": 2
}
```

Para registrar el técnico:

```json
{
  "nombreCompleto": "Técnico Demo",
  "email": "tecnico.demo@example.com",
  "password": "EcoPlacaDemo2026!",
  "rolId": 3
}
```

Enviar cada cuerpo a `POST /api/auth/register`. El login se realiza con `email` y `password` en `POST /api/auth/login`.

Estas contraseñas son exclusivamente ejemplos locales. El seed no restablece la contraseña de un ADMIN existente y no hay una contraseña universal de acceso. Ajustar los ejemplos antiguos de login de `backend/api.http` a las cuentas creadas.

Para demostrar el ciclo completo:

1. Entrar como DONOR y publicar hardware con categoría, centro compatible y peso positivo.
2. Entrar como TECHNICIAN, buscar ese dispositivo y solicitarlo indicando el motivo.
3. Verificar que pasa a RESERVADO y aparece en Mis transferencias.
4. Después de recibir físicamente el hardware, confirmar su recepción.
5. Verificar COMPLETADA/ENTREGADO y consultar el aumento de kg y CO₂ en Dashboard.

## Guía de despliegue en producción

### 1. Preparar MySQL y variables de entorno

Crear la base indicada por `DB_NAME`. Configurar las variables mediante el proveedor o un `.env` privado:

```dotenv
NODE_ENV=production
PORT=3000
DB_HOST=HOST_MYSQL
DB_PORT=3306
DB_USER=USUARIO_MYSQL
DB_PASSWORD=PASSWORD_PRIVADA
DB_NAME=ecoplaca_db
JWT_SECRET=CLAVE_ALEATORIA_DE_AL_MENOS_32_CARACTERES
CORS_ORIGINS=https://ecoplaca.example.com
```

Sustituir todos los valores de ejemplo. `CORS_ORIGINS` requiere orígenes HTTPS exactos, sin rutas ni barra final; para varios, separarlos con comas.

Configurar `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD` si se necesita crear el primer ADMIN. Usar una contraseña privada de al menos 12 caracteres y hasta 72 bytes UTF-8. El centro inicial es opcional y debe tener datos reales.

El usuario de migración necesita permisos de creación/alteración y escritura; una ejecución normal de la API necesita permisos de lectura/escritura sobre sus tablas. `npm run deploy` utiliza las credenciales disponibles para preparar la base.

### 2. Instalar y compilar

Desde la raíz, durante la etapa de construcción con dependencias de desarrollo disponibles:

```sh
npm ci
npm run build
```

En el artefacto de backend, conservar `backend/dist/`, el paquete y sus dependencias de producción, además de `DB/migrations/` con la misma posición relativa del monorrepositorio.

### 3. Arrancar el backend

Desde `backend/`:

```sh
npm run deploy
```

Este comando ejecuta migración, seed y arranque en ese orden. Si la preparación falla, no arranca la API. Los scripts usan JavaScript compilado desde TypeScript y no requieren ts-node en producción.

Cuando migración y seed se ejecutan como una etapa separada de publicación:

```sh
npm run db:prepare
npm start
```

Las migraciones conservan los datos y omiten los cambios de estado ya aplicados. El seed conserva usuarios y contraseñas existentes. No ejecutar el SQL histórico con `DROP DATABASE` en producción.

### 4. Publicar Angular y conectar la API

Servir `frontend/dist/frontend/browser/` mediante un servidor estático con HTTPS.

Configurar:

- Reescritura de rutas Angular a `index.html` para rutas como `/catalogo`, `/dashboard` o `/transferencias`.
- Reverse proxy de `/api` hacia el backend, conservando el prefijo `/api`.
- Enrutamiento de las peticiones `/api` al backend antes de aplicar el fallback de Angular.

El frontend usa `API_URL = '/api'`. Para alojar la API en otro origen, proporcionar `API_URL` en `frontend/src/app/app.config.ts`, recompilar Angular y permitir el origen del frontend en `CORS_ORIGINS`.

`proxy.conf.json` se utiliza solo por el servidor de desarrollo; no configura el reverse proxy de producción.

### 5. Comprobar la instalación

Consultar `/api/health`, iniciar sesión, publicar hardware nuevo, reservarlo, confirmar su entrega y verificar el dashboard. Ejecutar las pruebas en la etapa de integración antes de publicar.

La verificación registrada incluye builds, pruebas unitarias, integración contra una instancia MySQL local aislada y un recorrido real en navegador. El despliegue debe verificarse en el entorno de destino.
