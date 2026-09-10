import { cn } from "../../lib/utils";

/** The standard content container. A solid card on the page backdrop. */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg border border-line bg-surface shadow-sm", className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-heading text-ink">{title}</h2>
        {description && <p className="text-caption text-ink-tertiary mt-0.5">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const TONES = {
  neutral: "bg-ink/[0.06] text-ink-secondary",
  positive: "bg-positive-soft text-positive",
  caution: "bg-caution-soft text-caution",
  critical: "bg-critical-soft text-critical",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-accent-ink",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-caption font-semibold",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

/** A labelled value. Putting them close together does the work on its own. */
export function Stat({
  label,
  value,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-micro text-ink-tertiary">{label}</dt>
      <dd className="text-ink mt-1 numeric">{value}</dd>
    </div>
  );
}

/** Stands in for a region with nothing in it yet, always with a way forward. */
export function Empty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-lg bg-ink/[0.05] text-ink-tertiary">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-heading text-ink">{title}</p>
      {description && <p className="text-caption text-ink-tertiary mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** A loading state shaped like the content it stands in for. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "block animate-pulse rounded-sm bg-ink/[0.07] motion-reduce:animate-none",
        className,
      )}
    />
  );
}
