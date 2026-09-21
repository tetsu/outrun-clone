import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const LOCAL_ASSETS = fileURLToPath(new URL("./local-assets", import.meta.url));
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

export default defineConfig({
  base: "./",
  plugins: [localAssets()],
  server: { port: 5173, strictPort: true },
  test: { include: ["tests/**/*.test.ts"] },
});
