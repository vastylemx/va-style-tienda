# Frontend oficial

Este frontend es el único cliente operativo de V&A Style. Se comunica con la API PHP/MariaDB del mismo sitio. La aplicación activa inicia en `src/main.jsx` y `src/App.jsx`.

```sh
npm ci
npm run dev
npm run build
npm run preview
```

Los comandos usan el `package.json` de esta carpeta, independiente de las dependencias del proyecto histórico de la raíz. El build escribe en `../release/`, que no se versiona.

`src/App copy.jsx` y `src/supabase.js` son restos de una implementación anterior, no se importan desde la entrada activa y no deben incorporarse a nuevas funciones. Se conservan localmente como referencia y se excluyen del control de versiones operativo. Los SVG de plantilla sin uso y el stub administrativo no importado también se omiten.
