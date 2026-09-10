import { motion } from "framer-motion";

import { cn } from "../../lib/utils";
import { spring, useSpring } from "../../lib/motion";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Read out by a screen reader when the label is only an icon. */
  title?: string;
}

/**
 * A segmented control. The selection indicator is a shared layout element, so
 * moving between options slides the highlight from wherever it currently sits
 * rather than cross fading two boxes.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  name,
  className,
  size = "md",
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Keeps this shared layout animation apart from other controls on the page. */
  name: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const transition = useSpring(spring);

  return (
    <div
      role="radiogroup"
      className={cn(
        "inline-flex items-center gap-0.5 rounded p-0.5",
        "border border-line bg-surface-sunken",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title}
            aria-label={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative rounded-sm font-semibold transition-colors duration-150",
              size === "sm" ? "px-2 py-1 text-caption" : "px-3 py-1.5 text-caption",
              selected ? "text-ink" : "text-ink-tertiary hover:text-ink-secondary",
            )}
          >
            {selected && (
              <motion.span
                layoutId={`segmented-${name}`}
                transition={transition}
                className="absolute inset-0 rounded-sm bg-surface shadow-sm"
              />
            )}
            <span className="relative flex items-center gap-1.5">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
