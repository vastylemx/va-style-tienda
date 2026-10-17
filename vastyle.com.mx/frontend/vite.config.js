import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiProxy = {
  "/api": {
    target: "https://vastyle.com.mx",
    changeOrigin: true,
    secure: true,
  },
};

const releaseVersion = Date.now();

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  define: {
    __MIGRATION_RELEASE_VERSION__: JSON.stringify(releaseVersion),
  },
  plugins: [
    react(),
    {
      name: "migration-css-cache-bust",
      apply: "build",
      transformIndexHtml: {
        order: "post",
        handler(html) {
          return html.replace(
            /(href="[^"]+\.css)(?=")/g,
            `$1?v=${releaseVersion}`,
          );
        },
      },
    },
  ],
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  build: {
    outDir: "../release",
    emptyOutDir: true,
  },
});
