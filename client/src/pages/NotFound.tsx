import { Link } from "wouter";

import { Button } from "../components/ui/Button";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <div className="text-center">
        <p className="text-display text-ink-tertiary/40 numeric">404</p>
        <h1 className="text-title text-ink mt-2">This page does not exist</h1>
        <p className="text-body text-ink-secondary mx-auto mt-1.5 max-w-xs">
          The link may be out of date, or the order it pointed at has been removed.
        </p>
        <Button variant="primary" className="mt-5" asChild>
          <Link href="/">Back to overview</Link>
        </Button>
      </div>
    </div>
  );
}
