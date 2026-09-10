import { motion } from "framer-motion";

import type { Order } from "../lib/orders";
import { spring, useSpring } from "../lib/motion";
import { cn } from "../lib/utils";

/**
 * A lot moves through three states, and one bar shows all of them at once. How
 * much is finished, how much is photographed but not signed off, and how much
 * has only been scanned. Three numbers at a glance beat three separate counters.
 */
export function OrderProgress({
  order,
  size = "md",
  showLegend = false,
}: {
  order: Order;
  size?: "sm" | "md";
  showLegend?: boolean;
}) {
  const transition = useSpring(spring);
  const total = Math.max(order.expectedQuantity, order.scannedCount, 1);

  const segments = [
    { key: "done", value: order.completedCount, className: "bg-positive", label: "Complete" },
    {
      key: "photographed",
      value: order.photographedCount - order.completedCount,
      className: "bg-info",
      label: "Photographed",
    },
    {
      key: "scanned",
      value: order.scannedCount - order.photographedCount,
      className: "bg-caution",
      label: "Scanned",
    },
  ].filter((segment) => segment.value > 0);

  return (
    <div>
      <div
        className={cn(
          "flex w-full overflow-hidden rounded-full bg-ink/[0.08]",
          size === "sm" ? "h-1.5" : "h-2",
        )}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={order.expectedQuantity}
        aria-valuenow={order.completedCount}
        aria-label={`${order.completedCount} of ${order.expectedQuantity} devices complete`}
      >
        {segments.map((segment) => (
          <motion.span
            key={segment.key}
            className={segment.className}
            initial={false}
            animate={{ width: `${(segment.value / total) * 100}%` }}
            transition={transition}
          />
        ))}
      </div>

      {showLegend && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {[
            { label: "Complete", value: order.completedCount, className: "bg-positive" },
            {
              label: "Awaiting sign off",
              value: order.photographedCount - order.completedCount,
              className: "bg-info",
            },
            {
              label: "Needs photos",
              value: order.scannedCount - order.photographedCount,
              className: "bg-caution",
            },
            {
              label: "Not scanned",
              value: Math.max(0, order.expectedQuantity - order.scannedCount),
              className: "bg-ink/20",
            },
          ].map((entry) => (
            <span key={entry.label} className="text-caption text-ink-secondary flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", entry.className)} />
              {entry.label}
              <span className="text-ink font-semibold numeric">{entry.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
