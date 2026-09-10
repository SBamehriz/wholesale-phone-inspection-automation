import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const button = cva(
  [
    "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded",
    "font-semibold tracking-[-0.01em] select-none",
    // Feedback is instant on press, and it looks the same on touch and mouse.
    "transition-[transform,background-color,color,border-color,opacity] duration-150 ease-standard",
    "active:scale-[0.975]",
    "disabled:pointer-events-none disabled:opacity-40",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: "bg-accent text-ink-on-accent hover:bg-accent-hover shadow-sm",
        secondary: "bg-surface text-ink border border-line hover:border-line-strong shadow-sm",
        ghost: "text-ink-secondary hover:text-ink hover:bg-ink/[0.05]",
        quiet: "text-accent-ink hover:bg-accent-soft",
        danger: "text-critical hover:bg-critical-soft",
      },
      size: {
        sm: "h-8 px-3 text-[0.8125rem]",
        md: "h-10 px-4 text-[0.875rem]",
        lg: "h-12 px-5 text-[0.9375rem]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, type = "button", ...props }, ref) => {
    const Component = asChild ? Slot : "button";
    return (
      <Component
        ref={ref}
        type={asChild ? undefined : type}
        className={cn(button({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
