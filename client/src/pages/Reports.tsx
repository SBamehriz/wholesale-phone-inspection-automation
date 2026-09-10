import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, FileSpreadsheet, Loader2, Package } from "lucide-react";
import { Link } from "wouter";
import { DEFECTS, GRADES, defectLabel } from "@shared/inspection";

import { GRADE_TONE } from "../components/GradePicker";
import { Page, PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/Button";
import { Badge, Card, CardHeader, Empty, Skeleton } from "../components/ui/Surface";
import { useToast } from "../components/ui/Toast";
import { download } from "../lib/api";
import { formatDate, useOrders } from "../lib/orders";
import { cn } from "../lib/utils";

interface QualitySummaryData {
  devices: number;
  withDefects: number;
  grades: Record<string, number>;
  defects: Record<string, number>;
}

/** Solid fills for the stacked bar, matching the softer badge tones. */
const GRADE_BAR: Record<string, string> = {
  "A+": "bg-positive",
  A: "bg-positive/70",
  "B+": "bg-caution",
  B: "bg-caution/70",
  C: "bg-critical",
  "NA": "bg-ink/25",
};

export default function Reports() {
  const { data: orders = [], isLoading } = useOrders();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const completed = orders.filter((order) => order.status === "completed");

  const pull = async (key: string, path: string) => {
    setBusy(key);
    try {
      const filename = await download(path);
      toast.success("Report downloaded", filename);
    } catch (error) {
      toast.error("Export failed", (error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page wide>
      <PageHeader
        title="Reports"
        description="Buyers settle on a spreadsheet, so every lot exports as one."
        actions={
          <Button
            variant="primary"
            onClick={() => pull("all", "/api/reports/completed.xlsx")}
            disabled={busy !== null || completed.length === 0}
          >
            {busy === "all" ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            Export all completed
          </Button>
        }
      />

      <QualitySummary />

      <Card className="mt-3 overflow-hidden">
        <CardHeader
          title="Exports by order"
          description="Each workbook carries a summary sheet and every device row behind it."
        />

        {isLoading ? (
          <div className="space-y-4 border-t border-line px-5 py-4">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-9 w-full" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="border-t border-line">
            <Empty
              icon={Package}
              title="Nothing to export"
              description="Create an order and scan devices into it first."
              action={
                <Button variant="primary" asChild>
                  <Link href="/orders/new">New order</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {orders.map((order) => (
              <li
                key={order.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-ink/[0.02]"
              >
                <div className="min-w-[10rem] flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/orders/${order.id}`}
                      className="text-body font-semibold text-ink hover:underline"
                    >
                      {order.client}
                    </Link>
                    <Badge tone={order.status === "completed" ? "positive" : "caution"}>
                      {order.status === "completed" ? "Complete" : "In progress"}
                    </Badge>
                  </div>
                  <p className="text-caption text-ink-tertiary mt-0.5">
                    <span className="mono">{order.orderNumber}</span>,{" "}
                    {formatDate(order.createdAt)}
                  </p>
                </div>

                <span className="text-caption text-ink-secondary numeric">
                  {order.scannedCount} / {order.expectedQuantity} devices
                </span>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => pull(String(order.id), `/api/orders/${order.id}/report.xlsx`)}
                  disabled={busy !== null}
                >
                  {busy === String(order.id) ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Export
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}

/**
 * The two things a buyer wants to know before they open the spreadsheet. What
 * grade is this stock, and what is wrong with it. Answered across every device
 * inspected so far.
 */
function QualitySummary() {
  const { data } = useQuery<QualitySummaryData>({ queryKey: ["/api/reports/summary"] });
  if (!data || data.devices === 0) return null;

  const { devices } = data;
  const grades = GRADES.map((grade) => ({ ...grade, count: data.grades[grade.value] ?? 0 })).filter(
    (grade) => grade.count > 0,
  );
  const defects = DEFECTS.map((defect) => ({ ...defect, count: data.defects[defect.value] ?? 0 }))
    .filter((defect) => defect.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card className="px-5 py-4">
        <h2 className="text-heading text-ink">Grade mix</h2>
        <p className="text-caption text-ink-tertiary mt-0.5 numeric">{devices} devices inspected</p>

        {/* One stacked bar rather than six, because the proportions are the point. */}
        <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-ink/[0.07]">
          {grades.map((grade) => (
            <span
              key={grade.value}
              className={cn("h-full", GRADE_BAR[grade.value])}
              style={{ width: `${(grade.count / devices) * 100}%` }}
              title={`${grade.value}, ${grade.count} devices`}
            />
          ))}
        </div>

        <ul className="mt-3 space-y-1.5">
          {grades.map((grade) => (
            <li key={grade.value} className="flex items-center gap-2.5">
              <span
                className={cn(
                  "w-9 shrink-0 rounded-sm py-0.5 text-center text-caption font-bold numeric",
                  GRADE_TONE[grade.value],
                )}
              >
                {grade.value}
              </span>
              <span className="text-caption text-ink-secondary flex-1">{grade.label}</span>
              <span className="text-caption text-ink font-semibold numeric">{grade.count}</span>
              <span className="text-caption text-ink-tertiary w-11 text-right numeric">
                {Math.round((grade.count / devices) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="px-5 py-4">
        <h2 className="text-heading text-ink">Most common defects</h2>
        <p className="text-caption text-ink-tertiary mt-0.5 numeric">
          {data.withDefects} devices with a fault
        </p>

        {defects.length === 0 ? (
          <p className="text-caption text-positive mt-4">No defects recorded.</p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {defects.map((defect) => (
              <li key={defect.value}>
                <div className="text-caption mb-1 flex items-baseline justify-between">
                  <span className="text-ink-secondary flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-caution" />
                    {defectLabel(defect.value)}
                  </span>
                  <span className="text-ink font-semibold numeric">{defect.count}</span>
                </div>
                <span className="block h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
                  <span
                    className="block h-full rounded-full bg-caution"
                    style={{ width: `${(defect.count / devices) * 100}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
