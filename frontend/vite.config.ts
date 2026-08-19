import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// The backend the dev server proxies API calls to.
// Everything else (including the SPA route /combo/:id) is served by Vite.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendUrl = env.BACKEND_URL || "http://localhost:5000";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": { target: backendUrl, changeOrigin: false },
        "/sitemap.xml": { target: backendUrl, changeOrigin: false },
      },
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});
