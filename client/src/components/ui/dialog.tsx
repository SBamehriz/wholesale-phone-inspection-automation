import * as Primitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import { cn } from "../../lib/utils";
import { spring, useSpring } from "../../lib/motion";

/**
 * A modal task. The surface arrives as glass, blurring and scaling together
 * rather than just fading, over a scrim that pushes the page back. It leaves
 * the same way it came in.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const transition = useSpring(spring);

  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Primitive.Portal forceMount>
            <Primitive.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-50 bg-[hsl(var(--material-overlay))] backdrop-blur-[2px]"
              />
            </Primitive.Overlay>

            <Primitive.Content asChild forceMount>
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 8, filter: "blur(6px)" }}
                animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.97, y: 6, filter: "blur(4px)" }}
                transition={transition}
                className={cn(
                  "material-sheet fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md",
                  "-translate-x-1/2 -translate-y-1/2 rounded-xl p-5",
                  "max-h-[calc(100vh-4rem)] overflow-y-auto",
                  className,
                )}
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <Primitive.Title className="text-title text-ink">{title}</Primitive.Title>
                    {description && (
                      <Primitive.Description className="text-caption text-ink-secondary mt-1">
                        {description}
                      </Primitive.Description>
                    )}
                  </div>
                  <Primitive.Close
                    className="-m-1.5 rounded p-1.5 text-ink-tertiary transition-colors hover:bg-ink/[0.06] hover:text-ink"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </Primitive.Close>
                </div>

                {children}

                {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
              </motion.div>
            </Primitive.Content>
          </Primitive.Portal>
        )}
      </AnimatePresence>
    </Primitive.Root>
  );
}
