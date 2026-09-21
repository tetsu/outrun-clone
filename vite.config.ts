import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const LOCAL_ASSETS = fileURLToPath(new URL("./local-assets", import.meta.url));
const SNAPSHOTS = fileURLToPath(new URL("./dev-snapshots", import.meta.url));
const STAGES = fileURLToPath(new URL("./src/data/stages", import.meta.url));
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

/**
 * Dev server only: POST /__dev/stage/<name>.json writes a stage file from the track editor to
 * src/data/stages/. A browser cannot write to the repository by itself, and a production build
 * has no such endpoint. The body must be a JSON object with sections; it is saved as sent, so
 * the editor decides the layout.
 */
function stageFiles(): Plugin {
  return {
    name: "boso-run:stage-files",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__dev/stage", (req, res) => {
        const name = decodeURIComponent((req.url ?? "").split("?")[0]).replace(/^\//, "");
        if (req.method !== "POST" || !/^[a-z0-9-]{1,60}\.json$/.test(name)) {
          res.statusCode = 400;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let stage: unknown;
          try {
            stage = JSON.parse(text);
          } catch {
            stage = null;
          }
          if (!stage || typeof stage !== "object" || !Array.isArray((stage as { sections?: unknown }).sections)) {
            res.statusCode = 422;
            res.end();
            return;
          }
          writeFileSync(join(STAGES, name), text.endsWith("\n") ? text : text + "\n");
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [localAssets(), snapshots(), stageFiles()],
  server: { port: 5173, strictPort: true },
  test: { include: ["tests/**/*.test.ts"] },
});
