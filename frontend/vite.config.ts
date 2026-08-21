import path from "path";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The dev server mirrors what nginx does in production: one origin, with the
 * backend's paths forwarded to the API.
 *
 * This used to read strangler-routes.json and build a per-route table so dev
 * and prod could never disagree about which backend owned a route. The
 * migration is finished and every route is on FastAPI, so the table is gone.
 * The JSON survives as the URL manifest the parity harnesses in tools/ still
 * read — those talk to the two backends directly, not through this proxy.
 *
 * Point BACKEND_URL at Express and set API_TARGET to it to reproduce the
 * pre-cutover behaviour locally.
 */
function devProxy(apiUrl: string): Record<string, ProxyOptions> {
  return {
    "/api": { target: apiUrl, changeOrigin: false },
    "/sitemap.xml": { target: apiUrl, changeOrigin: false },
    // /combo/:id is server-rendered for the OG tags, so it is not a SPA route.
    "/combo/": { target: apiUrl, changeOrigin: false },
  };
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");

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
      proxy:
        command === "serve"
          ? devProxy(env.API_TARGET || env.BACKEND_PY_URL || "http://localhost:8000")
          : undefined,
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});
