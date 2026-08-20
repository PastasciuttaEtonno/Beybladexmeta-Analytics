import { readFileSync } from "node:fs";
import path from "path";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

type StranglerRoute =
  | { path: string; match: "exact" | "prefix"; pattern?: undefined }
  | { path?: undefined; match: "regex"; pattern: string };

// Escapes the characters that are special inside a regular expression.
const REGEX_METACHARACTERS = /[.*+?^${}()|[\]\\]/g;

/** Vite matches plain string proxy keys by prefix, so an exact route needs a regex. */
function toExactPattern(routePath: string): string {
  return "^" + routePath.replace(REGEX_METACHARACTERS, "\\$&") + "$";
}

/**
 * Routes already served by the FastAPI backend.
 *
 * Read from the same strangler-routes.json that generates the nginx location
 * blocks, so development and production can never disagree about which backend
 * owns a route.
 *
 * The file lives at the repo root, outside this package. That is fine because
 * it is only needed by the dev server — the production build is served by
 * nginx, which gets the routing from its own generated config.
 */
function migratedRoutes(): StranglerRoute[] {
  const file = path.resolve(import.meta.dirname, "..", "strangler-routes.json");
  try {
    return JSON.parse(readFileSync(file, "utf-8")).migrated;
  } catch {
    return [];
  }
}

function devProxy(expressUrl: string, fastapiUrl: string): Record<string, ProxyOptions> {
  const proxy: Record<string, ProxyOptions> = {};

  // Most specific first: Vite tries the keys in insertion order, so the
  // migrated routes must be registered before the catch-all /api entry.
  for (const route of migratedRoutes()) {
    // Vite reads a key starting with '^' as a regular expression and anything
    // else as a prefix, which lines up with the three match modes.
    const key =
      route.match === "regex"
        ? route.pattern
        : route.match === "exact"
          ? toExactPattern(route.path)
          : route.path;
    proxy[key] = { target: fastapiUrl, changeOrigin: false };
  }

  proxy["/api"] = { target: expressUrl, changeOrigin: false };
  proxy["/sitemap.xml"] = { target: expressUrl, changeOrigin: false };

  return proxy;
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
          ? devProxy(
              env.BACKEND_URL || "http://localhost:5000",
              env.BACKEND_PY_URL || "http://localhost:8000",
            )
          : undefined,
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});
