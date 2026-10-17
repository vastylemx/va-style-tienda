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

La publicación de la aplicación actual se realiza al hosting cPanel mediante FTPS; no es un despliegue a Vercel. El publicador vigente valida antes y requiere `--apply` para escribir. Las credenciales locales se leen desde `vastyle.com.mx/.env`, nunca se suben a Git. El repositorio Git ya fue desconectado del proyecto histórico de Vercel, por lo que un push no activa allí builds automáticos. Consulta [`vastyle.com.mx/scripts/README.md`](vastyle.com.mx/scripts/README.md).

`vercel.json` se conserva para la redirección del proyecto antiguo a `https://vastyle.com.mx/`. La conexión Git del proyecto antiguo fue desconectada sin borrar el proyecto ni su dominio. No cambiarla como parte de una publicación cPanel ni reconectar el proyecto a Git.

## Configuración y datos

Usa `vastyle.com.mx/.env.example` y `vastyle.com.mx/config/production.example.php` como plantillas sin secretos. No versionar `.env`, configuración real, respaldos, exportaciones de datos, registros, archivos temporales ni datos personales. Las estructuras SQL revisadas sí pertenecen al proyecto; ejecutar un cambio de esquema requiere una solicitud explícita y un respaldo apropiado.

Consulta [`AGENTS.md`](AGENTS.md) antes de trabajar: define el alcance de la fuente oficial y el manejo de los árboles históricos.
