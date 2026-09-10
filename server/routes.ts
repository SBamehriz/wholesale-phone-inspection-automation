import { randomBytes } from "crypto";
import { createServer, type Server } from "http";
import type { Express, NextFunction, Request, Response } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import type { z, ZodError, ZodTypeAny } from "zod";

import { storage } from "./storage";
import { lookupDevice } from "./services/imei";
import { buildOrderReport, buildPortfolioReport } from "./services/report";
import {
  addImagesSchema,
  createInspectionSchema,
  createOrderSchema,
  credentialsSchema,
  updateInspectionSchema,
  updateOrderSchema,
} from "../shared/schema";

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

const SESSION_COOKIE = "phone-inspection.sid";

function sessionSecret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set when NODE_ENV=production");
  }
  // Development gets a fresh secret every boot rather than one shipped in the repo.
  return randomBytes(32).toString("hex");
}

/** Turns a Zod failure into the one message the UI shows next to the field. */
function validationMessage(error: ZodError): string {
  const issue = error.issues[0];
  return issue?.message ?? "Invalid request";
}

function parseBody<S extends ZodTypeAny>(
  schema: S,
  body: unknown,
  res: Response,
): z.infer<S> | undefined {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  res.status(400).json({ message: validationMessage(result.error) });
  return undefined;
}

/** Express 5 types a route param as `string | string[]`, and we only want one. */
function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function parseId(req: Request, name: string, res: Response, what: string): number | undefined {
  const id = Number.parseInt(param(req, name), 10);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ message: `Invalid ${what}` });
    return undefined;
  }
  return id;
}

/** Wraps an async handler so a rejected promise reaches the error middleware. */
function route(handler: (req: Request, res: Response) => Promise<void> | void) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

function sendWorkbook(res: Response, workbook: Buffer, filename: string) {
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", String(workbook.length));
  res.setHeader("Cache-Control", "no-store");
  res.end(workbook);
}

function reportDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function registerRoutes(app: Express): Server {
  const MemoryStore = createMemoryStore(session);

  app.use(
    session({
      name: SESSION_COOKIE,
      secret: sessionSecret(),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      // The default store leaks sessions, and this one prunes expired entries.
      store: new MemoryStore({ checkPeriod: 24 * 60 * 60 * 1000 }),
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 24 * 60 * 60 * 1000,
      },
    }),
  );

  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) {
      res.status(401).json({ message: "Sign in to continue" });
      return;
    }
    next();
  };

  // --- Health --------------------------------------------------------------

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", storage: "memory", timestamp: new Date().toISOString() });
  });

  // --- Auth ----------------------------------------------------------------
  //
  // There is no user database in this build. Any credentials open a session,
  // and every session sees the same demo orders. Putting real authentication
  // in means replacing this handler and adding a password column.

  app.post(
    "/api/auth/signin",
    route((req, res) => {
      const credentials = parseBody(credentialsSchema, req.body, res);
      if (!credentials) return;

      const user =
        storage.getUserByUsername(credentials.username) ??
        storage.createUser(credentials.username);

      req.session.regenerate((error) => {
        if (error) {
          res.status(500).json({ message: "Could not start a session" });
          return;
        }
        req.session.userId = user.id;
        res.json({ id: user.id, username: user.username, role: user.role });
      });
    }),
  );

  app.post("/api/auth/signout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie(SESSION_COOKIE);
      res.json({ message: "Signed out" });
    });
  });

  app.get(
    "/api/auth/user",
    requireAuth,
    route((req, res) => {
      const user = storage.getUser(req.session.userId!);
      if (!user) {
        req.session.destroy(() => {
          res.status(401).json({ message: "Session expired" });
        });
        return;
      }
      res.json({ id: user.id, username: user.username, role: user.role });
    }),
  );

  // --- Orders --------------------------------------------------------------

  app.get(
    "/api/orders",
    requireAuth,
    route((req, res) => {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      res.json(storage.listOrders(limit));
    }),
  );

  app.post(
    "/api/orders",
    requireAuth,
    route((req, res) => {
      const input = parseBody(createOrderSchema, req.body, res);
      if (!input) return;

      if (input.orderNumber && storage.getOrderByNumber(input.orderNumber)) {
        res.status(409).json({ message: "That order number is already in use" });
        return;
      }

      res.status(201).json(storage.createOrder({ ...input, createdBy: req.session.userId! }));
    }),
  );

  app.get(
    "/api/orders/by-number/:orderNumber",
    requireAuth,
    route((req, res) => {
      const order = storage.getOrderByNumber(param(req, "orderNumber"));
      if (!order) {
        res.status(404).json({ message: "Order not found" });
        return;
      }
      res.json(storage.summarize(order));
    }),
  );

  app.get(
    "/api/orders/:id",
    requireAuth,
    route((req, res) => {
      const id = parseId(req, "id", res, "order id");
      if (id === undefined) return;

      const order = storage.getOrder(id);
      if (!order) {
        res.status(404).json({ message: "Order not found" });
        return;
      }
      res.json({ order: storage.summarize(order), inspections: storage.listInspections(id) });
    }),
  );

  app.patch(
    "/api/orders/:id",
    requireAuth,
    route((req, res) => {
      const id = parseId(req, "id", res, "order id");
      if (id === undefined) return;

      const input = parseBody(updateOrderSchema, req.body, res);
      if (!input) return;

      if (input.orderNumber) {
        const clash = storage.getOrderByNumber(input.orderNumber);
        if (clash && clash.id !== id) {
          res.status(409).json({ message: "That order number is already in use" });
          return;
        }
      }

      const order = storage.updateOrder(id, input);
      if (!order) {
        res.status(404).json({ message: "Order not found" });
        return;
      }
      res.json(storage.summarize(order));
    }),
  );

  // --- Device lookup -------------------------------------------------------

  app.get(
    "/api/devices/:deviceId",
    requireAuth,
    route((req, res) => {
      try {
        res.json(lookupDevice(param(req, "deviceId")));
      } catch (error) {
        res.status(400).json({ message: (error as Error).message });
      }
    }),
  );

  // --- Inspections ---------------------------------------------------------

  app.get(
    "/api/orders/:id/inspections",
    requireAuth,
    route((req, res) => {
      const id = parseId(req, "id", res, "order id");
      if (id === undefined) return;
      res.json(storage.listInspections(id));
    }),
  );

  app.post(
    "/api/inspections",
    requireAuth,
    route((req, res) => {
      const input = parseBody(createInspectionSchema, req.body, res);
      if (!input) return;

      if (!storage.getOrder(input.orderId)) {
        res.status(404).json({ message: "Order not found" });
        return;
      }

      const existing = storage.findInspection(input.orderId, input.deviceId);
      if (existing) {
        res.status(409).json({
          message: "That device is already in this order",
          inspection: existing,
        });
        return;
      }

      res.status(201).json(storage.createInspection({ ...input, inspectorId: req.session.userId! }));
    }),
  );

  app.get(
    "/api/orders/:id/inspections/:deviceId",
    requireAuth,
    route((req, res) => {
      const id = parseId(req, "id", res, "order id");
      if (id === undefined) return;

      const inspection = storage.findInspection(id, param(req, "deviceId"));
      if (!inspection) {
        res.status(404).json({ message: "This device has not been scanned into the order yet" });
        return;
      }
      res.json(inspection);
    }),
  );

  app.patch(
    "/api/inspections/:id",
    requireAuth,
    route((req, res) => {
      const id = parseId(req, "id", res, "inspection id");
      if (id === undefined) return;

      const input = parseBody(updateInspectionSchema, req.body, res);
      if (!input) return;

      const inspection = storage.updateInspection(id, input);
      if (!inspection) {
        res.status(404).json({ message: "Inspection not found" });
        return;
      }
      res.json(inspection);
    }),
  );

  app.post(
    "/api/inspections/:id/images",
    requireAuth,
    route((req, res) => {
      const id = parseId(req, "id", res, "inspection id");
      if (id === undefined) return;

      const input = parseBody(addImagesSchema, req.body, res);
      if (!input) return;

      const inspection = storage.addImages(id, input.images);
      if (!inspection) {
        res.status(404).json({ message: "Inspection not found" });
        return;
      }
      res.json(inspection);
    }),
  );

  app.post(
    "/api/inspections/:id/complete",
    requireAuth,
    route((req, res) => {
      const id = parseId(req, "id", res, "inspection id");
      if (id === undefined) return;

      const inspection = storage.getInspection(id);
      if (!inspection) {
        res.status(404).json({ message: "Inspection not found" });
        return;
      }
      if (inspection.images.length === 0) {
        res.status(409).json({ message: "Add at least one photo before completing this device" });
        return;
      }
      res.json(storage.completeInspection(id));
    }),
  );

  app.delete(
    "/api/inspections/:id",
    requireAuth,
    route((req, res) => {
      const id = parseId(req, "id", res, "inspection id");
      if (id === undefined) return;

      if (!storage.deleteInspection(id)) {
        res.status(404).json({ message: "Inspection not found" });
        return;
      }
      res.status(204).end();
    }),
  );

  // --- Reports -------------------------------------------------------------

  /** The grade and defect mix across everything inspected so far. */
  app.get(
    "/api/reports/summary",
    requireAuth,
    route((_req, res) => {
      const inspections = storage
        .listOrders(200)
        .flatMap((order) => storage.listInspections(order.id));

      const grades: Record<string, number> = {};
      const defects: Record<string, number> = {};
      for (const inspection of inspections) {
        const grade = inspection.grade ?? "NA";
        grades[grade] = (grades[grade] ?? 0) + 1;
        for (const defect of inspection.defects) {
          defects[defect] = (defects[defect] ?? 0) + 1;
        }
      }

      res.json({
        devices: inspections.length,
        withDefects: inspections.filter((i) => i.defects.length > 0).length,
        grades,
        defects,
      });
    }),
  );

  app.get(
    "/api/orders/:id/report.xlsx",
    requireAuth,
    route((req, res) => {
      const id = parseId(req, "id", res, "order id");
      if (id === undefined) return;

      const order = storage.getOrder(id);
      if (!order) {
        res.status(404).json({ message: "Order not found" });
        return;
      }

      const workbook = buildOrderReport(order, storage.listInspections(id));
      sendWorkbook(res, workbook, `inspection-${order.orderNumber}-${reportDate()}.xlsx`);
    }),
  );

  app.get(
    "/api/reports/completed.xlsx",
    requireAuth,
    route((_req, res) => {
      const completed = storage.listOrders(200).filter((order) => order.status === "completed");
      if (completed.length === 0) {
        res.status(409).json({ message: "No completed orders to export yet" });
        return;
      }

      const workbook = buildPortfolioReport(
        completed.map((order) => ({ order, inspections: storage.listInspections(order.id) })),
      );
      sendWorkbook(res, workbook, `inspection-portfolio-${reportDate()}.xlsx`);
    }),
  );

  return createServer(app);
}
