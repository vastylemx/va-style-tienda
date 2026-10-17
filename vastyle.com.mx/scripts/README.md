# Scripts de operación

## Único publicador vigente

El único script autorizado para publicar frontend y backend es `publish_cpanel_release.mjs`. Ejecuta desde `frontend/`:

```sh
npm ci
npm run build
npm run publish:plan
npm run publish:cpanel
```

`publish:plan` es la simulación local sin red ni credenciales. `publish:cpanel` pasa `--apply`, que habilita FTPS y requiere `.env` local con `user` y `pass`. Antes de ejecutarlo, revisa el plan y que las API estén sanas. Ante un preflight, colisión de hash, falta de respaldo o ausencia del WASM remoto, se aborta sin activar el índice.

Protecciones: no DELETE; no SQL; no transferencia de `media/`, datos, configuraciones reales, `.htaccess`, logs ni outputs `release/`. Archivos PHP y estáticos mutables se respaldan localmente antes de cambiar; los assets con hash son add-only; el HTML raíz se activa al final. Conserva el directorio de respaldo hasta verificar la publicación real.

## Scripts antiguos: no usar para publicar

- `deploy_cpanel_release.mjs`: obsoleto; fija hashes y nombres de respaldos de otra versión.
- `publish_advisor_directory.mjs` y `publish_outlet_frontend.mjs`: publicadores parciales antiguos, no garantizan el estado completo del release.
- `upload_migrated_media.mjs`: herramienta histórica de transferencia de media; no forma parte de una publicación de código.
- `export_supabase_data.mjs`, `migrate_supabase_media.mjs`, `import_data.php`, `install_schema.php` y `migrate_advisor_names.php`: operaciones históricas de datos/esquema. No ejecutar en el flujo normal ni como parte de una publicación.

El sistema no publica a cPanel desde un push. La conexión Git del Vercel histórico fue desconectada; no reconectarla. No subas `.env` ni respaldos a Git.
