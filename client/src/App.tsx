import { QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Route, Switch, useLocation } from "wouter";

import { ErrorBoundary } from "./components/ErrorBoundary";
import { Navigation } from "./components/Navigation";
import { ToastProvider } from "./components/ui/Toast";
import { queryClient } from "./lib/api";
import { useAuth } from "./lib/auth";
import { spring, useRise, useSpring } from "./lib/motion";
import { ThemeProvider } from "./lib/theme";

import Dashboard from "./pages/Dashboard";
import NewOrder from "./pages/NewOrder";
import NotFound from "./pages/NotFound";
import OrderDetail from "./pages/OrderDetail";
import Orders from "./pages/Orders";
import PhotoStation from "./pages/PhotoStation";
import Reports from "./pages/Reports";
import ScanStation from "./pages/ScanStation";
import SignIn from "./pages/SignIn";

function Routes() {
  const [location] = useLocation();
  const rise = useRise(6);
  const transition = useSpring(spring);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.main
        key={location}
        variants={rise}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={transition}
      >
        <Switch location={location}>
          <Route path="/" component={Dashboard} />
          <Route path="/orders" component={Orders} />
          <Route path="/orders/new" component={NewOrder} />
          <Route path="/orders/:id" component={OrderDetail} />
          <Route path="/scan" component={ScanStation} />
          <Route path="/photos" component={PhotoStation} />
          <Route path="/reports" component={Reports} />
          <Route component={NotFound} />
        </Switch>
      </motion.main>
    </AnimatePresence>
  );
}

function Shell() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg">
        <span className="sr-only">Loading</span>
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent motion-reduce:animate-none" />
      </div>
    );
  }

  if (!user) return <SignIn />;

  return (
    <div className="min-h-screen bg-bg">
      <Navigation user={user} />
      <Routes />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <Shell />
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
