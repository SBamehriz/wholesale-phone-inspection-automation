import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, Info, X } from "lucide-react";

import { cn } from "../../lib/utils";
import { springLively, useSpring } from "../../lib/motion";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
}

interface ToastApi {
  success: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS = { success: Check, error: AlertTriangle, info: Info };
const TONES = {
  success: "text-positive",
  error: "text-critical",
  info: "text-info",
} as const;

const LIFETIME = 4200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const transition = useSpring(springLively);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const api = useMemo<ToastApi>(() => {
    const push = (tone: ToastTone) => (title: string, detail?: string) => {
      const id = nextId.current++;
      // Only the newest few are worth showing. Older ones have been read or missed.
      setToasts((current) => [...current.slice(-2), { id, tone, title, detail }]);
      window.setTimeout(() => dismiss(id), LIFETIME);
    };
    return { success: push("success"), error: push("error"), info: push("info") };
  }, [dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
        role="region"
        aria-label="Notifications"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const Icon = ICONS[toast.tone];
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={transition}
                role={toast.tone === "error" ? "alert" : "status"}
                className="material-sheet pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg px-3.5 py-3"
              >
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", TONES[toast.tone])} />
                <div className="min-w-0 flex-1">
                  <p className="text-body font-semibold text-ink">{toast.title}</p>
                  {toast.detail && (
                    <p className="text-caption text-ink-secondary mt-0.5">{toast.detail}</p>
                  )}
                </div>
                <button
                  onClick={() => dismiss(toast.id)}
                  className="-m-1 rounded p-1 text-ink-tertiary transition-colors hover:text-ink"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}
