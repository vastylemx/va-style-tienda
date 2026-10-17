# V&A Style

## Base oficial

El proyecto operativo y única fuente oficial de cambios es [`vastyle.com.mx/`](vastyle.com.mx/): frontend React, API PHP y esquema MariaDB para el hosting cPanel. Los directorios de la raíz (`src/`, `api/`, `supabase/`, `public/` y `vercel.json`) pertenecen a la versión histórica de Vercel/Supabase. Se conservan para referencia y para mantener la redirección antigua; no se implementan ni se prueban nuevas funciones allí.

Cada corrección se desarrolla una sola vez en la base cPanel/MariaDB. Consulta el código histórico únicamente para entender comportamientos que haya que recuperar. No añadas al proyecto operativo dependencias de ejecución de Vercel o Supabase.

## Desarrollo y verificación

```sh
cd vastyle.com.mx/frontend
npm ci
npm run dev
npm run build
npm run preview
```

Vite usa `frontend/vite.config.js`; el servidor local y preview redirigen `/api` a `https://vastyle.com.mx`. El build genera los archivos estáticos en `vastyle.com.mx/release/`, que está excluido de Git.

Validar sintaxis PHP localmente:

```sh
find ../backend -name '*.php' -print0 | xargs -0 -n1 php -l
```

Ejecuta pruebas HTTP contra la API cPanel para confirmar integraciones que dependan del backend. No uses Supabase como backend de prueba para funcionalidades del proyecto oficial.

## Publicación

La publicación de la aplicación actual se realiza al hosting cPanel mediante FTPS; no es un despliegue a Vercel. Las credenciales locales se leen desde `vastyle.com.mx/.env`, nunca se suben a Git. Revisa [`vastyle.com.mx/scripts/README.md`](vastyle.com.mx/scripts/README.md) y los invariantes del script antes de cada publicación; si sus supuestos no coinciden con el catálogo o release actual, detén la publicación y corrige/verifica el procedimiento antes de ejecutarlo. No publicar automáticamente al hacer push.

`vercel.json` se conserva para la redirección del proyecto antiguo a `https://vastyle.com.mx/`. No cambiarla como parte de una publicación cPanel. Antes de hacer push, verificar en el panel de Vercel si el proyecto sigue conectado a Git y qué despliegues puede disparar.

## Configuración y datos

Usa `vastyle.com.mx/.env.example` y `vastyle.com.mx/config/production.example.php` como plantillas sin secretos. No versionar `.env`, configuración real, respaldos, exportaciones de datos, registros, archivos temporales ni datos personales. Las estructuras SQL revisadas sí pertenecen al proyecto; ejecutar un cambio de esquema requiere una solicitud explícita y un respaldo apropiado.

Consulta [`AGENTS.md`](AGENTS.md) antes de trabajar: define el alcance de la fuente oficial y el manejo de los árboles históricos.
