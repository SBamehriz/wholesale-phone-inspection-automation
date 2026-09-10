import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express, { type Express } from "express";
import type { Server } from "http";
import { createLogger, createServer as createViteServer, type ViteDevServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(__dirname, "../client");

export function log(message: string, source = "server") {
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  console.log(`${time} [${source}] ${message}`);
}

/** Mounts the Vite dev middleware, with HMR riding on the HTTP server we already have. */
export async function setupVite(app: Express, server: Server) {
  const viteLogger = createLogger();

  const vite: ViteDevServer = await createViteServer({
    root: clientRoot,
    configFile: path.resolve(__dirname, "../vite.config.ts"),
    appType: "custom",
    server: { middlewareMode: true, hmr: { server } },
    customLogger: {
      ...viteLogger,
      error: (message, options) => {
        viteLogger.error(message, options);
        process.exit(1);
      },
    },
  });

  app.use(vite.middlewares);

  app.use(async (req, res, next) => {
    try {
      const template = await fs.promises.readFile(path.join(clientRoot, "index.html"), "utf-8");
      const html = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).type("html").send(html);
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  });
}

/** Serves the production build, falling back to index.html for client routes. */
export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "../dist/public");
  if (!fs.existsSync(distPath)) {
    throw new Error(`Client build missing at ${distPath}. Run \`npm run build\` first.`);
  }

  app.use(express.static(distPath, { index: false, maxAge: "1y" }));
  app.use((_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}
