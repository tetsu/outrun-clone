import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const LOCAL_ASSETS = fileURLToPath(new URL("./local-assets", import.meta.url));
const SNAPSHOTS = fileURLToPath(new URL("./dev-snapshots", import.meta.url));
const TYPES: Record<string, string> = { ".json": "application/json", ".png": "image/png" };

/**
 * Serves local-assets/ at /assets/local/ on the dev server only. Art rendered from stand-in
 * models lives there; because it is outside public/, a production build can never include it.
 */
function localAssets(): Plugin {
  return {
    name: "boso-run:local-assets",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/assets/local", (req, res, next) => {
        const path = normalize(join(LOCAL_ASSETS, decodeURIComponent((req.url ?? "").split("?")[0])));
        const type = TYPES[extname(path)];
        if (!path.startsWith(LOCAL_ASSETS) || !type || !existsSync(path) || !statSync(path).isFile()) {
          next();
          return;
        }
        res.setHeader("Content-Type", type);
        createReadStream(path).pipe(res);
      });
    },
  };
}

/**
 * Dev server only: POST /__dev/snapshot/<name>.png saves the request body (a PNG or JPEG of the
 * canvas) to dev-snapshots/, so the look of a tuning change can be compared as files. The
 * folder is git-ignored and a production build has no such endpoint.
 */
function snapshots(): Plugin {
  return {
    name: "boso-run:snapshots",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__dev/snapshot", (req, res) => {
        const name = decodeURIComponent((req.url ?? "").split("?")[0]).replace(/^\//, "");
        if (req.method !== "POST" || !/^[a-z0-9_-]{1,80}\.(png|jpg)$/i.test(name)) {
          res.statusCode = 400;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          mkdirSync(SNAPSHOTS, { recursive: true });
          writeFileSync(join(SNAPSHOTS, name), Buffer.concat(chunks));
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [localAssets(), snapshots()],
  server: { port: 5173, strictPort: true },
  test: { include: ["tests/**/*.test.ts"] },
});
