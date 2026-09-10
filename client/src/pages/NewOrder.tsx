import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ScanLine, Sparkles } from "lucide-react";
import { useLocation } from "wouter";

import { Page, PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/button";
import { Field, Input, Textarea } from "../components/ui/Field";
import { Card } from "../components/ui/Surface";
import { useToast } from "../components/ui/toast";
import { api } from "../lib/api";
import { ordersKey, setActiveOrderId, type Order } from "../lib/orders";

/** Order numbers are 12 digits. Generating one saves reading it off a label. */
function randomOrderNumber(): string {
  const digits = new Uint32Array(2);
  crypto.getRandomValues(digits);
  return String(100_000_000_000 + ((digits[0] * 0x100000000 + digits[1]) % 900_000_000_000));
}

export default function NewOrder() {
  const [, navigate] = useLocation();
  const client = useQueryClient();
  const toast = useToast();

  const [orderNumber, setOrderNumber] = useState("");
  const [customer, setCustomer] = useState("");
  const [quantity, setQuantity] = useState("");
  const [description, setDescription] = useState("");

  const numberError =
    orderNumber && !/^\d{12}$/.test(orderNumber)
      ? `${orderNumber.length} of 12 digits`
      : undefined;

  const create = useMutation({
    mutationFn: () =>
      api<Order>("POST", "/api/orders", {
        orderNumber: orderNumber || undefined,
        client: customer.trim(),
        description: description.trim(),
        expectedQuantity: Number(quantity),
      }),
    onSuccess: (order) => {
      client.invalidateQueries({ queryKey: ordersKey });
      // Straight into the work, because a new lot is sitting there to be scanned.
      setActiveOrderId(order.id);
      toast.success("Order created", `${order.orderNumber} is ready to scan.`);
      navigate("/scan");
    },
    onError: (error: Error) => toast.error("Could not create the order", error.message),
  });

  const valid = customer.trim() && Number(quantity) > 0 && !numberError;

  return (
    <Page>
      <PageHeader
        title="New order"
        description="Register an incoming lot before scanning it in."
        back={{ href: "/orders", label: "Orders" }}
      />

      <Card className="p-6">
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) create.mutate();
          }}
        >
          <Field
            label="Order number"
            hint="Leave it blank and one will be assigned."
            error={numberError}
            aside={
              <button
                type="button"
                onClick={() => setOrderNumber(randomOrderNumber())}
                className="text-caption text-accent-ink flex items-center gap-1 font-semibold transition-opacity hover:opacity-70"
              >
                <Sparkles className="h-3 w-3" />
                Generate
              </button>
            }
          >
            {(props) => (
              <Input
                {...props}
                value={orderNumber}
                onChange={(event) => setOrderNumber(event.target.value.replace(/\D/g, "").slice(0, 12))}
                placeholder="000000000000"
                inputMode="numeric"
                className="mono"
              />
            )}
          </Field>

          <Field label="Client">
            {(props) => (
              <Input
                {...props}
                value={customer}
                onChange={(event) => setCustomer(event.target.value)}
                placeholder="TechBridge Distributors LLC"
                autoFocus
                required
              />
            )}
          </Field>

          <Field label="Expected devices" hint="The lot is complete when this many are signed off.">
            {(props) => (
              <Input
                {...props}
                type="number"
                min={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder="24"
                className="numeric"
                required
              />
            )}
          </Field>

          <Field label="Description" hint="Models, carrier status, where it shipped from.">
            {(props) => (
              <Textarea
                {...props}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Mixed iPhone 15 Pro and Galaxy S24 Ultra, carrier unlocked. Dallas, TX."
              />
            )}
          </Field>

          <div className="flex justify-end gap-2 border-t border-line pt-5">
            <Button variant="ghost" onClick={() => navigate("/orders")}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="lg" disabled={!valid || create.isPending}>
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <ScanLine className="h-4 w-4" />
              )}
              Create and start scanning
            </Button>
          </div>
        </form>
      </Card>
    </Page>
  );
}
