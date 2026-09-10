/**
 * The words this app uses for grades, defects and IMEIs.
 *
 * The client, the API and the report generator all import this file, so a
 * grade means the same thing in the scanning form, in the store and in the
 * spreadsheet you hand the buyer.
 */

export const GRADES = [
  { value: "A+", label: "Mint", hint: "No visible wear" },
  { value: "A", label: "Excellent", hint: "Light marks only" },
  { value: "B+", label: "Good", hint: "Visible wear, fully working" },
  { value: "B", label: "Fair", hint: "Heavy wear or minor faults" },
  { value: "C", label: "Poor", hint: "Cracked, faulty or damaged" },
  { value: "NA", label: "Ungraded", hint: "Cannot be assessed" },
] as const;

export const GRADE_VALUES = GRADES.map((g) => g.value) as readonly string[];

export const DEFECTS = [
  { value: "screen-crack", label: "Screen crack", key: "s" },
  { value: "back-damage", label: "Back damage", key: "b" },
  { value: "battery-issue", label: "Battery issue", key: "y" },
  { value: "camera-malfunction", label: "Camera fault", key: "c" },
  { value: "button-stuck", label: "Button fault", key: "u" },
  { value: "water-damage", label: "Water damage", key: "w" },
  { value: "missing-pen", label: "Missing pen", key: "p" },
  { value: "missing-sim-slot", label: "Missing SIM tray", key: "m" },
] as const;

export const DEFECT_VALUES = DEFECTS.map((d) => d.value) as readonly string[];

const DEFECT_LABELS = new Map(DEFECTS.map((d) => [d.value as string, d.label]));

export function defectLabel(value: string): string {
  return DEFECT_LABELS.get(value) ?? value.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
}

const INSPECTION_STATUSES = ["scanning", "photographed", "completed"] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const MAX_IMAGES_PER_INSPECTION = 6;

// ---------------------------------------------------------------------------
// IMEI
// ---------------------------------------------------------------------------

/**
 * Every real IMEI ends in a Luhn check digit. Checking it right here catches
 * a mistyped or misread digit while the inspector is still holding the phone,
 * instead of letting the wrong device into the order.
 */
export function isValidImei(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false;

  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let digit = imei.charCodeAt(i) - 48;
    // Double every second digit, counting from the right.
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Works out the check digit that makes a 14 digit IMEI prefix valid. */
export function imeiCheckDigit(prefix14: string): number {
  if (!/^\d{14}$/.test(prefix14)) throw new Error("Expected 14 digits");

  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let digit = prefix14.charCodeAt(i) - 48;
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Cleans up whatever the barcode scanner sent before anything tries to read it.
 *
 * Scanners are not consistent. Some send the bare digits, some send the label
 * printed next to the code first, and some pad the whole thing with spaces or
 * a trailing newline. Letters and dashes survive, because the serial on a
 * WiFi tablet needs them.
 */
export function normalizeScan(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/^(?:IMEI|MEID|ESN|SN|S\/N)\s*[:#]?\s*/, "")
    .replace(/[\s\u00a0]/g, "")
    .slice(0, 20);
}

// ---------------------------------------------------------------------------
// Device identifiers
// ---------------------------------------------------------------------------

export type DeviceIdKind = "imei" | "serial";

export interface DeviceId {
  kind: DeviceIdKind;
  value: string;
}

/**
 * A wholesale lot mixes phones with WiFi only tablets, so a scan is either a
 * 15 digit IMEI or a serial from the manufacturer. Working out which one it is
 * right here means nobody has to pick a type from a dropdown first.
 */
export function parseDeviceId(raw: string): DeviceId | { kind: "invalid"; reason: string } {
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return { kind: "invalid", reason: "Scan or type a device ID" };

  const digitsOnly = /^\d+$/.test(trimmed);
  if (digitsOnly) {
    if (trimmed.length !== 15) {
      return { kind: "invalid", reason: `An IMEI is 15 digits, and this one is ${trimmed.length}` };
    }
    if (!isValidImei(trimmed)) {
      return { kind: "invalid", reason: "Checksum failed, so a digit was misread or mistyped" };
    }
    return { kind: "imei", value: trimmed };
  }

  if (!/^[A-Z0-9-]{6,20}$/.test(trimmed)) {
    return { kind: "invalid", reason: "A serial is 6 to 20 letters, digits or dashes" };
  }
  return { kind: "serial", value: trimmed };
}
