import { ChevronLeft } from "lucide-react";
import { Link } from "wouter";

/** The page container. One gutter, defined once and used everywhere. */
export function Page({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div
      className={`mx-auto w-full px-4 pb-16 pt-7 sm:px-6 ${wide ? "max-w-6xl" : "max-w-4xl"}`}
    >
      {children}
    </div>
  );
}

/**
 * Tells you where you are and how to get out, on every screen, in the same
 * spot, so you stop having to wonder.
 */
export function PageHeader({
  title,
  description,
  back,
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link
          href={back.href}
          className="text-caption text-ink-tertiary mb-2 -ml-1 inline-flex items-center gap-0.5 font-medium transition-colors hover:text-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-display text-ink">{title}</h1>
          {description && <p className="text-body text-ink-secondary mt-1">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
