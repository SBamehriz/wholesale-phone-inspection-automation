import { GRADES } from "@shared/inspection";

import { cn } from "../lib/utils";
import { Kbd } from "./ui/Kbd";

/** Grade colours are the same everywhere. Badges, tables and the Excel export. */
export const GRADE_TONE: Record<string, string> = {
  "A+": "bg-positive-soft text-positive",
  A: "bg-positive-soft text-positive",
  "B+": "bg-caution-soft text-caution",
  B: "bg-caution-soft text-caution",
  C: "bg-critical-soft text-critical",
  "NA": "bg-ink/[0.06] text-ink-secondary",
};

/**
 * Grading is the decision you repeat most in a lot, so it costs one keystroke.
 * The options stay visible with their shortcut instead of hiding behind a
 * dropdown that costs a click and a read.
 */
export function GradePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (grade: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Condition grade" className="grid grid-cols-2 gap-1.5">
      {GRADES.map((grade, index) => {
        const selected = grade.value === value;
        return (
          <button
            key={grade.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(grade.value)}
            title={grade.hint}
            className={cn(
              "group flex flex-col items-start gap-0.5 rounded px-2.5 py-2 text-left",
              "border transition-[background-color,border-color,transform] duration-150 ease-standard",
              "active:scale-[0.97]",
              selected
                ? "border-accent bg-accent-soft"
                : "border-line bg-surface hover:border-line-strong",
            )}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span
                className={cn(
                  "rounded-sm px-1.5 py-0.5 text-caption font-bold numeric",
                  GRADE_TONE[grade.value],
                )}
              >
                {grade.value}
              </span>
              <Kbd className={selected ? "opacity-100" : "opacity-40 group-hover:opacity-100"}>
                {index + 1}
              </Kbd>
            </span>
            <span className="text-caption font-medium text-ink-secondary">{grade.label}</span>
          </button>
        );
      })}
    </div>
  );
}
