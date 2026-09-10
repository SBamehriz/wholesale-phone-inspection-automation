import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Package, Plus, Search } from "lucide-react";
import { Link } from "wouter";

import { OrderProgress } from "../components/OrderProgress";
import { Page, PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Field";
import { Segmented } from "../components/ui/Segmented";
import { Badge, Card, Empty, Skeleton } from "../components/ui/Surface";
import { spring, useRise, useSpring, useStagger } from "../lib/motion";
import { formatDate, useOrders } from "../lib/orders";

type Filter = "all" | "active" | "completed";

const FILTERS = [
  { value: "all" as const, label: "All" },
  { value: "active" as const, label: "In progress" },
  { value: "completed" as const, label: "Complete" },
];

export default function Orders() {
  const { data: orders = [], isLoading } = useOrders();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const stagger = useStagger(0.02);
  const rise = useRise(6);
  const transition = useSpring(spring);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders.filter((order) => {
      if (filter !== "all" && order.status !== filter) return false;
      if (!needle) return true;
      return (
        order.orderNumber.includes(needle) ||
        order.client.toLowerCase().includes(needle) ||
        order.description.toLowerCase().includes(needle)
      );
    });
  }, [orders, query, filter]);

  return (
    <Page wide>
      <PageHeader
        title="Orders"
        description="Each lot received, and how far through inspection it is."
        actions={
          <Button variant="primary" asChild>
            <Link href="/orders/new">
              <Plus className="h-4 w-4" />
              New order
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by client or order number"
            aria-label="Search orders"
            className="pl-9"
          />
        </div>
        <Segmented name="order-filter" options={FILTERS} value={filter} onChange={setFilter} />
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((row) => (
            <Card key={row} className="space-y-3 p-5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-2 w-full" />
            </Card>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <Empty
            icon={Package}
            title={orders.length === 0 ? "No orders yet" : "Nothing matches"}
            description={
              orders.length === 0
                ? "Create an order to start scanning devices into a lot."
                : "Try a different search term or filter."
            }
            action={
              orders.length === 0 ? (
                <Button variant="primary" asChild>
                  <Link href="/orders/new">
                    <Plus className="h-4 w-4" />
                    New order
                  </Link>
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <motion.ul
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="grid gap-3 sm:grid-cols-2"
        >
          {visible.map((order) => (
            <motion.li key={order.id} variants={rise} transition={transition} className="min-w-0">
              <Link href={`/orders/${order.id}`}>
                <Card className="h-full p-5 transition-[border-color,transform] duration-200 ease-standard hover:border-line-strong active:scale-[0.995]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-heading truncate text-ink">{order.client}</p>
                      <p className="mono text-caption text-ink-tertiary mt-0.5">
                        {order.orderNumber}
                      </p>
                    </div>
                    <Badge
                      tone={order.status === "completed" ? "positive" : "caution"}
                      className="shrink-0"
                    >
                      {order.status === "completed" ? "Complete" : "In progress"}
                    </Badge>
                  </div>

                  <p className="text-caption text-ink-secondary mt-2 line-clamp-2 min-h-[2.1em]">
                    {order.description || "No description"}
                  </p>

                  <div className="mt-4">
                    <div className="text-caption text-ink-tertiary mb-1.5 flex items-baseline justify-between">
                      <span>{formatDate(order.createdAt)}</span>
                      <span className="numeric">
                        <span className="text-ink font-semibold">{order.completedCount}</span>
                        {" / "}
                        {order.expectedQuantity} devices
                      </span>
                    </div>
                    <OrderProgress order={order} size="sm" />
                  </div>
                </Card>
              </Link>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </Page>
  );
}
