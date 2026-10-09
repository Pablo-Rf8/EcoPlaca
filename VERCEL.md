# EcoPlaca: despliegue del frontend en Vercel

Esta configuración publica Angular para una prueba visual. La API Express y MySQL requieren su propia instalación y no se arrancan con este build.

## Causa del error

Vercel buscaba /vercel/path0/dist. El builder Angular genera el sitio en frontend/dist/frontend/browser. Los mensajes npm warn deprecated e install-scripts son advertencias; el fallo del log es ENOENT / No Output Directory.

## Ajustes en Vercel

Usa estos valores en Settings → Build and Deployment:

| Ajuste | Valor |
| --- | --- |
| Root Directory | Raíz del repositorio, sin seleccionar frontend ni backend |
| Framework Preset | Other |
| Install Command | npm ci |
| Build Command | npm run build:frontend |
| Output Directory | frontend/dist/frontend/browser |
| Node.js Version | 22.x |

vercel.json fija el build, la instalación, la salida y el fallback de Angular. package.json fija Node 22.x, compatible con Angular 19.2. No uses npm run deploy de backend como Build Command de este proyecto Vercel: prepara MySQL y arranca un servidor, no genera el sitio estático.

Después de incorporar el cambio en la rama de despliegue, ejecuta Redeploy. En el primer intento, desactiva Use existing Build Cache para descartar los ajustes anteriores.

## Rutas

Los archivos publicados se sirven primero; /catalogo, /login, /register y las demás rutas Angular reciben index.html al abrirse directamente o recargarse.

Las solicitudes /api y /api/* se excluyen del fallback y conservan un error HTTP en lugar de recibir el HTML de Angular.

## Alcance de esta prueba

Puedes revisar diseño, navegación pública y formularios. Al no tener todavía API pública, el catálogo mostrará un error de conexión y el registro/login, las reservas y las métricas no podrán operar con datos reales. Las pantallas protegidas seguirán exigiendo una sesión válida; este cambio no desactiva la seguridad ni introduce datos ficticios.

Para probar el flujo completo posteriormente, publica Express con una base MySQL accesible y conecta /api mediante un proxy o configura API_URL en Angular. El proxy.conf.json solo funciona con npm start en desarrollo. Nunca apuntes el deploy a localhost:3000 del servidor: no es tu computadora local.

## Comprobación local

Desde la raíz:

```sh
npm ci
npm run build:frontend
```

El resultado debe contener frontend/dist/frontend/browser/index.html, sus archivos JS/CSS y favicon.ico.

## Advertencias de npm

Las dependencias de desarrollo del backend incluyen paquetes transitivos antiguos usados por ts-node-dev. Su actualización es independiente del error de carpeta de salida. No se añadieron overrides incompatibles de glob/rimraf ni una aprobación indiscriminada de scripts de instalación.

Si un próximo deploy muestra un error explícito de binarios esbuild o módulos nativos, conserva ese log y revisa los scripts de los paquetes concretos; no confundas ese posible fallo con las advertencias del log actual.

Referencias: [configuración de Vercel](https://vercel.com/docs/project-configuration/vercel-json), [versiones de Node en Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
