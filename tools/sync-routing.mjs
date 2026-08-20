// Regenerates the nginx location blocks for routes served by FastAPI.
//
// strangler-routes.json is the source of truth; this script projects it into
// frontend/nginx.conf.template. The Vite dev server reads the JSON directly, so
// only the nginx side needs generating.
//
// Run with: npm run strangler:sync

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const routes = JSON.parse(readFileSync(resolve(root, "strangler-routes.json"), "utf-8"));
const templatePath = resolve(root, "frontend/nginx.conf.template");

const BEGIN = "    # BEGIN STRANGLER ROUTES";
const END = "    # END STRANGLER ROUTES";

const proxyBody = `        set $py_upstream "\${PY_UPSTREAM}";
        proxy_pass $py_upstream$request_uri;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;`;

// nginx resolves an exact `=` match first, then regexes in the order they
// appear, then the longest plain prefix — so any of these beats the generic
// /api/ block below them.
const selectorFor = ({ path, match, pattern }) => {
  if (match === "exact") return `= ${path}`;
  if (match === "regex") return `~ ${pattern}`;
  return path.replace(/\/?$/, "/");
};

const blocks = routes.migrated.map(
  (route) => `    location ${selectorFor(route)} {\n${proxyBody}\n    }`,
);

const generated = [
  BEGIN,
  "    # Generated from strangler-routes.json by `npm run strangler:sync`.",
  "    # Do not edit by hand — edit the JSON and regenerate.",
  "    # These win over the generic /api/ block below: nginx prefers an exact `=`",
  "    # match, and otherwise the longest matching prefix.",
  ...(blocks.length ? ["", ...blocks] : ["", "    # (nothing migrated yet)"]),
  "",
  END,
].join("\n");

const template = readFileSync(templatePath, "utf-8");
const start = template.indexOf(BEGIN);
const finish = template.indexOf(END);
if (start === -1 || finish === -1) {
  console.error(`Markers not found in ${templatePath}`);
  process.exit(1);
}

const updated = template.slice(0, start) + generated + template.slice(finish + END.length);
writeFileSync(templatePath, updated);
console.log(`Wrote ${routes.migrated.length} location block(s) to frontend/nginx.conf.template`);
