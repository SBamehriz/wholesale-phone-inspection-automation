import type { Inspection, Order } from "../../shared/schema";
import { DEFECTS, GRADES, defectLabel } from "../../shared/inspection";
import { buildWorkbook, columnName, type Cell, type CellStyle, type Row, type Sheet } from "./xlsx";

/**
 * The Excel reports.
 *
 * A wholesale buyer settles on a spreadsheet, so the export is as much the
 * product here as the screens are. Every report opens on a summary you can
 * read, and keeps the raw device rows behind it so you can filter them.
 */

const INK = "1C1C1E";
const MUTED = "6E6E73";
const HEADER_FILL = "1C1C1E";

const TITLE: CellStyle = { bold: true, fontSize: 18, color: INK };
const SUBTITLE: CellStyle = { color: MUTED, fontSize: 11 };
const SECTION: CellStyle = { bold: true, fontSize: 12, color: INK };
const KEY: CellStyle = { color: MUTED };
const VALUE: CellStyle = { bold: true, color: INK };
const HEADER: CellStyle = {
  bold: true,
  color: "FFFFFF",
  fill: HEADER_FILL,
  align: "left",
  verticalAlign: "center",
  border: true,
};
const BODY: CellStyle = { border: true };
const NUMBER: CellStyle = { border: true, align: "right" };
const PERCENT: CellStyle = { border: true, align: "right", numberFormat: "0.0%" };

/** Grade colours match the badge colours in the app. */
const GRADE_FILL: Record<string, string> = {
  "A+": "D6F5E3",
  A: "E4F7EC",
  "B+": "FDF3D8",
  B: "FDE8CC",
  C: "FBDAD7",
  "NA": "EFEFF2",
};

function gradeStyle(grade: string | null): CellStyle {
  return { border: true, align: "center", bold: true, fill: GRADE_FILL[grade ?? "NA"] ?? "EFEFF2" };
}

function cell(value: Cell["value"], style?: CellStyle): Cell {
  return { value, style };
}

function blank(): Row {
  return { cells: [] };
}

function keyValue(label: string, value: Cell["value"]): Row {
  return { cells: [cell(label, KEY), cell(value, VALUE)] };
}

// ---------------------------------------------------------------------------
// Shared aggregates
// ---------------------------------------------------------------------------

interface Totals {
  devices: number;
  completed: number;
  grades: Map<string, number>;
  defects: Map<string, number>;
}

function tally(inspections: Inspection[]): Totals {
  const grades = new Map<string, number>();
  const defects = new Map<string, number>();

  for (const inspection of inspections) {
    const grade = inspection.grade ?? "NA";
    grades.set(grade, (grades.get(grade) ?? 0) + 1);
    for (const defect of inspection.defects) {
      defects.set(defect, (defects.get(defect) ?? 0) + 1);
    }
  }

  return {
    devices: inspections.length,
    completed: inspections.filter((i) => i.status === "completed").length,
    grades,
    defects,
  };
}

function gradeRows(totals: Totals): Row[] {
  return GRADES.map(({ value, label }) => {
    const count = totals.grades.get(value) ?? 0;
    return {
      cells: [
        cell(`${value}, ${label}`, { border: true, fill: GRADE_FILL[value] }),
        cell(count, NUMBER),
        cell(totals.devices ? count / totals.devices : 0, PERCENT),
      ],
    };
  });
}

function defectRows(totals: Totals): Row[] {
  const ranked = DEFECTS.map(({ value }) => ({ value, count: totals.defects.get(value) ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);

  if (ranked.length === 0) {
    return [{ cells: [cell("No defects recorded", { border: true, color: MUTED })] }];
  }

  return ranked.map(({ value, count }) => ({
    cells: [
      cell(defectLabel(value), BODY),
      cell(count, NUMBER),
      cell(totals.devices ? count / totals.devices : 0, PERCENT),
    ],
  }));
}

// ---------------------------------------------------------------------------
// Device sheet
// ---------------------------------------------------------------------------

const DEVICE_COLUMNS = [
  "Device ID",
  "Type",
  "Brand",
  "Model",
  "Storage",
  "Colour",
  "Grade",
  "Defects",
  "Notes",
  "Status",
  "Photos",
  "Inspected",
];

function deviceSheet(
  inspections: Inspection[],
  orderNumberOf?: (inspection: Inspection) => string,
): Sheet {
  const headerCells = orderNumberOf ? ["Order", ...DEVICE_COLUMNS] : DEVICE_COLUMNS;

  const rows: Row[] = [
    { cells: headerCells.map((label) => cell(label, HEADER)), height: 24 },
    ...inspections.map((inspection) => {
      const specs = inspection.specs;
      const cells: Cell[] = [
        cell(inspection.deviceId, { ...BODY, align: "left" }),
        cell(inspection.idKind === "imei" ? "IMEI" : "Serial", BODY),
        cell(specs?.brand ?? "Unknown", BODY),
        cell(specs?.model ?? "Unknown", BODY),
        cell(specs?.storage ?? "Unknown", BODY),
        cell(specs?.color ?? "Unknown", BODY),
        cell(inspection.grade ?? "NA", gradeStyle(inspection.grade)),
        cell(inspection.defects.map(defectLabel).join(", ") || "None", BODY),
        cell(inspection.notes ?? "", { ...BODY, wrap: true }),
        cell(inspection.status, BODY),
        cell(inspection.images.length, NUMBER),
        cell(inspection.completedAt ?? inspection.scannedAt, BODY),
      ];
      if (orderNumberOf) cells.unshift(cell(orderNumberOf(inspection), BODY));
      return { cells };
    }),
  ];

  const widths = orderNumberOf
    ? [16, 20, 9, 12, 22, 12, 18, 10, 26, 34, 14, 8, 20]
    : [20, 9, 12, 22, 12, 18, 10, 26, 34, 14, 8, 20];

  return {
    name: "Devices",
    columns: widths,
    rows,
    freezeRows: 1,
    autoFilter: `A1:${columnName(headerCells.length)}1`,
  };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export function buildOrderReport(order: Order, inspections: Inspection[], generatedAt = new Date()) {
  const totals = tally(inspections);

  const summary: Sheet = {
    name: "Summary",
    columns: [30, 34, 14],
    merges: ["A1:C1", "A2:C2"],
    rows: [
      { cells: [cell("Inspection Report", TITLE)], height: 30 },
      { cells: [cell(`${order.client}, order ${order.orderNumber}`, SUBTITLE)] },
      blank(),
      { cells: [cell("Order", SECTION)] },
      keyValue("Order number", order.orderNumber),
      keyValue("Client", order.client),
      keyValue("Description", order.description || "None given"),
      keyValue("Status", order.status === "completed" ? "Completed" : "In progress"),
      keyValue("Created", order.createdAt),
      keyValue("Completed", order.completedAt ?? "Not yet"),
      keyValue("Report generated", generatedAt),
      blank(),
      { cells: [cell("Progress", SECTION)] },
      keyValue("Devices expected", order.expectedQuantity),
      keyValue("Devices inspected", totals.devices),
      keyValue("Inspections finished", totals.completed),
      {
        cells: [
          cell("Completion", KEY),
          cell(order.expectedQuantity ? totals.completed / order.expectedQuantity : 0, {
            ...VALUE,
            numberFormat: "0.0%",
          }),
        ],
      },
      blank(),
      { cells: [cell("Grade breakdown", SECTION)] },
      { cells: [cell("Grade", HEADER), cell("Devices", HEADER), cell("Share", HEADER)] },
      ...gradeRows(totals),
      blank(),
      { cells: [cell("Defects found", SECTION)] },
      { cells: [cell("Defect", HEADER), cell("Devices", HEADER), cell("Share", HEADER)] },
      ...defectRows(totals),
    ],
  };

  return buildWorkbook([summary, deviceSheet(inspections)]);
}

export function buildPortfolioReport(
  entries: Array<{ order: Order; inspections: Inspection[] }>,
  generatedAt = new Date(),
) {
  const all = entries.flatMap((entry) => entry.inspections);
  const totals = tally(all);
  const orderNumbers = new Map(
    entries.flatMap((entry) => entry.inspections.map((i) => [i.id, entry.order.orderNumber])),
  );

  const summary: Sheet = {
    name: "Summary",
    columns: [30, 34, 14],
    merges: ["A1:C1", "A2:C2"],
    rows: [
      { cells: [cell("Inspection Portfolio", TITLE)], height: 30 },
      { cells: [cell(`${entries.length} completed orders, ${totals.devices} devices`, SUBTITLE)] },
      blank(),
      { cells: [cell("Totals", SECTION)] },
      keyValue("Completed orders", entries.length),
      keyValue("Devices inspected", totals.devices),
      keyValue("Devices with defects", all.filter((i) => i.defects.length > 0).length),
      keyValue("Report generated", generatedAt),
      blank(),
      { cells: [cell("Grade breakdown", SECTION)] },
      { cells: [cell("Grade", HEADER), cell("Devices", HEADER), cell("Share", HEADER)] },
      ...gradeRows(totals),
      blank(),
      { cells: [cell("Defects found", SECTION)] },
      { cells: [cell("Defect", HEADER), cell("Devices", HEADER), cell("Share", HEADER)] },
      ...defectRows(totals),
    ],
  };

  const orders: Sheet = {
    name: "Orders",
    columns: [16, 32, 40, 12, 12, 20, 20],
    freezeRows: 1,
    autoFilter: "A1:G1",
    rows: [
      {
        cells: ["Order", "Client", "Description", "Expected", "Inspected", "Created", "Completed"].map(
          (label) => cell(label, HEADER),
        ),
        height: 24,
      },
      ...entries.map(({ order, inspections }) => ({
        cells: [
          cell(order.orderNumber, BODY),
          cell(order.client, BODY),
          cell(order.description || "None given", { ...BODY, wrap: true }),
          cell(order.expectedQuantity, NUMBER),
          cell(inspections.length, NUMBER),
          cell(order.createdAt, BODY),
          cell(order.completedAt ?? "Not yet", BODY),
        ],
      })),
    ],
  };

  return buildWorkbook([summary, orders, deviceSheet(all, (i) => orderNumbers.get(i.id) ?? "")]);
}
