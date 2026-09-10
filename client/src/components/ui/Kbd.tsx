import { cn } from "../../lib/utils";

/** A keyboard shortcut, shown next to the control it drives. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-grid h-[18px] min-w-[18px] place-items-center rounded-[5px] px-1",
        "border border-line bg-surface-sunken",
        "font-sans text-[0.6875rem] font-semibold leading-none text-ink-tertiary",
        "transition-opacity duration-150",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
