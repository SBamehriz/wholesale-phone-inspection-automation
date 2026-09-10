import { motion } from "framer-motion";
import { ArrowRight, Camera, CheckCircle2, Package, Plus, ScanLine, Smartphone } from "lucide-react";
import { Link, useLocation } from "wouter";

import { OrderProgress } from "../components/OrderProgress";
import { Page, PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/button";
import { Badge, Card, CardHeader, Empty, Skeleton } from "../components/ui/Surface";
import { spring, useRise, useSpring, useStagger } from "../lib/motion";
import { formatDate, setActiveOrderId, useOrders, type Order } from "../lib/orders";

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { data: orders = [], isLoading } = useOrders();
  const stagger = useStagger();
  const rise = useRise();
  const transition = useSpring(spring);

  const active = orders.filter((order) => order.status === "active");
  const devices = orders.reduce((sum, order) => sum + order.expectedQuantity, 0);
  const inspected = orders.reduce((sum, order) => sum + order.completedCount, 0);

  const stats = [
    { label: "Open orders", value: active.length, icon: Package },
    { label: "Devices in scope", value: devices, icon: Smartphone },
    { label: "Devices signed off", value: inspected, icon: CheckCircle2 },
  ];

  // Pick up where the work actually is, meaning the order with devices left.
  const resume = active.find((order) => order.scannedCount > 0) ?? active[0];

  const start = (order: Order, to: string) => {
    setActiveOrderId(order.id);
    navigate(to);
  };

  return (
    <Page wide>
      <PageHeader
        title="Overview"
        description="Every lot on the floor, and where each one stands."
        actions={
          <Button variant="primary" asChild>
            <Link href="/orders/new">
              <Plus className="h-4 w-4" />
              New order
            </Link>
          </Button>
        }
      />

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="grid gap-3 sm:grid-cols-3"
      >
        {stats.map(({ label, value, icon: Icon }) => (
          <motion.div key={label} variants={rise} transition={transition}>
            <Card className="flex items-center gap-3 px-4 py-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-ink/[0.05] text-ink-secondary">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-caption text-ink-tertiary">{label}</p>
                <p className="text-title text-ink numeric">
                  {isLoading ? <Skeleton className="mt-1 h-5 w-10" /> : value}
                </p>
              </div>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* The two stations are where the real work happens, so they get the
          top slot, each one tied to the lot it would open. */}
      {resume && (
        <motion.div
          variants={rise}
          initial="hidden"
          animate="visible"
          transition={transition}
          className="mt-3"
        >
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-4 px-5 pb-4 pt-4">
              <div className="min-w-0">
                <p className="text-micro text-ink-tertiary">Continue</p>
                <p className="text-title text-ink mt-1 truncate">{resume.client}</p>
                <p className="text-caption text-ink-tertiary mt-0.5">
                  <span className="mono">{resume.orderNumber}</span>, {resume.expectedQuantity}{" "}
                  devices
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => start(resume, "/photos")}>
                  <Camera className="h-4 w-4" />
                  Photos
                </Button>
                <Button variant="primary" onClick={() => start(resume, "/scan")}>
                  <ScanLine className="h-4 w-4" />
                  Scan devices
                </Button>
              </div>
            </div>
            <div className="px-5 pb-4">
              <OrderProgress order={resume} showLegend />
            </div>
          </Card>
        </motion.div>
      )}

      <Card className="mt-3 overflow-hidden">
        <CardHeader
          title="Recent orders"
          action={
            <Button variant="quiet" size="sm" asChild>
              <Link href="/orders">
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        />

        {isLoading ? (
          <div className="space-y-4 border-t border-line px-5 py-4">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-sm" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
                <Skeleton className="h-2 w-24" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="border-t border-line">
            <Empty
              icon={Package}
              title="No orders yet"
              description="Create an order to start scanning devices into a lot."
              action={
                <Button variant="primary" asChild>
                  <Link href="/orders/new">
                    <Plus className="h-4 w-4" />
                    New order
                  </Link>
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {orders.slice(0, 5).map((order) => (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.id}`}
                  className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-ink/[0.03]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-body truncate font-semibold text-ink">{order.client}</p>
                      <Badge tone={order.status === "completed" ? "positive" : "caution"}>
                        {order.status === "completed" ? "Complete" : "In progress"}
                      </Badge>
                    </div>
                    <p className="text-caption text-ink-tertiary mt-0.5">
                      <span className="mono">{order.orderNumber}</span>,{" "}
                      {formatDate(order.createdAt)}
                    </p>
                  </div>
                  <div className="hidden w-40 shrink-0 sm:block">
                    <OrderProgress order={order} size="sm" />
                    <p className="text-caption text-ink-tertiary mt-1 text-right numeric">
                      {order.completedCount}/{order.expectedQuantity}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}
