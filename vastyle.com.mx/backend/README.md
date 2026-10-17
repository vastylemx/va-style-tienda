# API PHP oficial

El backend operativo es PHP con MariaDB y se publica en cPanel. El router está en `public/api/index.php`; bootstrap, conexión PDO y rutas se encuentran en `src/`. El frontend accede mediante `/api` del mismo dominio.

Valida sintaxis sin acceder a datos:

```sh
find . -name '*.php' -print0 | xargs -0 -n1 php -l
```

La configuración real de producción debe permanecer fuera de `public_html` y fuera de Git. `../config/production.example.php` es solo una plantilla. Cambios de esquema se revisan por separado en `../database/`; no aplicarlos automáticamente al compilar o publicar.
