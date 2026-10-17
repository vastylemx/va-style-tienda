# Scripts de operación

Las herramientas de esta carpeta no forman parte del runtime web. Las de exportación/importación y `migrate_*` se conservan como herramientas históricas, se ejecutan solo bajo solicitud explícita y no se usan en el ciclo ordinario de desarrollo.

## Publicación cPanel

Compila antes desde `frontend/`; los scripts leen las credenciales FTPS de `../.env`. No ejecutes un script contra producción sin revisar sus archivos destino, sus precondiciones y el estado actual del sitio.

- `publish_cpanel_release.mjs` crea etapas verificadas por hash y respalda los remotos que reemplaza. Sus verificaciones actuales contienen supuestos de catálogo/media que pueden quedar obsoletos. Comprueba primero que representen el estado vigente.
- `deploy_cpanel_release.mjs` referencia hashes de assets y respaldos de una publicación antigua. No utilizar como procedimiento vigente sin actualizar esos valores y verificar el plan de cambios.
- `publish_advisor_directory.mjs` y `publish_outlet_frontend.mjs` son publicadores parciales; revisa el contenido antes de ejecutarlos para confirmar que no reemplacen un frontend completo.

No subas secretos a Git; no publiques automáticamente desde `git push`. La versión cPanel se publica por FTPS, independientemente de Vercel. Antes de cada ejecución confirma respaldo disponible, staging íntegro, API operativa, ids/inventario conservados y que solo se reemplace el alcance solicitado. Detén la publicación ante una discrepancia.
