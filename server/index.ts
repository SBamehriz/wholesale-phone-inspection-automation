import express, { type NextFunction, type Request, type Response } from "express";

import { registerRoutes } from "./routes";
import { log, serveStatic, setupVite } from "./vite";
import { MAX_IMAGES_PER_INSPECTION } from "../shared/inspection";

const isProduction = process.env.NODE_ENV === "production";

const app = express();
app.disable("x-powered-by");
// Behind a reverse proxy, the secure session cookie only gets set if Express
// believes the original request came in over HTTPS.
if (isProduction) app.set("trust proxy", 1);

const CSP = [
  "default-src 'self'",
  // Captured photos are held as data URLs, and the camera preview is a blob.
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  // The built bundle loads as external modules and needs no inline scripts.
  // Only the Vite dev client does, so the allowance stops at the dev server.
  isProduction ? "script-src 'self'" : "script-src 'self' 'unsafe-inline'",
  // Development needs the HMR websocket.
  isProduction ? "connect-src 'self'" : "connect-src 'self' ws: wss:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", CSP);
  if (isProduction) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// Inspection photos travel as base64 data URLs, so the body limit has to be
// big enough for a full set of them.
app.use(express.json({ limit: `${MAX_IMAGES_PER_INSPECTION * 2}mb` }));

app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) return next();

  // Grab it now, because a mounted router rewrites `req.url` before finish fires.
  const path = req.path;
  const start = Date.now();
  res.on("finish", () => {
    log(`${req.method} ${path} ${res.statusCode} in ${Date.now() - start}ms`);
  });
  next();
});

const server = registerRoutes(app);

app.use("/api", (_req, res) => {
  res.status(404).json({ message: "Not found" });
});

app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = error?.status ?? error?.statusCode ?? 500;
  if (status >= 500) console.error(error);
  res.status(status).json({
    message: status >= 500 ? "Something went wrong on our end" : error?.message || "Bad request",
  });
});

if (isProduction) {
  serveStatic(app);
} else {
  await setupVite(app, server);
}

const port = Number(process.env.PORT ?? 5000);

server.on("error", (error: NodeJS.ErrnoException) => {
  // The two everyone runs into deserve a sentence, not a stack trace.
  if (error.code === "EADDRINUSE") {
    log(`Port ${port} is already in use. Stop the other process, or run with PORT=5001 npm run dev.`);
  } else if (error.code === "EACCES") {
    log(`Not allowed to bind port ${port}. Ports below 1024 need elevated privileges.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.listen(port, () => log(`ready on http://localhost:${port}`));

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
