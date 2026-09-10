import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "./api";
import type { InspectionStatus } from "@shared/inspection";

export interface DeviceSpecs {
  brand: string;
  model: string;
  storage: string;
  color: string;
  releaseYear: number;
  source: "tac" | "serial-prefix" | "unknown";
}

export interface Order {
  id: number;
  orderNumber: string;
  client: string;
  description: string;
  expectedQuantity: number;
  status: "active" | "completed";
  createdAt: string;
  completedAt: string | null;
  scannedCount: number;
  photographedCount: number;
  completedCount: number;
}

export interface Inspection {
  id: number;
  deviceId: string;
  idKind: "imei" | "serial";
  orderId: number;
  specs: DeviceSpecs | null;
  grade: string | null;
  defects: string[];
  notes: string | null;
  images: string[];
  status: InspectionStatus;
  scannedAt: string;
  photographedAt: string | null;
  completedAt: string | null;
}

export const ordersKey = ["/api/orders"];
export const orderKey = (id: number) => ["/api/orders", id];

export function useOrders() {
  return useQuery<Order[]>({ queryKey: ordersKey });
}

export function useOrder(id: number | null) {
  return useQuery<{ order: Order; inspections: Inspection[] }>({
    queryKey: orderKey(id ?? 0),
    enabled: id !== null,
  });
}

// ---------------------------------------------------------------------------
// The order a station is currently working
// ---------------------------------------------------------------------------

const ACTIVE_ORDER_KEY = "phone-inspection.active-order";
const ACTIVE_ORDER_EVENT = "phone-inspection:active-order";

function readActiveOrderId(): number | null {
  try {
    const stored = Number(localStorage.getItem(ACTIVE_ORDER_KEY));
    return Number.isInteger(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

export function setActiveOrderId(id: number | null) {
  try {
    if (id === null) localStorage.removeItem(ACTIVE_ORDER_KEY);
    else localStorage.setItem(ACTIVE_ORDER_KEY, String(id));
  } catch {
    // Falling back to state in memory is fine. The event below still fires.
  }
  window.dispatchEvent(new CustomEvent(ACTIVE_ORDER_EVENT));
}

/**
 * Which order the scanning and photo stations are working on. It lives in
 * `localStorage` so a station survives a refresh halfway through a lot, and it
 * gets broadcast so every mounted view agrees without threading props through
 * the router.
 */
export function useActiveOrder() {
  const [id, setId] = useState<number | null>(readActiveOrderId);

  useEffect(() => {
    const sync = () => setId(readActiveOrderId());
    window.addEventListener(ACTIVE_ORDER_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ACTIVE_ORDER_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const query = useOrder(id);
  const select = useCallback((orderId: number | null) => setActiveOrderId(orderId), []);

  return {
    id,
    order: query.data?.order ?? null,
    inspections: query.data?.inspections ?? [],
    isLoading: id !== null && query.isLoading,
    /** The stored order is gone, so clear it rather than looping forever. */
    isMissing: id !== null && query.isError,
    select,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatDate(value: string | null): string {
  if (!value) return "Not yet";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function deviceName(specs: DeviceSpecs | null): string {
  if (!specs || specs.source === "unknown") return "Unidentified device";
  return `${specs.brand} ${specs.model}`;
}

export async function lookupDevice(deviceId: string) {
  return api<DeviceSpecs>("GET", `/api/devices/${encodeURIComponent(deviceId)}`);
}
