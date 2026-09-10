import { Check } from "lucide-react";
import { DEFECTS } from "@shared/inspection";

import { cn } from "../lib/utils";
import { Kbd } from "./ui/Kbd";

/**
 * Defects are toggles rather than a multi select. Every option stays visible
 * with its shortcut, so a cracked screen plus a dead battery is two keystrokes
 * and no menu.
 */
export function DefectPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (defects: string[]) => void;
}) {
  const toggle = (defect: string) =>
    onChange(value.includes(defect) ? value.filter((d) => d !== defect) : [...value, defect]);

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {DEFECTS.map((defect) => {
        const selected = value.includes(defect.value);
        return (
          <button
            key={defect.value}
            type="button"
            role="checkbox"
            aria-checked={selected}
            onClick={() => toggle(defect.value)}
            className={cn(
              "group flex items-center gap-2 rounded px-2.5 py-2 text-left",
              "border transition-[background-color,border-color,transform] duration-150 ease-standard",
              "active:scale-[0.97]",
              selected
                ? "border-critical/40 bg-critical-soft"
                : "border-line bg-surface hover:border-line-strong",
            )}
          >
            <span
              className={cn(
                "grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border transition-colors duration-150",
                selected ? "border-critical bg-critical text-white" : "border-line-strong",
              )}
            >
              {selected && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 text-caption font-medium leading-tight",
                selected ? "text-critical" : "text-ink-secondary",
              )}
            >
              {defect.label}
            </span>
            <Kbd className={selected ? "opacity-100" : "opacity-40 group-hover:opacity-100"}>
              {defect.key.toUpperCase()}
            </Kbd>
          </button>
        );
      })}
    </div>
  );
}
