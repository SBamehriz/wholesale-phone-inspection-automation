import { motion } from "framer-motion";
import { BarChart3, LayoutGrid, LogOut, Moon, Package, ScanLine, Sun, SunMoon } from "lucide-react";
import { Link, useLocation } from "wouter";

import { useSignOut, type User } from "../lib/auth";
import { useActiveOrder } from "../lib/orders";
import { spring, useSpring } from "../lib/motion";
import { useTheme, type ThemePreference } from "../lib/theme";
import { cn } from "../lib/utils";
import { Button } from "./ui/Button";
import { Segmented } from "./ui/Segmented";

/** Named after what is inside them, rather than something vague like Home. */
const LINKS = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/orders", label: "Orders", icon: Package },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

const THEMES: Array<{ value: ThemePreference; label: React.ReactNode; title: string }> = [
  { value: "light", label: <Sun className="h-3.5 w-3.5" />, title: "Light" },
  { value: "system", label: <SunMoon className="h-3.5 w-3.5" />, title: "Match system" },
  { value: "dark", label: <Moon className="h-3.5 w-3.5" />, title: "Dark" },
];

export function Navigation({ user }: { user: User }) {
  const [location] = useLocation();
  const signOut = useSignOut();
  const { preference, setPreference } = useTheme();
  const { order } = useActiveOrder();
  const transition = useSpring(spring);

  const isActive = (href: string) => (href === "/" ? location === "/" : location.startsWith(href));

  return (
    <header className="material-bar sticky top-0 z-40 border-b border-line">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-sm bg-accent text-ink-on-accent">
            <ScanLine className="h-4 w-4" />
          </span>
          <span className="hidden text-heading sm:block">Inspection</span>
        </Link>

        <nav className="flex items-center gap-0.5" aria-label="Main">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative rounded-sm px-2.5 py-1.5 text-caption font-semibold transition-colors duration-150",
                  active ? "text-ink" : "text-ink-tertiary hover:text-ink-secondary",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    transition={transition}
                    className="absolute inset-0 rounded-sm bg-ink/[0.07]"
                  />
                )}
                <span className="relative flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* The station screens feel a bit like a mode, so the order you are
            working on stays visible from anywhere in the app. */}
        {order && (
          <Link
            href="/scan"
            className="hidden items-center gap-2 rounded-sm border border-line bg-surface px-2.5 py-1 lg:flex"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
            <span className="mono text-caption text-ink-secondary">{order.orderNumber}</span>
            <span className="text-caption text-ink-tertiary numeric">
              {order.completedCount}/{order.expectedQuantity}
            </span>
          </Link>
        )}

        <Segmented
          name="theme"
          size="sm"
          options={THEMES}
          value={preference}
          onChange={setPreference}
          className="hidden md:inline-flex"
        />

        <div className="flex items-center gap-1.5">
          <span
            className="grid h-7 w-7 place-items-center rounded-full bg-ink/[0.08] text-caption font-bold uppercase text-ink-secondary"
            title={user.username}
          >
            {user.username.charAt(0)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
