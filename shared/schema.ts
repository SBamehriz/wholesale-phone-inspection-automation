import { z } from "zod";
import {
  DEFECT_VALUES,
  GRADE_VALUES,
  MAX_IMAGES_PER_INSPECTION,
  type InspectionStatus,
  parseDeviceId,
} from "./inspection";

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

export interface User {
  id: number;
  username: string;
  role: string;
  createdAt: Date;
}

export type OrderStatus = "active" | "completed";

export interface Order {
  id: number;
  orderNumber: string;
  client: string;
  description: string;
  expectedQuantity: number;
  status: OrderStatus;
  createdBy: number;
  createdAt: Date;
  completedAt: Date | null;
}

export interface DeviceSpecs {
  brand: string;
  model: string;
  storage: string;
  color: string;
  releaseYear: number;
  source: "tac" | "serial-prefix" | "unknown";
}

export interface Inspection {
  id: number;
  /** An IMEI for devices with a modem, a serial number for WiFi only ones. */
  deviceId: string;
  idKind: "imei" | "serial";
  orderId: number;
  inspectorId: number;
  specs: DeviceSpecs | null;
  grade: string | null;
  defects: string[];
  notes: string | null;
  /** Data URLs, held in memory only. A deployment would put these in object storage. */
  images: string[];
  status: InspectionStatus;
  scannedAt: Date;
  photographedAt: Date | null;
  completedAt: Date | null;
}

/** An order plus the counts that every screen wants next to it. */
export interface OrderSummary extends Order {
  scannedCount: number;
  photographedCount: number;
  completedCount: number;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const orderNumber = z
  .string()
  .trim()
  .regex(/^\d{12}$/, "Order number must be exactly 12 digits");

export const createOrderSchema = z.object({
  orderNumber: orderNumber.optional(),
  client: z
    .string({ required_error: "Client name is required" })
    .trim()
    .min(1, "Client name is required")
    .max(120, "Client name must be 120 characters or fewer"),
  description: z.string().trim().max(500, "Description must be 500 characters or fewer").default(""),
  expectedQuantity: z
    .number({
      required_error: "Expected quantity is required",
      invalid_type_error: "Expected quantity must be a number",
    })
    .int("Expected quantity must be a whole number")
    .positive("Expected quantity must be at least 1")
    .max(10_000, "Expected quantity must be 10,000 or fewer"),
});

export const updateOrderSchema = createOrderSchema.partial();

const deviceId = z
  .string({ required_error: "Scan or type a device ID" })
  .trim()
  .superRefine((value, ctx) => {
    const parsed = parseDeviceId(value);
    if (parsed.kind === "invalid") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.reason });
    }
  });

const grade = z.enum(GRADE_VALUES as [string, ...string[]], {
  errorMap: () => ({ message: "Unknown grade" }),
});

const defects = z
  .array(
    z.enum(DEFECT_VALUES as [string, ...string[]], {
      errorMap: () => ({ message: "Unknown defect" }),
    }),
  )
  .max(DEFECT_VALUES.length);

export const createInspectionSchema = z.object({
  deviceId,
  orderId: z.number().int().positive(),
  grade,
  defects: defects.default([]),
  notes: z.string().trim().max(1000, "Notes must be 1,000 characters or fewer").optional(),
});

export const updateInspectionSchema = z.object({
  grade: grade.optional(),
  defects: defects.optional(),
  notes: z.string().trim().max(1000, "Notes must be 1,000 characters or fewer").optional(),
});

const dataUrl = z
  .string()
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Images must be JPEG, PNG or WebP")
  .max(1_500_000, "Each image must be under 1 MB");

export const addImagesSchema = z.object({
  images: z
    .array(dataUrl)
    .min(1, "Add at least one photo")
    .max(MAX_IMAGES_PER_INSPECTION, `Attach at most ${MAX_IMAGES_PER_INSPECTION} photos at a time`),
});

export const credentialsSchema = z.object({
  username: z.string().trim().min(1, "Enter a username").max(40),
  password: z.string().min(1, "Enter a password").max(200),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type CreateInspectionInput = z.infer<typeof createInspectionSchema>;
export type UpdateInspectionInput = z.infer<typeof updateInspectionSchema>;
