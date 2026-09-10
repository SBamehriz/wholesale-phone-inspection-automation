import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  Check,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Package,
  ScanLine,
  Video,
  X,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { MAX_IMAGES_PER_INSPECTION, defectLabel } from "@shared/inspection";

import { GRADE_TONE } from "../components/GradePicker";
import { OrderProgress } from "../components/OrderProgress";
import { Page, PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/button";
import { Badge, Card, Empty, Stat } from "../components/ui/Surface";
import { useToast } from "../components/ui/toast";
import { api } from "../lib/api";
import { captureFrame, toStoredImage } from "../lib/images";
import { spring, springLively, useSpring } from "../lib/motion";
import {
  deviceName,
  orderKey,
  ordersKey,
  useActiveOrder,
  type Inspection,
} from "../lib/orders";
import { cn } from "../lib/utils";

export default function PhotoStation() {
  const [, navigate] = useLocation();
  const { order, id: orderId, inspections, isMissing, select } = useActiveOrder();
  const client = useQueryClient();
  const toast = useToast();
  const transition = useSpring(spring);
  const livelyTransition = useSpring(springLively);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [processing, setProcessing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isMissing) select(null);
  }, [isMissing, select]);

  /** Work the oldest device without photos first, unless you picked one. */
  const queue = useMemo(
    () => [...inspections].sort((a, b) => a.scannedAt.localeCompare(b.scannedAt)),
    [inspections],
  );
  const nextUp = queue.find((inspection) => inspection.status === "scanning") ?? queue[0];
  const selected = inspections.find((i) => i.id === selectedId) ?? nextUp ?? null;

  const roomLeft = selected ? MAX_IMAGES_PER_INSPECTION - selected.images.length : 0;

  // The queue moves itself along, so the row it lands on has to be the one you see.
  useEffect(() => {
    if (!selected) return;
    document
      .getElementById(`device-${selected.id}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected?.id]);

  // --- Camera --------------------------------------------------------------

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 } },
      });
      streamRef.current = stream;
      setCameraOn(true);
      // The element only exists once `cameraOn` has rendered it.
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
    } catch {
      toast.error("No camera", "Access was denied or no camera is attached. Upload files instead.");
    }
  };

  const shoot = async () => {
    if (!videoRef.current) return;
    const frame = await captureFrame(videoRef.current);
    setPending((current) => [...current, frame].slice(0, roomLeft));
  };

  // --- Files ---------------------------------------------------------------

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setProcessing(true);
    try {
      const encoded = await Promise.all(
        Array.from(files)
          .filter((file) => file.type.startsWith("image/"))
          .slice(0, roomLeft)
          .map(toStoredImage),
      );
      setPending((current) => [...current, ...encoded].slice(0, roomLeft));
    } catch (error) {
      toast.error("Could not read those files", (error as Error).message);
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // --- Saving --------------------------------------------------------------

  const upload = useMutation({
    mutationFn: (images: string[]) =>
      api<Inspection>("POST", `/api/inspections/${selected!.id}/images`, { images }),
    onSuccess: (inspection) => {
      client.invalidateQueries({ queryKey: orderKey(orderId!) });
      client.invalidateQueries({ queryKey: ordersKey });
      setPending([]);
      setSelectedId(inspection.id);
      toast.success("Photos attached", `${inspection.images.length} on file for this device.`);
    },
    onError: (error: Error) => toast.error("Upload failed", error.message),
  });

  const complete = useMutation({
    mutationFn: (id: number) => api<Inspection>("POST", `/api/inspections/${id}/complete`),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: orderKey(orderId!) });
      client.invalidateQueries({ queryKey: ordersKey });
      setSelectedId(null);
      setPending([]);
      stopCamera();
    },
    onError: (error: Error) => toast.error("Could not complete", error.message),
  });

  if (!order) {
    return (
      <Page>
        <PageHeader title="Photo station" back={{ href: "/", label: "Overview" }} />
        <Card>
          <Empty
            icon={Package}
            title="Pick an order first"
            description="Photos attach to a device inside a lot. Open an order to start."
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

  return (
    <Page wide>
      <PageHeader
        title="Photo station"
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{order.client}</span>
            <span className="mono text-caption text-ink-tertiary">{order.orderNumber}</span>
          </span>
        }
        back={{ href: `/orders/${order.id}`, label: "Order" }}
        actions={
          <Button variant="secondary" onClick={() => navigate("/scan")}>
            <ScanLine className="h-4 w-4" />
            Scanning station
          </Button>
        }
      />

      <Card className="mb-3 px-5 py-4">
        <div className="text-caption text-ink-secondary mb-2 flex items-baseline justify-between">
          <span>
            <span className="text-ink font-semibold numeric">{order.completedCount}</span> of{" "}
            <span className="numeric">{order.expectedQuantity}</span> signed off
          </span>
          <span className="text-ink-tertiary numeric">
            {order.scannedCount - order.photographedCount} awaiting photos
          </span>
        </div>
        <OrderProgress order={order} />
      </Card>

      <div className="grid gap-3 lg:grid-cols-[19rem_minmax(0,1fr)]">
        {/* --- Device queue --------------------------------------------------- */}
        <Card className="h-fit overflow-hidden">
          <div className="flex items-baseline justify-between px-4 py-3">
            <h2 className="text-heading text-ink">Devices</h2>
            <span className="text-caption text-ink-tertiary numeric">{queue.length}</span>
          </div>

          {queue.length === 0 ? (
            <p className="text-caption text-ink-tertiary border-t border-line px-4 py-6 text-center">
              Nothing scanned into this lot yet.
            </p>
          ) : (
            <ul className="max-h-[32rem] divide-y divide-line overflow-y-auto border-t border-line">
              {queue.map((inspection) => {
                const active = selected?.id === inspection.id;
                return (
                  <li key={inspection.id} id={`device-${inspection.id}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(inspection.id);
                        setPending([]);
                      }}
                      className={cn(
                        "relative w-full px-4 py-2.5 text-left transition-colors",
                        active ? "bg-accent-soft" : "hover:bg-ink/[0.03]",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="photo-queue-marker"
                          transition={transition}
                          className="absolute inset-y-0 left-0 w-[3px] bg-accent"
                        />
                      )}
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
                        {inspection.status === "completed" ? (
                          <CheckCircle2 className="ml-auto h-3.5 w-3.5 shrink-0 text-positive" />
                        ) : inspection.images.length > 0 ? (
                          <Camera className="ml-auto h-3.5 w-3.5 shrink-0 text-info" />
                        ) : null}
                      </div>
                      <p className="mono text-caption text-ink-tertiary mt-0.5 truncate">
                        {inspection.deviceId}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* --- Capture -------------------------------------------------------- */}
        {!selected ? (
          <Card>
            <Empty
              icon={Camera}
              title="Nothing to photograph"
              description="Scan devices into this order first, then come back to capture them."
              action={
                <Button variant="primary" onClick={() => navigate("/scan")}>
                  <ScanLine className="h-4 w-4" />
                  Scanning station
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="space-y-3">
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-title text-ink">{deviceName(selected.specs)}</h2>
                    <span
                      className={cn(
                        "rounded-sm px-1.5 py-0.5 text-caption font-bold numeric",
                        GRADE_TONE[selected.grade ?? "NA"],
                      )}
                    >
                      {selected.grade ?? "NA"}
                    </span>
                  </div>
                  <p className="mono text-caption text-ink-tertiary mt-0.5">{selected.deviceId}</p>
                </div>
                <Badge
                  tone={
                    selected.status === "completed"
                      ? "positive"
                      : selected.status === "photographed"
                        ? "info"
                        : "caution"
                  }
                >
                  {selected.status === "completed"
                    ? "Signed off"
                    : selected.status === "photographed"
                      ? "Photographed"
                      : "Needs photos"}
                </Badge>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Storage" value={selected.specs?.storage ?? "Unknown"} />
                <Stat label="Colour" value={selected.specs?.color ?? "Unknown"} />
                <Stat label="Photos" value={`${selected.images.length}/${MAX_IMAGES_PER_INSPECTION}`} />
                <Stat
                  label="Defects"
                  value={
                    selected.defects.length === 0 ? (
                      <span className="text-positive">None</span>
                    ) : (
                      <span className="text-critical text-caption">
                        {selected.defects.map(defectLabel).join(", ")}
                      </span>
                    )
                  }
                />
              </dl>

              {selected.notes && (
                <p className="text-caption text-ink-secondary mt-3 rounded border border-line bg-surface-sunken px-3 py-2">
                  {selected.notes}
                </p>
              )}
            </Card>

            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-heading text-ink">Capture</h2>
                <div className="flex gap-2">
                  {cameraOn ? (
                    <>
                      <Button variant="primary" onClick={shoot} disabled={roomLeft <= pending.length}>
                        <Camera className="h-4 w-4" />
                        Take photo
                      </Button>
                      <Button variant="ghost" onClick={stopCamera}>
                        Stop
                      </Button>
                    </>
                  ) : (
                    <Button variant="secondary" onClick={startCamera} disabled={roomLeft === 0}>
                      <Video className="h-4 w-4" />
                      Use camera
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => fileRef.current?.click()}
                    disabled={roomLeft === 0 || processing}
                  >
                    {processing ? (
                      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                    ) : (
                      <ImagePlus className="h-4 w-4" />
                    )}
                    Add files
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(event) => addFiles(event.target.files)}
                  />
                </div>
              </div>

              <AnimatePresence initial={false}>
                {cameraOn && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={transition}
                    className="mb-4 overflow-hidden rounded"
                  >
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="aspect-video w-full max-w-full bg-black object-cover"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {selected.images.length + pending.length === 0 ? (
                <div className="rounded border border-dashed border-line-strong px-4 py-8 text-center">
                  <Camera className="mx-auto mb-2 h-5 w-5 text-ink-tertiary" />
                  <p className="text-caption text-ink-secondary">
                    A device cannot be signed off without photo evidence.
                  </p>
                </div>
              ) : (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {selected.images.map((image, index) => (
                    <li key={`stored-${index}`} className="relative">
                      <img
                        src={image}
                        alt={`Inspection photo ${index + 1} of ${selected.deviceId}`}
                        className="aspect-[4/3] w-full rounded-sm border border-line object-cover"
                      />
                      <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-positive text-white">
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                    </li>
                  ))}
                  <AnimatePresence initial={false}>
                    {pending.map((image, index) => (
                      <motion.li
                        key={`pending-${index}-${image.slice(-12)}`}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={livelyTransition}
                        className="relative"
                      >
                        <img
                          src={image}
                          alt={`Unsaved photo ${index + 1}`}
                          className="aspect-[4/3] w-full rounded-sm border-2 border-dashed border-accent object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setPending((current) => current.filter((_, i) => i !== index))}
                          className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-ink/70 text-white backdrop-blur-sm transition-transform hover:scale-110"
                          aria-label={`Discard photo ${index + 1}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-caption text-ink-tertiary">
                  {pending.length > 0
                    ? `${pending.length} not saved yet`
                    : `${roomLeft} more allowed`}
                </p>
                <div className="flex gap-2">
                  {pending.length > 0 && (
                    <Button
                      variant="primary"
                      onClick={() => upload.mutate(pending)}
                      disabled={upload.isPending}
                    >
                      {upload.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Attach {pending.length}
                    </Button>
                  )}
                  {/* A finished device gets a statement, not a dead button. */}
                  {selected.status === "completed" ? (
                    <span className="text-caption text-positive flex items-center gap-1.5 font-semibold">
                      <CheckCircle2 className="h-4 w-4" />
                      Signed off
                    </span>
                  ) : (
                    <Button
                      variant={pending.length > 0 ? "secondary" : "primary"}
                      onClick={() => complete.mutate(selected.id)}
                      disabled={complete.isPending || selected.images.length === 0}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Sign off device
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </Page>
  );
}
