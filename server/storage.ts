import type {
  CreateInspectionInput,
  CreateOrderInput,
  DeviceSpecs,
  Inspection,
  Order,
  OrderSummary,
  UpdateInspectionInput,
  UpdateOrderInput,
  User,
} from "../shared/schema";
import { MAX_IMAGES_PER_INSPECTION, parseDeviceId, type InspectionStatus } from "../shared/inspection";
import { buildImei, lookupDevice } from "./services/imei";
import { syntheticDevicePhoto } from "./services/photo";

export interface Storage {
  getUser(id: number): User | undefined;
  getUserByUsername(username: string): User | undefined;
  createUser(username: string): User;

  createOrder(input: CreateOrderInput & { createdBy: number }): Order;
  getOrder(id: number): Order | undefined;
  getOrderByNumber(orderNumber: string): Order | undefined;
  listOrders(limit?: number): OrderSummary[];
  summarize(order: Order): OrderSummary;
  updateOrder(id: number, input: UpdateOrderInput): Order | undefined;

  createInspection(input: CreateInspectionInput & { inspectorId: number }): Inspection;
  getInspection(id: number): Inspection | undefined;
  findInspection(orderId: number, deviceId: string): Inspection | undefined;
  listInspections(orderId: number): Inspection[];
  updateInspection(id: number, input: UpdateInspectionInput): Inspection | undefined;
  addImages(id: number, images: string[]): Inspection | undefined;
  completeInspection(id: number): Inspection | undefined;
  deleteInspection(id: number): boolean;
}

// ---------------------------------------------------------------------------

/** A small predictable random generator, so the demo data is the same every boot. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface LotSeed {
  orderNumber: string;
  client: string;
  description: string;
  createdAt: string;
  /** Where the devices come from. A TAC for phones, a 4 letter prefix for tablets. */
  devices: Array<{ tac?: string; serialPrefix?: string; count: number }>;
  /** How many devices have been worked on, and how far each one got. */
  progress?: { completed: number; photographed: number; scanned: number };
}

const LOTS: LotSeed[] = [
  {
    orderNumber: "481920374856",
    client: "TechBridge Distributors LLC",
    description: "Mixed iPhone 15 Pro and Galaxy S24 Ultra, carrier unlocked. Dallas, TX.",
    createdAt: "2025-01-08T08:00:00Z",
    devices: [
      { tac: "35674108", count: 12 },
      { tac: "35291840", count: 12 },
    ],
  },
  {
    orderNumber: "730184629541",
    client: "NextGen Mobile Wholesale",
    description: "Pixel 8 Pro, Pixel 8 and Pixel Tablet units, factory unlocked. Atlanta, GA.",
    createdAt: "2025-01-20T09:15:00Z",
    devices: [
      { tac: "86204719", count: 6 },
      { tac: "86730155", count: 10 },
      { serialPrefix: "GTAB", count: 6 },
    ],
  },
  {
    orderNumber: "619284037152",
    client: "Meridian Electronics Corp.",
    description: "iPhone 15 and 10th generation iPad, mixed lot, unlocked. Miami, FL.",
    createdAt: "2025-02-05T10:00:00Z",
    devices: [
      { tac: "35930184", count: 12 },
      { serialPrefix: "IPAD", count: 8 },
    ],
  },
  {
    orderNumber: "204857391628",
    client: "SkyLine Telecom Partners",
    description: "iPhone 14 restocking order, carrier unlocked. Phoenix, AZ.",
    createdAt: "2025-03-10T08:30:00Z",
    devices: [{ tac: "35110297", count: 15 }],
    progress: { completed: 6, photographed: 2, scanned: 1 },
  },
  {
    orderNumber: "837465920183",
    client: "Primex Global Trade Inc.",
    description: "Galaxy S24 Plus and Galaxy Tab S9 mixed lot, factory unlocked. Chicago, IL.",
    createdAt: "2025-03-15T11:00:00Z",
    devices: [
      { tac: "35408371", count: 12 },
      { serialPrefix: "STAB", count: 6 },
    ],
    progress: { completed: 0, photographed: 0, scanned: 0 },
  },
];

/** The grade mix of a typical returns lot, plus the defects each grade implies. */
const GRADE_MIX: Array<{ grade: string; weight: number; defects: string[][] }> = [
  { grade: "A+", weight: 18, defects: [[]] },
  { grade: "A", weight: 32, defects: [[]] },
  {
    grade: "B+",
    weight: 22,
    defects: [["back-damage"], ["screen-crack"], ["button-stuck"], ["back-damage", "button-stuck"]],
  },
  {
    grade: "B",
    weight: 18,
    defects: [["battery-issue"], ["battery-issue", "back-damage"], ["camera-malfunction"]],
  },
  {
    grade: "C",
    weight: 10,
    defects: [
      ["screen-crack", "water-damage"],
      ["screen-crack", "camera-malfunction"],
      ["water-damage", "battery-issue", "back-damage"],
    ],
  },
];

const GRADE_NOTES: Record<string, string[]> = {
  "A+": [
    "Looks sealed, no wear at all under the inspection lamp.",
    "Flawless. Screen and frame are unmarked.",
  ],
  A: [
    "Light scuffing on the frame, glass is unmarked.",
    "Faint scratches on the back, screen is clean.",
  ],
  "B+": [
    "Wear you can see at arm length, everything works.",
    "Cosmetic marks only, every function passes.",
  ],
  B: [
    "Battery health is under 85 percent, otherwise sound.",
    "Heavy wear on the edges, refurbish it before resale.",
  ],
  C: [
    "Liquid indicator has gone off, so parts only.",
    "Display is cracked right through, cannot be resold as it is.",
  ],
};

// ---------------------------------------------------------------------------

export class InMemoryStorage implements Storage {
  private users: User[] = [];
  private orders: Order[] = [];
  private inspections: Inspection[] = [];
  private nextUserId = 1;
  private nextOrderId = 1;
  private nextInspectionId = 1;

  constructor() {
    this.seed();
  }

  // --- Seeding -------------------------------------------------------------

  private seed() {
    const demoUser = this.createUser("demo");

    for (const lot of LOTS) {
      const random = mulberry32(Number(lot.orderNumber.slice(-8)));
      const createdAt = new Date(lot.createdAt);
      const totalDevices = lot.devices.reduce((sum, group) => sum + group.count, 0);

      const order: Order = {
        id: this.nextOrderId++,
        orderNumber: lot.orderNumber,
        client: lot.client,
        description: lot.description,
        expectedQuantity: totalDevices,
        status: "active",
        createdBy: demoUser.id,
        createdAt,
        completedAt: null,
      };
      this.orders.push(order);

      // A lot with no progress block is finished history.
      const progress = lot.progress ?? {
        completed: totalDevices,
        photographed: 0,
        scanned: 0,
      };
      const worked = progress.completed + progress.photographed + progress.scanned;

      let index = 0;
      let serialCounter = Number(lot.orderNumber.slice(0, 5));
      for (const group of lot.devices) {
        for (let n = 0; n < group.count; n++, index++) {
          if (index >= worked) break;

          const deviceId = group.tac
            ? buildImei(group.tac, serialCounter++)
            : `${group.serialPrefix}${String(serialCounter++).padStart(8, "0")}`;

          const { grade, defects } = pickGrade(random);
          const noteOptions = GRADE_NOTES[grade] ?? [];
          const status: InspectionStatus =
            index < progress.completed
              ? "completed"
              : index < progress.completed + progress.photographed
                ? "photographed"
                : "scanning";

          const scannedAt = new Date(createdAt.getTime() + index * 4 * 60_000 + 3_600_000);
          this.inspections.push({
            id: this.nextInspectionId++,
            deviceId,
            idKind: group.tac ? "imei" : "serial",
            orderId: order.id,
            inspectorId: demoUser.id,
            specs: lookupDevice(deviceId),
            grade,
            defects,
            notes: noteOptions[Math.floor(random() * noteOptions.length)] ?? null,
            images:
              status === "scanning"
                ? []
                : [syntheticDevicePhoto(deviceId), syntheticDevicePhoto(`${deviceId}-back`)],
            status,
            scannedAt,
            photographedAt: status === "scanning" ? null : new Date(scannedAt.getTime() + 90_000),
            completedAt: status === "completed" ? new Date(scannedAt.getTime() + 150_000) : null,
          });
        }
      }

      this.refreshOrderStatus(order.id);

      // Older lots should look like they finished back then, not just now.
      if (order.status === "completed") {
        const finishedAt = this.inspections
          .filter((i) => i.orderId === order.id)
          .reduce((latest, i) => Math.max(latest, i.completedAt?.getTime() ?? 0), 0);
        order.completedAt = new Date(finishedAt);
      }
    }
  }

  // --- Users ---------------------------------------------------------------

  getUser(id: number): User | undefined {
    return this.users.find((user) => user.id === id);
  }

  getUserByUsername(username: string): User | undefined {
    const lowered = username.toLowerCase();
    return this.users.find((user) => user.username.toLowerCase() === lowered);
  }

  createUser(username: string): User {
    const user: User = {
      id: this.nextUserId++,
      username,
      role: "inspector",
      createdAt: new Date(),
    };
    this.users.push(user);
    return user;
  }

  // --- Orders --------------------------------------------------------------

  createOrder(input: CreateOrderInput & { createdBy: number }): Order {
    const order: Order = {
      id: this.nextOrderId++,
      orderNumber: input.orderNumber || this.generateOrderNumber(),
      client: input.client,
      description: input.description,
      expectedQuantity: input.expectedQuantity,
      status: "active",
      createdBy: input.createdBy,
      createdAt: new Date(),
      completedAt: null,
    };
    this.orders.push(order);
    return order;
  }

  private generateOrderNumber(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = String(Math.floor(100_000_000_000 + Math.random() * 900_000_000_000));
      if (!this.getOrderByNumber(candidate)) return candidate;
    }
    throw new Error("Could not allocate an unused order number");
  }

  getOrder(id: number): Order | undefined {
    return this.orders.find((order) => order.id === id);
  }

  getOrderByNumber(orderNumber: string): Order | undefined {
    return this.orders.find((order) => order.orderNumber === orderNumber);
  }

  summarize(order: Order): OrderSummary {
    const inspections = this.inspections.filter((i) => i.orderId === order.id);
    return {
      ...order,
      scannedCount: inspections.length,
      photographedCount: inspections.filter((i) => i.status !== "scanning").length,
      completedCount: inspections.filter((i) => i.status === "completed").length,
    };
  }

  listOrders(limit = 50): OrderSummary[] {
    return [...this.orders]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((order) => this.summarize(order));
  }

  updateOrder(id: number, input: UpdateOrderInput): Order | undefined {
    const order = this.getOrder(id);
    if (!order) return undefined;

    if (input.orderNumber !== undefined) order.orderNumber = input.orderNumber;
    if (input.client !== undefined) order.client = input.client;
    if (input.description !== undefined) order.description = input.description;
    if (input.expectedQuantity !== undefined) order.expectedQuantity = input.expectedQuantity;

    this.refreshOrderStatus(order.id);
    return order;
  }

  /**
   * An order is only complete once every expected device has been inspected
   * and every one of those inspections is finished. Not when the first one is.
   */
  private refreshOrderStatus(orderId: number) {
    const order = this.getOrder(orderId);
    if (!order) return;

    const inspections = this.inspections.filter((i) => i.orderId === orderId);
    const done =
      inspections.length >= order.expectedQuantity &&
      inspections.every((i) => i.status === "completed");

    if (done && order.status !== "completed") {
      order.status = "completed";
      order.completedAt = new Date();
    } else if (!done && order.status === "completed") {
      order.status = "active";
      order.completedAt = null;
    }
  }

  // --- Inspections ---------------------------------------------------------

  createInspection(input: CreateInspectionInput & { inspectorId: number }): Inspection {
    const parsed = parseDeviceId(input.deviceId);
    if (parsed.kind === "invalid") throw new Error(parsed.reason);

    let specs: DeviceSpecs | null = null;
    try {
      specs = lookupDevice(parsed.value);
    } catch {
      specs = null;
    }

    const inspection: Inspection = {
      id: this.nextInspectionId++,
      deviceId: parsed.value,
      idKind: parsed.kind,
      orderId: input.orderId,
      inspectorId: input.inspectorId,
      specs,
      grade: input.grade,
      defects: input.defects,
      notes: input.notes ?? null,
      images: [],
      status: "scanning",
      scannedAt: new Date(),
      photographedAt: null,
      completedAt: null,
    };
    this.inspections.push(inspection);
    this.refreshOrderStatus(input.orderId);
    return inspection;
  }

  getInspection(id: number): Inspection | undefined {
    return this.inspections.find((inspection) => inspection.id === id);
  }

  findInspection(orderId: number, deviceId: string): Inspection | undefined {
    const parsed = parseDeviceId(deviceId);
    const needle = parsed.kind === "invalid" ? deviceId.trim().toUpperCase() : parsed.value;
    return this.inspections.find((i) => i.orderId === orderId && i.deviceId === needle);
  }

  listInspections(orderId: number): Inspection[] {
    return this.inspections
      .filter((inspection) => inspection.orderId === orderId)
      .sort((a, b) => b.scannedAt.getTime() - a.scannedAt.getTime());
  }

  updateInspection(id: number, input: UpdateInspectionInput): Inspection | undefined {
    const inspection = this.getInspection(id);
    if (!inspection) return undefined;

    if (input.grade !== undefined) inspection.grade = input.grade;
    if (input.defects !== undefined) inspection.defects = input.defects;
    if (input.notes !== undefined) inspection.notes = input.notes;
    return inspection;
  }

  addImages(id: number, images: string[]): Inspection | undefined {
    const inspection = this.getInspection(id);
    if (!inspection) return undefined;

    inspection.images = [...inspection.images, ...images].slice(-MAX_IMAGES_PER_INSPECTION);
    if (inspection.status === "scanning") {
      inspection.status = "photographed";
      inspection.photographedAt = new Date();
    }
    return inspection;
  }

  completeInspection(id: number): Inspection | undefined {
    const inspection = this.getInspection(id);
    if (!inspection) return undefined;

    inspection.status = "completed";
    inspection.completedAt = new Date();
    if (!inspection.photographedAt) inspection.photographedAt = new Date();
    this.refreshOrderStatus(inspection.orderId);
    return inspection;
  }

  deleteInspection(id: number): boolean {
    const index = this.inspections.findIndex((inspection) => inspection.id === id);
    if (index === -1) return false;

    const [removed] = this.inspections.splice(index, 1);
    this.refreshOrderStatus(removed.orderId);
    return true;
  }
}

function pickGrade(random: () => number): { grade: string; defects: string[] } {
  const total = GRADE_MIX.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;
  for (const entry of GRADE_MIX) {
    roll -= entry.weight;
    if (roll <= 0) {
      const options = entry.defects;
      return { grade: entry.grade, defects: [...options[Math.floor(random() * options.length)]] };
    }
  }
  return { grade: "A", defects: [] };
}

export const storage = new InMemoryStorage();
