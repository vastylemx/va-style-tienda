# Proyecto cPanel / MariaDB

Esta carpeta es la fuente oficial única de V&A Style. Contiene la aplicación desplegada en cPanel: `frontend/` (React/Vite), `backend/` (API PHP), `database/` (esquema MariaDB), `config/` (plantilla de configuración) y `scripts/` (operación y herramientas históricas de datos).

El código de la raíz del repositorio corresponde a la versión histórica Vercel/Supabase. Se conserva sin actualizar para consulta de comportamientos anteriores; no copies cambios de ida y vuelta ni lo uses para probar la aplicación actual.

## Requisitos y comandos

Usa Node.js compatible con Vite 8 y PHP para validaciones locales. No se requiere ejecutar Node en cPanel.

```sh
cd vastyle.com.mx/frontend
npm ci
npm run dev
npm run build
npm run preview
find ../backend -name '*.php' -print0 | xargs -0 -n1 php -l
```

El frontend consume la API del dominio cPanel; Vite proxy `/api` a `https://vastyle.com.mx`. El build queda en `../release/`; esa salida es generada y no se versiona.

## Publicación

El único procedimiento vigente es `scripts/publish_cpanel_release.mjs`. Desde `frontend/`, compila y simula primero:

```sh
npm ci
npm run build
npm run publish:plan
```

La simulación es local: enumera assets y código permitido, y las rutas que protege; no lee `.env`, no conecta ni escribe al servidor. Para una publicación autorizada y revisada:

```sh
npm run publish:cpanel
```

Este modo exige que los archivos gestionados ya existan y que la API/catalogo pasen preflight de solo lectura. Guarda respaldo local de cada archivo mutable, sube primero archivos a nombres de etapa, compara SHA-256 y los activa por rename atómico; `index.html` se activa al final. Los assets con hash se agregan únicamente si no existen; si hay colisión con contenido diferente, aborta. No contiene operaciones DELETE ni comandos SQL.

No se publica `.htaccess`, configuración real, archivos de `media/`, logs ni `release/`. El archivo de compresión WASM debe existir en el servidor y se conserva intacto; si falta o no coincide su versión, el publicador aborta. Los datos MariaDB no se leen ni modifican. Las pruebas posteriores solo consultan el HTML, health y catálogo.

## Configuración y seguridad

- `../.env` es local y privado; las herramientas de `scripts/` pueden leerlo.
- `config/production.example.php` es plantilla; la configuración real vive fuera de `public_html` y no se versiona.
- No incluir contraseñas, tokens, logs, dumps, exportaciones, respaldos, datos de clientes ni `release/`.
- Los scripts `export_supabase_data.mjs`, `migrate_supabase_media.mjs` y los scripts de importación son herramientas históricas de transferencia, no parte del runtime ni del flujo habitual de desarrollo.
- Supabase no debe ser reintroducido como backend de ejecución. Las referencias residuales deben ser inactivas o históricas.

## Historial de la organización

La carpeta estuvo aislada mientras se preparaba la sustitución del sistema anterior. Desde esta organización pasa a control de versiones como proyecto oficial; los documentos de estado históricos pueden contener cifras o pendientes obsoletos, que deben verificarse con el sitio/API antes de usarlos.
