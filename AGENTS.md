# Instrucciones del repositorio

- La única base operativa para V&A Style es `vastyle.com.mx/` (frontend React, API PHP y MariaDB en cPanel).
- Implementa cada corrección una sola vez en esa carpeta. Desarrolla, compila y prepara la publicación desde los comandos indicados en `README.md` y `vastyle.com.mx/frontend/README.md`.
- El código raíz (`src/`, `api/`, `supabase/`, `public/` y `vercel.json`) es histórico. Consúltalo solo como referencia de comportamiento; no lo actualices para luego duplicar el cambio en la versión actual.
- No introduzcas dependencias operativas de Vercel ni Supabase en la aplicación cPanel. Supabase export/migration scripts o referencias archivadas no son dependencias de runtime.
- No alteres `vercel.json`: el proyecto antiguo mantiene una redirección a `https://vastyle.com.mx/`.
- No hagas push como parte de la publicación cPanel. Antes de un push, verifica si el proyecto de Vercel sigue conectado a Git y qué efectos tendría.
- Nunca leas, imprimas, stages ni publiques secretos o información privada desde `.env`, configuración real, backups, dumps, exports, logs o archivos generados. Conserva la configuración `.example` sin valores reales.
- Antes de una publicación FTPS, revisa que el script de publicación corresponda al release y a los invariantes actuales; conserva y verifica respaldos. No ejecutes una herramienta de despliegue con supuestos desactualizados.
- Usa “desarrollo”, “corrección”, “compilación” y “publicación” con precisión. Reserva “migración” para un traslado real de sistema/datos o cambios de esquema.
