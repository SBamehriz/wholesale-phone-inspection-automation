import { forwardRef, useId } from "react";

import { cn } from "../../lib/utils";

const control = [
  "w-full rounded bg-surface text-ink placeholder:text-ink-tertiary",
  "border border-line shadow-sm",
  "transition-[border-color,box-shadow] duration-150 ease-standard",
  "hover:border-line-strong",
  "focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/20",
  "disabled:opacity-50 disabled:cursor-not-allowed",
].join(" ");

export interface FieldProps {
  label: string;
  /** Shown under the control while it is valid. */
  hint?: string;
  /** Takes the place of the hint and marks the control invalid. */
  error?: string;
  /** Sits on the right of the label row, usually a keyboard shortcut. */
  aside?: React.ReactNode;
  children: (props: { id: string; "aria-describedby": string; "aria-invalid": boolean }) => React.ReactNode;
}

/**
 * A label, a control and its message, grouped so the message always sits next
 * to the thing it is about. Validation shows up inline as you type, rather
 * than being saved up until you hit submit.
 */
export function Field({ label, hint, error, aside, children }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-caption font-semibold text-ink-secondary">
          {label}
        </label>
        {aside}
      </div>
      {children({ id, "aria-describedby": message ? messageId : "", "aria-invalid": !!error })}
      {message && (
        <p
          id={messageId}
          className={cn("text-caption", error ? "text-critical" : "text-ink-tertiary")}
          role={error ? "alert" : undefined}
        >
          {message}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(control, "h-10 px-3 text-body", props["aria-invalid"] && "border-critical", className)}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(control, "min-h-[84px] resize-y px-3 py-2 text-body", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";
