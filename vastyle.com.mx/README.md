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

El destino es exclusivamente cPanel (`/home/vastyle/public_html`) mediante FTPS. Lee credenciales desde el `.env` local y protege temporales y respaldos. Nunca copies el `.env` al hosting público ni lo agregues a Git. No hagas push para publicar esta aplicación.

El script `scripts/publish_cpanel_release.mjs` incluye precondiciones explícitas sobre número de productos y rutas de imágenes. Esos valores pueden quedar desactualizados cuando cambia el catálogo; verifica que coincidan con datos actuales antes de usarlo. No lo ejecutes si falla una precondición ni reemplaces esas comprobaciones por valores inventados. `scripts/deploy_cpanel_release.mjs` contiene nombres de assets fijos de una publicación anterior y no debe considerarse un procedimiento vigente sin actualizar/verificar esos nombres. El procedimiento operativo seguro y sus comprobaciones deben mantenerse sincronizados con el release publicado.

Antes de publicar: compila, valida PHP, revisa los cambios, confirma que el backend/API de cPanel funciona y respalda los archivos remotos que se reemplazarán. Activa el nuevo HTML solo después de verificar los assets y la API. No se ejecutan migraciones de datos ni cambios SQL como parte de una publicación normal.

## Configuración y seguridad

- `../.env` es local y privado; las herramientas de `scripts/` pueden leerlo.
- `config/production.example.php` es plantilla; la configuración real vive fuera de `public_html` y no se versiona.
- No incluir contraseñas, tokens, logs, dumps, exportaciones, respaldos, datos de clientes ni `release/`.
- Los scripts `export_supabase_data.mjs`, `migrate_supabase_media.mjs` y los scripts de importación son herramientas históricas de transferencia, no parte del runtime ni del flujo habitual de desarrollo.
- Supabase no debe ser reintroducido como backend de ejecución. Las referencias residuales deben ser inactivas o históricas.

## Historial de la organización

La carpeta estuvo aislada mientras se preparaba la sustitución del sistema anterior. Desde esta organización pasa a control de versiones como proyecto oficial; los documentos de estado históricos pueden contener cifras o pendientes obsoletos, que deben verificarse con el sitio/API antes de usarlos.
