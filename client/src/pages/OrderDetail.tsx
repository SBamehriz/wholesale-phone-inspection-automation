import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  CheckCircle2,
  Download,
  Loader2,
  Pencil,
  ScanLine,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { defectLabel } from "@shared/inspection";

import { GRADE_TONE } from "../components/GradePicker";
import { OrderProgress } from "../components/OrderProgress";
import { Page, PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { Field, Input, Textarea } from "../components/ui/Field";
import { Badge, Card, Empty, Skeleton, Stat } from "../components/ui/Surface";
import { useToast } from "../components/ui/toast";
import { api, download } from "../lib/api";
import { spring, useSpring } from "../lib/motion";
import {
  deviceName,
  formatDate,
  orderKey,
  ordersKey,
  setActiveOrderId,
  useOrder,
  type Inspection,
  type Order,
} from "../lib/orders";
import { cn } from "../lib/utils";

export default function OrderDetail() {
  const [, params] = useRoute("/orders/:id");
  const [, navigate] = useLocation();
  const orderId = Number(params?.id);
  const { data, isLoading, isError } = useOrder(Number.isInteger(orderId) ? orderId : null);
  const client = useQueryClient();
  const toast = useToast();
  const transition = useSpring(spring);

  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const order = data?.order;
  const inspections = data?.inspections ?? [];

  const gradeMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const inspection of inspections) {
      const grade = inspection.grade ?? "NA";
      counts.set(grade, (counts.get(grade) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [inspections]);

  const remove = useMutation({
    mutationFn: (id: number) => api<void>("DELETE", `/api/inspections/${id}`),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: orderKey(orderId) });
      client.invalidateQueries({ queryKey: ordersKey });
      toast.info("Device removed");
    },
    onError: (error: Error) => toast.error("Could not remove", error.message),
  });

  const exportReport = async () => {
    setExporting(true);
    try {
      const filename = await download(`/api/orders/${orderId}/report.xlsx`);
      toast.success("Report downloaded", filename);
    } catch (error) {
      toast.error("Export failed", (error as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const openStation = (path: string) => {
    setActiveOrderId(orderId);
    navigate(path);
  };

  if (isLoading) {
    return (
      <Page wide>
        <div className="space-y-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </Page>
    );
  }

  if (isError || !order) {
    return (
      <Page>
        <PageHeader title="Order" back={{ href: "/orders", label: "Orders" }} />
        <Card>
          <Empty
            icon={Smartphone}
            title="Order not found"
            description="It may have been removed, or the link is wrong."
            action={
              <Button variant="primary" onClick={() => navigate("/orders")}>
                Back to orders
              </Button>
            }
          />
        </Card>
      </Page>
    );
  }

  return (
    <Page wide>
      <PageHeader
        title={order.client}
        description={
          <span className="mono text-caption text-ink-tertiary">{order.orderNumber}</span>
        }
        back={{ href: "/orders", label: "Orders" }}
        actions={
          <>
            <Button variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
            <Button variant="secondary" onClick={exportReport} disabled={exporting}>
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export
            </Button>
            <Button variant="secondary" onClick={() => openStation("/photos")}>
              <Camera className="h-4 w-4" />
              Photos
            </Button>
            <Button variant="primary" onClick={() => openStation("/scan")}>
              <ScanLine className="h-4 w-4" />
              Scan
            </Button>
          </>
        }
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="px-5 py-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Badge tone={order.status === "completed" ? "positive" : "caution"}>
              {order.status === "completed" ? "Complete" : "In progress"}
            </Badge>
            <span className="text-caption text-ink-tertiary numeric">
              {order.completedCount} of {order.expectedQuantity} signed off
            </span>
          </div>
          <OrderProgress order={order} showLegend />

          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Expected" value={order.expectedQuantity} />
            <Stat label="Scanned" value={order.scannedCount} />
            <Stat label="Received" value={formatDate(order.createdAt)} />
            <Stat label="Completed" value={formatDate(order.completedAt)} />
          </dl>

          {order.description && (
            <p className="text-caption text-ink-secondary mt-4 border-t border-line pt-4">
              {order.description}
            </p>
          )}
        </Card>

        <Card className="px-5 py-4">
          <h2 className="text-heading text-ink mb-3">Grade mix</h2>
          {gradeMix.length === 0 ? (
            <p className="text-caption text-ink-tertiary">Nothing graded yet.</p>
          ) : (
            <ul className="space-y-2">
              {gradeMix.map(([grade, count]) => (
                <li key={grade} className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "w-9 shrink-0 rounded-sm py-0.5 text-center text-caption font-bold numeric",
                      GRADE_TONE[grade],
                    )}
                  >
                    {grade}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.07]">
                    <motion.span
                      initial={false}
                      animate={{ width: `${(count / inspections.length) * 100}%` }}
                      transition={transition}
                      className="block h-full rounded-full bg-ink/30"
                    />
                  </span>
                  <span className="text-caption text-ink-secondary w-6 text-right numeric">
                    {count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="mt-3 overflow-hidden">
        <div className="flex items-baseline justify-between px-5 py-3.5">
          <h2 className="text-heading text-ink">Devices</h2>
          <span className="text-caption text-ink-tertiary numeric">{inspections.length}</span>
        </div>

        {inspections.length === 0 ? (
          <div className="border-t border-line">
            <Empty
              icon={ScanLine}
              title="No devices scanned"
              description="Open the scanning station to start working through this lot."
              action={
                <Button variant="primary" onClick={() => openStation("/scan")}>
                  <ScanLine className="h-4 w-4" />
                  Start scanning
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full min-w-[52rem] border-collapse text-left">
              <thead>
                <tr className="text-micro text-ink-tertiary">
                  <th className="px-5 py-2 font-semibold">Device ID</th>
                  <th className="px-3 py-2 font-semibold">Model</th>
                  <th className="px-3 py-2 font-semibold">Grade</th>
                  <th className="px-3 py-2 font-semibold">Defects</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-5 py-2 text-right font-semibold">Photos</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {inspections.map((inspection) => (
                    <DeviceRow
                      key={inspection.id}
                      inspection={inspection}
                      onRemove={() => remove.mutate(inspection.id)}
                      removing={remove.isPending}
                    />
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <EditOrderDialog
        order={order}
        open={editing}
        onOpenChange={setEditing}
        onSaved={() => {
          client.invalidateQueries({ queryKey: orderKey(orderId) });
          client.invalidateQueries({ queryKey: ordersKey });
          toast.success("Order updated");
        }}
      />
    </Page>
  );
}

function DeviceRow({
  inspection,
  onRemove,
  removing,
}: {
  inspection: Inspection;
  onRemove: () => void;
  removing: boolean;
}) {
  return (
    <motion.tr
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="group border-t border-line align-middle transition-colors hover:bg-ink/[0.02]"
    >
      <td className="mono px-5 py-2.5 text-caption text-ink">{inspection.deviceId}</td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <span className="text-caption text-ink">{deviceName(inspection.specs)}</span>
        {inspection.specs && inspection.specs.source !== "unknown" && (
          <span className="text-caption text-ink-tertiary ml-1.5">
            {inspection.specs.storage}, {inspection.specs.color}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span
          className={cn(
            "rounded-sm px-1.5 py-0.5 text-caption font-bold numeric",
            GRADE_TONE[inspection.grade ?? "NA"],
          )}
        >
          {inspection.grade ?? "NA"}
        </span>
      </td>
      <td className="px-3 py-2.5">
        {inspection.defects.length === 0 ? (
          <span className="text-caption text-ink-tertiary">None</span>
        ) : (
          <span className="text-caption text-critical">
            {inspection.defects.map(defectLabel).join(", ")}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        {inspection.status === "completed" ? (
          <span className="text-caption text-positive flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Signed off
          </span>
        ) : inspection.status === "photographed" ? (
          <span className="text-caption text-info">Awaiting sign-off</span>
        ) : (
          <span className="text-caption text-caution">Needs photos</span>
        )}
      </td>
      <td className="px-5 py-2.5 text-right">
        <span className="text-caption text-ink-secondary numeric">{inspection.images.length}</span>
      </td>
      <td className="pr-3">
        <Button
          variant="danger"
          size="icon"
          onClick={onRemove}
          disabled={removing}
          aria-label={`Remove ${inspection.deviceId}`}
          className="opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </td>
    </motion.tr>
  );
}

function EditOrderDialog({
  order,
  open,
  onOpenChange,
  onSaved,
}: {
  order: Order;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [client, setClient] = useState(order.client);
  const [description, setDescription] = useState(order.description);
  const [quantity, setQuantity] = useState(String(order.expectedQuantity));

  const save = useMutation({
    mutationFn: () =>
      api<Order>("PATCH", `/api/orders/${order.id}`, {
        client: client.trim(),
        description: description.trim(),
        expectedQuantity: Number(quantity),
      }),
    onSuccess: () => {
      onOpenChange(false);
      onSaved();
    },
    onError: (error: Error) => toast.error("Could not save", error.message),
  });

  const quantityError =
    Number(quantity) < order.scannedCount
      ? `${order.scannedCount} devices are already scanned into this order`
      : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (next) {
          setClient(order.client);
          setDescription(order.description);
          setQuantity(String(order.expectedQuantity));
        }
        onOpenChange(next);
      }}
      title="Edit order"
      description={order.orderNumber}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => save.mutate()}
            disabled={save.isPending || !client.trim() || !!quantityError}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Client">
          {(props) => (
            <Input {...props} value={client} onChange={(event) => setClient(event.target.value)} />
          )}
        </Field>
        <Field label="Description">
          {(props) => (
            <Textarea
              {...props}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
            />
          )}
        </Field>
        <Field label="Expected devices" error={quantityError}>
          {(props) => (
            <Input
              {...props}
              type="number"
              min={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="numeric"
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
