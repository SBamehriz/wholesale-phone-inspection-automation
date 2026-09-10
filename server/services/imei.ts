import { imeiCheckDigit, isValidImei, parseDeviceId } from "../../shared/inspection";

/**
 * Working out what a device is.
 *
 * The first eight digits of an IMEI are the Type Allocation Code, and that
 * tells you the exact model. A real deployment would query a paid TAC database
 * or a carrier API right here. This build ships a local catalogue with the same
 * lookup shape, so putting a network call in means replacing one function.
 */

export interface DeviceSpecs {
  brand: string;
  model: string;
  storage: string;
  color: string;
  releaseYear: number;
  /** Where the identification came from, so the UI can be honest about it. */
  source: "tac" | "serial-prefix" | "unknown";
}

interface CatalogEntry {
  brand: string;
  model: string;
  releaseYear: number;
  storage: string[];
  colors: string[];
}

/** Maps a TAC prefix to a model. The keys are the first 8 digits of an IMEI. */
const TAC_CATALOG: Record<string, CatalogEntry> = {
  "35674108": {
    brand: "Apple",
    model: "iPhone 15 Pro",
    releaseYear: 2023,
    storage: ["128 GB", "256 GB", "512 GB", "1 TB"],
    colors: ["Black Titanium", "White Titanium", "Natural Titanium", "Blue Titanium"],
  },
  "35930184": {
    brand: "Apple",
    model: "iPhone 15",
    releaseYear: 2023,
    storage: ["128 GB", "256 GB", "512 GB"],
    colors: ["Black", "Blue", "Green", "Yellow", "Pink"],
  },
  "35110297": {
    brand: "Apple",
    model: "iPhone 14",
    releaseYear: 2022,
    storage: ["128 GB", "256 GB", "512 GB"],
    colors: ["Midnight", "Starlight", "Blue", "Purple", "Product RED"],
  },
  "35291840": {
    brand: "Samsung",
    model: "Galaxy S24 Ultra",
    releaseYear: 2024,
    storage: ["256 GB", "512 GB", "1 TB"],
    colors: ["Titanium Black", "Titanium Gray", "Titanium Violet", "Titanium Yellow"],
  },
  "35408371": {
    brand: "Samsung",
    model: "Galaxy S24+",
    releaseYear: 2024,
    storage: ["256 GB", "512 GB"],
    colors: ["Onyx Black", "Marble Gray", "Cobalt Violet", "Amber Yellow"],
  },
  "86204719": {
    brand: "Google",
    model: "Pixel 8 Pro",
    releaseYear: 2023,
    storage: ["128 GB", "256 GB", "512 GB"],
    colors: ["Obsidian", "Porcelain", "Bay"],
  },
  "86730155": {
    brand: "Google",
    model: "Pixel 8",
    releaseYear: 2023,
    storage: ["128 GB", "256 GB"],
    colors: ["Obsidian", "Hazel", "Rose", "Mint"],
  },
  "86119240": {
    brand: "OnePlus",
    model: "12",
    releaseYear: 2024,
    storage: ["256 GB", "512 GB"],
    colors: ["Silky Black", "Flowy Emerald"],
  },
};

/** Serial prefixes for WiFi only devices, which have no IMEI at all. */
const SERIAL_CATALOG: Record<string, CatalogEntry> = {
  GTAB: {
    brand: "Google",
    model: "Pixel Tablet",
    releaseYear: 2023,
    storage: ["128 GB", "256 GB"],
    colors: ["Porcelain", "Hazel", "Rose"],
  },
  IPAD: {
    brand: "Apple",
    model: "iPad 10th generation",
    releaseYear: 2022,
    storage: ["64 GB", "256 GB"],
    colors: ["Silver", "Blue", "Pink", "Yellow"],
  },
  STAB: {
    brand: "Samsung",
    model: "Galaxy Tab S9",
    releaseYear: 2023,
    storage: ["128 GB", "256 GB"],
    colors: ["Graphite", "Beige"],
  },
};

/**
 * Picks a variant out of the identifier itself, so the same device ID always
 * gives the same storage and colour across restarts and across reports.
 */
function variantFor(entry: CatalogEntry, id: string): DeviceSpecs {
  // FNV-1a with a final avalanche, so IMEIs issued back to back in one lot
  // still spread out across the available colours and capacities.
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619) >>> 0;
  }
  hash = (hash ^ (hash >>> 15)) >>> 0;
  return {
    brand: entry.brand,
    model: entry.model,
    releaseYear: entry.releaseYear,
    storage: entry.storage[hash % entry.storage.length],
    color: entry.colors[Math.floor(hash / entry.storage.length) % entry.colors.length],
    source: "tac",
  };
}

/** Builds an IMEI with a valid checksum out of a TAC and a serial number. */
export function buildImei(tac: string, serial: number): string {
  const prefix = `${tac}${String(serial).padStart(6, "0")}`.slice(0, 14);
  return prefix + imeiCheckDigit(prefix);
}

export function lookupDevice(rawId: string): DeviceSpecs {
  const parsed = parseDeviceId(rawId);
  if (parsed.kind === "invalid") throw new Error(parsed.reason);

  if (parsed.kind === "imei") {
    const entry = TAC_CATALOG[parsed.value.slice(0, 8)];
    if (entry) return variantFor(entry, parsed.value);
    return {
      brand: "Unknown",
      model: "Unrecognised TAC",
      storage: "Unknown",
      color: "Unknown",
      releaseYear: 0,
      source: "unknown",
    };
  }

  const prefix = parsed.value.slice(0, 4);
  const entry = SERIAL_CATALOG[prefix];
  if (entry) return { ...variantFor(entry, parsed.value), source: "serial-prefix" };
  return {
    brand: "Unknown",
    model: "Unrecognised serial",
    storage: "Unknown",
    color: "Unknown",
    releaseYear: 0,
    source: "unknown",
  };
}

export { isValidImei };
