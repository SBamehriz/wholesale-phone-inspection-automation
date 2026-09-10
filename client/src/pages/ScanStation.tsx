import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  Check,
  CornerDownLeft,
  Loader2,
  Package,
  RotateCcw,
  ScanLine,
  Undo2,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { DEFECTS, GRADES, defectLabel, normalizeScan, parseDeviceId } from "@shared/inspection";

import { DefectPicker } from "../components/DefectPicker";
import { GRADE_TONE, GradePicker } from "../components/GradePicker";
import { OrderProgress } from "../components/OrderProgress";
import { Page, PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/Button";
import { Field, Input, Textarea } from "../components/ui/Field";
import { Kbd } from "../components/ui/Kbd";
import { Badge, Card, Empty } from "../components/ui/Surface";
import { useToast } from "../components/ui/Toast";
import { ApiError, api } from "../lib/api";
import { spring, springLively, useSpring } from "../lib/motion";
import {
  deviceName,
  lookupDevice,
  orderKey,
  ordersKey,
  useActiveOrder,
  type DeviceSpecs,
  type Inspection,
} from "../lib/orders";
import { cn } from "../lib/utils";

/** How long the confirmation of the last save stays on screen. */
const CONFIRMATION_MS = 2600;

export default function ScanStation() {
  const [, navigate] = useLocation();
  const { id: orderId, order, inspections, isMissing, select } = useActiveOrder();
  const client = useQueryClient();
  const toast = useToast();
  const transition = useSpring(spring);
  const livelyTransition = useSpring(springLively);

  const [deviceId, setDeviceId] = useState("");
  const [specs, setSpecs] = useState<DeviceSpecs | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [defects, setDefects] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [lastSaved, setLastSaved] = useState<Inspection | null>(null);
  /** Carries the last grade forward, since most lots are all the same. */
  const [carryForward, setCarryForward] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const lookupToken = useRef(0);

  const parsed = useMemo(() => parseDeviceId(deviceId), [deviceId]);
  const isReady = parsed.kind !== "invalid";
  const alreadyScanned = useMemo(
    () => (isReady ? inspections.find((i) => i.deviceId === parsed.value) : undefined),
    [inspections, isReady, parsed],
  );

  useEffect(() => {
    if (isMissing) select(null);
  }, [isMissing, select]);

  // --- Identification ------------------------------------------------------
  // The device resolves as soon as the ID is complete, so nobody types out a
  // brand and model that the IMEI already knows.

  useEffect(() => {
    if (!isReady) {
      setSpecs(null);
      setLookupError(parsed.kind === "invalid" && deviceId ? parsed.reason : null);
      return;
    }

    setLookupError(null);
    const token = ++lookupToken.current;
    setIdentifying(true);

    lookupDevice(parsed.value)
      .then((result) => {
        if (lookupToken.current !== token) return;
        setSpecs(result);
      })
      .catch((error: Error) => {
        if (lookupToken.current !== token) return;
        setSpecs(null);
        setLookupError(error.message);
      })
      .finally(() => {
        if (lookupToken.current === token) setIdentifying(false);
      });
  }, [deviceId, isReady, parsed]);

  // Loading a device that is already in the order fills the form with what was
  // recorded, so rescanning turns into an edit instead of a duplicate.
  useEffect(() => {
    if (!alreadyScanned) return;
    setGrade(alreadyScanned.grade);
    setDefects(alreadyScanned.defects);
    setNotes(alreadyScanned.notes ?? "");
  }, [alreadyScanned]);

  const resetForm = useCallback(
    (keepGrade: boolean) => {
      setDeviceId("");
      setSpecs(null);
      setLookupError(null);
      if (!keepGrade) setGrade(null);
      setDefects([]);
      setNotes("");
      inputRef.current?.focus();
    },
    [],
  );

  // --- Saving --------------------------------------------------------------

  const save = useMutation({
    mutationFn: async () => {
      if (!orderId || !grade || !isReady) throw new Error("Not ready to save");
      const payload = { grade, defects, notes: notes.trim() || undefined };

      if (alreadyScanned) {
        return api<Inspection>("PATCH", `/api/inspections/${alreadyScanned.id}`, payload);
      }
      return api<Inspection>("POST", "/api/inspections", {
        ...payload,
        deviceId: parsed.value,
        orderId,
      });
    },
    onSuccess: (inspection) => {
      client.invalidateQueries({ queryKey: orderKey(orderId!) });
      client.invalidateQueries({ queryKey: ordersKey });
      setLastSaved(inspection);
      window.setTimeout(
        () => setLastSaved((current) => (current?.id === inspection.id ? null : current)),
        CONFIRMATION_MS,
      );
      // Straight back to the ID field for the next device, no mouse needed.
      resetForm(carryForward);
    },
    onError: (error: Error) => {
      toast.error(
        error instanceof ApiError && error.status === 409 ? "Already scanned" : "Could not save",
        error.message,
      );
    },
  });

  const undo = useMutation({
    mutationFn: (id: number) => api<void>("DELETE", `/api/inspections/${id}`),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: orderKey(orderId!) });
      client.invalidateQueries({ queryKey: ordersKey });
      setLastSaved(null);
      toast.info("Removed", "That device is out of the order again.");
      inputRef.current?.focus();
    },
    onError: (error: Error) => toast.error("Could not undo", error.message),
  });

  const canSave = isReady && !!grade && !!orderId && !save.isPending;

  const submit = useCallback(() => {
    if (!canSave) return;
    save.mutate();
  }, [canSave, save]);

  // --- Keyboard ------------------------------------------------------------
  //
  // The shortcuts are single keys, so they cannot be live while the ID field
  // has focus. A scanner types digits, and a 1 has to stay a 1. So the ID
  // field hands focus off as soon as it holds a complete ID, and the shortcuts
  // take over from there. One scan, one grade key, one Enter.

  const armShortcuts = useCallback(() => {
    if (document.activeElement === inputRef.current) inputRef.current?.blur();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      const typingProse = target?.tagName === "TEXTAREA";

      if (event.metaKey || event.ctrlKey || event.altKey) {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          submit();
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        resetForm(false);
        return;
      }

      if (event.key === "Enter" && !typingProse) {
        event.preventDefault();
        // The Enter a scanner sends at the end should switch the shortcuts
        // on, not save a device nobody has graded yet.
        if (target === inputRef.current && !grade) armShortcuts();
        else submit();
        return;
      }

      if (typing) return;

      const gradeIndex = Number(event.key) - 1;
      if (Number.isInteger(gradeIndex) && gradeIndex >= 0 && gradeIndex < GRADES.length) {
        event.preventDefault();
        setGrade(GRADES[gradeIndex].value);
        return;
      }

      const defect = DEFECTS.find((entry) => entry.key === event.key.toLowerCase());
      if (defect) {
        event.preventDefault();
        setDefects((current) =>
          current.includes(defect.value)
            ? current.filter((d) => d !== defect.value)
            : [...current, defect.value],
        );
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [armShortcuts, grade, resetForm, submit]);

  // A 15 digit IMEI can only be complete, so hand focus off the moment one
  // lands. Nobody has to reach for the mouse between devices.
  useEffect(() => {
    if (parsed.kind === "imei") armShortcuts();
  }, [armShortcuts, parsed]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [orderId]);

  // --- No order selected ---------------------------------------------------

  if (!order) {
    return (
      <Page>
        <PageHeader title="Scanning station" back={{ href: "/", label: "Overview" }} />
        <Card>
          <Empty
            icon={Package}
            title="Pick an order first"
            description="A scan has to land in a lot. Open an order and start scanning from there."
            action={
              <Button variant="primary" asChild>
                <Link href="/orders">Choose an order</Link>
              </Button>
            }
          />
        </Card>
      </Page>
    );
  }

  const remaining = Math.max(0, order.expectedQuantity - order.scannedCount);

  return (
    <Page wide>
      <PageHeader
        title="Scanning station"
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{order.client}</span>
            <span className="mono text-caption text-ink-tertiary">{order.orderNumber}</span>
          </span>
        }
        back={{ href: `/orders/${order.id}`, label: "Order" }}
        actions={
          <Button variant="secondary" onClick={() => navigate("/photos")}>
            <Camera className="h-4 w-4" />
            Photo station
          </Button>
        }
      />

      <Card className="mb-3 px-5 py-4">
        <div className="text-caption text-ink-secondary mb-2 flex items-baseline justify-between">
          <span>
            <span className="text-ink font-semibold numeric">{order.scannedCount}</span> of{" "}
            <span className="numeric">{order.expectedQuantity}</span> scanned
          </span>
          <span className="text-ink-tertiary numeric">{remaining} to go</span>
        </div>
        <OrderProgress order={order} />
      </Card>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-3">
          {/* --- Identify ---------------------------------------------------- */}
          <Card className="p-5">
            <Field
              label="Device ID"
              hint="Scan the barcode or type the IMEI. Serial numbers work for WiFi tablets."
              error={lookupError ?? undefined}
              aside={
                <span className="text-caption text-ink-tertiary flex items-center gap-1">
                  <Kbd>Enter</Kbd> saves
                </span>
              }
            >
              {(props) => (
                <div className="relative">
                  <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
                  <Input
                    {...props}
                    ref={inputRef}
                    value={deviceId}
                    onChange={(event) => setDeviceId(normalizeScan(event.target.value))}
                    placeholder="356938035643809"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    inputMode="text"
                    className={cn(
                      "mono h-12 pl-9 pr-10 text-[1.0625rem]",
                      isReady && "border-positive/50",
                    )}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {identifying ? (
                      <Loader2 className="h-4 w-4 animate-spin text-ink-tertiary motion-reduce:animate-none" />
                    ) : isReady ? (
                      <Check className="h-4 w-4 text-positive" />
                    ) : null}
                  </span>
                </div>
              )}
            </Field>

            <AnimatePresence mode="wait" initial={false}>
              {specs && (
                <motion.div
                  key={`${specs.brand}-${specs.model}-${specs.storage}`}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                  className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-line bg-surface-sunken px-3 py-2.5"
                >
                  <span className="text-heading text-ink">{deviceName(specs)}</span>
                  {specs.source !== "unknown" && (
                    <>
                      <span className="text-caption text-ink-secondary">{specs.storage}</span>
                      <span className="text-caption text-ink-secondary">{specs.color}</span>
                      <span className="text-caption text-ink-tertiary ml-auto">
                        Identified from {specs.source === "tac" ? "IMEI" : "serial"}
                      </span>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {alreadyScanned && (
              <p className="text-caption text-info mt-3 flex items-center gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                Already in this order, so saving will update what is there.
              </p>
            )}
          </Card>

          {/* --- Grade and defects ------------------------------------------- */}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
            <Card className="p-5">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-heading text-ink">Grade</h2>
                <span className="text-caption text-ink-tertiary flex items-center gap-1">
                  <Kbd>1</Kbd> to <Kbd>6</Kbd>
                </span>
              </div>
              <GradePicker value={grade} onChange={setGrade} />
            </Card>

            <Card className="p-5">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="text-heading text-ink">Defects</h2>
                <span className="text-caption text-ink-tertiary">
                  {defects.length === 0 ? "None" : `${defects.length} marked`}
                </span>
              </div>
              <DefectPicker value={defects} onChange={setDefects} />
            </Card>
          </div>

          <Card className="p-5">
            <Field label="Notes" hint="Optional. Anything the grade and defects do not cover.">
              {(props) => (
                <Textarea
                  {...props}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Battery health 82 percent, faint scuff along the left rail"
                  rows={2}
                  className="min-h-[64px]"
                />
              )}
            </Field>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="text-caption text-ink-secondary flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={carryForward}
                onChange={(event) => setCarryForward(event.target.checked)}
                className="h-4 w-4 accent-[hsl(var(--accent))]"
              />
              Keep the grade for the next device
            </label>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => resetForm(false)}>
                Clear
                <Kbd className="ml-1">esc</Kbd>
              </Button>
              <Button variant="primary" size="lg" onClick={submit} disabled={!canSave}>
                {save.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <CornerDownLeft className="h-4 w-4" />
                )}
                {alreadyScanned ? "Update device" : "Save device"}
              </Button>
            </div>
          </div>
        </div>

        {/* --- Queue --------------------------------------------------------- */}
        <div className="space-y-3">
          <AnimatePresence>
            {lastSaved && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={livelyTransition}
              >
                <Card className="border-positive/40 bg-positive-soft p-4">
                  <div className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
                    <div className="min-w-0 flex-1">
                      <p className="text-body font-semibold text-ink">Saved</p>
                      <p className="mono text-caption text-ink-secondary truncate">
                        {lastSaved.deviceId}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => undo.mutate(lastSaved.id)}
                      disabled={undo.isPending}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      Undo
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          <Card className="overflow-hidden">
            <div className="flex items-baseline justify-between px-4 py-3">
              <h2 className="text-heading text-ink">Scanned</h2>
              <span className="text-caption text-ink-tertiary numeric">{inspections.length}</span>
            </div>

            {inspections.length === 0 ? (
              <p className="text-caption text-ink-tertiary border-t border-line px-4 py-6 text-center">
                Nothing scanned into this lot yet.
              </p>
            ) : (
              <ul className="max-h-[26rem] divide-y divide-line overflow-y-auto border-t border-line">
                <AnimatePresence initial={false}>
                  {inspections.slice(0, 40).map((inspection) => (
                    <motion.li
                      key={inspection.id}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={transition}
                    >
                      <button
                        type="button"
                        onClick={() => setDeviceId(inspection.deviceId)}
                        className="w-full px-4 py-2.5 text-left transition-colors hover:bg-ink/[0.03]"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-sm px-1.5 py-0.5 text-caption font-bold numeric",
                              GRADE_TONE[inspection.grade ?? "NA"],
                            )}
                          >
                            {inspection.grade ?? "NA"}
                          </span>
                          <span className="text-caption truncate font-medium text-ink">
                            {deviceName(inspection.specs)}
                          </span>
                        </div>
                        <p className="mono text-caption text-ink-tertiary mt-0.5 truncate">
                          {inspection.deviceId}
                        </p>
                        {inspection.defects.length > 0 && (
                          <p className="text-caption text-critical mt-0.5 truncate">
                            {inspection.defects.map(defectLabel).join(", ")}
                          </p>
                        )}
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="text-micro text-ink-tertiary mb-2.5">Shortcuts</h2>
            <dl className="space-y-1.5">
              {[
                ["Grade", "1 to 6"],
                ["Toggle a defect", DEFECTS.slice(0, 3).map((d) => d.key.toUpperCase()).join(" ")],
                ["Save and move on", "Enter"],
                ["Clear the form", "esc"],
              ].map(([label, keys]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-caption text-ink-secondary">{label}</dt>
                  <dd>
                    <Kbd>{keys}</Kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </Card>

          {order.scannedCount > order.photographedCount && (
            <Badge tone="caution" className="w-full justify-center py-1.5">
              {order.scannedCount - order.photographedCount === 1
                ? "1 device still needs photos"
                : `${order.scannedCount - order.photographedCount} devices still need photos`}
            </Badge>
          )}
        </div>
      </div>
    </Page>
  );
}
