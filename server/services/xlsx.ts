import { crc32, deflateRawSync } from "zlib";

/**
 * A small XLSX writer with no dependencies.
 *
 * It does exactly what the inspection reports need, meaning several sheets,
 * styled cells, column widths, frozen headers, merges and autofilters, and
 * nothing more. Everything gets written as OOXML SpreadsheetML and packed into
 * a ZIP container by hand, which keeps report generation down to a few
 * kilobytes of code instead of a 20 MB dependency.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CellValue = string | number | Date | null | undefined;

export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  /** Font colour as RRGGBB. */
  color?: string;
  /** Solid background fill as RRGGBB. */
  fill?: string;
  fontSize?: number;
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "center" | "bottom";
  wrap?: boolean;
  border?: boolean;
  /** An Excel number format code such as `0.0%`. Dates get one automatically. */
  numberFormat?: string;
}

export interface Cell {
  value: CellValue;
  style?: CellStyle;
}

export interface Row {
  cells: (Cell | CellValue)[];
  height?: number;
}

export interface Sheet {
  name: string;
  /** Column widths in character units, going left to right. */
  columns?: number[];
  rows: Row[];
  /** How many rows at the top to freeze. */
  freezeRows?: number;
  /** The range the filter dropdowns attach to, such as `A1:H1`. */
  autoFilter?: string;
  /** Ranges to merge, such as `A1:D1`. */
  merges?: string[];
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function escapeXml(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0)!;
    // Strip control characters, which are not legal in XML 1.0.
    if (code < 0x20 && char !== "\t" && char !== "\n" && char !== "\r") continue;
    if (char === "&") out += "&amp;";
    else if (char === "<") out += "&lt;";
    else if (char === ">") out += "&gt;";
    else if (char === '"') out += "&quot;";
    else if (char === "'") out += "&apos;";
    else out += char;
  }
  return out;
}

/** Turns a column number into its letters, so 1 becomes A and 27 becomes AA. */
export function columnName(index: number): string {
  let name = "";
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/** Excel counts dates as days since 30 December 1899, in the workbook timezone. */
function toExcelSerial(date: Date): number {
  const epoch = Date.UTC(1899, 11, 30);
  return (date.getTime() - epoch) / 86_400_000;
}

// ---------------------------------------------------------------------------
// The style registry, which folds fonts, fills and borders into the cellXfs table
// ---------------------------------------------------------------------------

const DATE_FORMAT = "yyyy-mm-dd hh:mm";

class StyleRegistry {
  private fonts = new Map<string, number>();
  private fills = new Map<string, number>();
  private borders = new Map<string, number>();
  private numFmts = new Map<string, number>();
  private xfs = new Map<string, number>();
  private xfXml: string[] = [];

  constructor() {
    // Index 0 of each table is the workbook default.
    this.fonts.set('<font><sz val="11"/><name val="Calibri"/></font>', 0);
    // Excel wants these two fills, in this order, before any fill of your own.
    this.fills.set('<fill><patternFill patternType="none"/></fill>', 0);
    this.fills.set('<fill><patternFill patternType="gray125"/></fill>', 1);
    this.borders.set("<border><left/><right/><top/><bottom/><diagonal/></border>", 0);
    this.xfs.set("default", 0);
    this.xfXml.push('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>');
  }

  private intern(table: Map<string, number>, xml: string): number {
    const existing = table.get(xml);
    if (existing !== undefined) return existing;
    const id = table.size;
    table.set(xml, id);
    return id;
  }

  /** Gives you the `s` attribute value for a cell with this style. */
  idFor(style: CellStyle | undefined, isDate: boolean): number {
    if (!style && !isDate) return 0;
    const s = style ?? {};
    const key = JSON.stringify([s, isDate]);
    const existing = this.xfs.get(key);
    if (existing !== undefined) return existing;

    const font =
      "<font>" +
      (s.bold ? "<b/>" : "") +
      (s.italic ? "<i/>" : "") +
      `<sz val="${s.fontSize ?? 11}"/>` +
      (s.color ? `<color rgb="FF${s.color}"/>` : "") +
      '<name val="Calibri"/>' +
      "</font>";
    const fontId = this.intern(this.fonts, font);

    const fillId = s.fill
      ? this.intern(
          this.fills,
          `<fill><patternFill patternType="solid"><fgColor rgb="FF${s.fill}"/><bgColor indexed="64"/></patternFill></fill>`,
        )
      : 0;

    const borderId = s.border
      ? this.intern(
          this.borders,
          '<border><left style="thin"><color rgb="FFD8D8D8"/></left>' +
            '<right style="thin"><color rgb="FFD8D8D8"/></right>' +
            '<top style="thin"><color rgb="FFD8D8D8"/></top>' +
            '<bottom style="thin"><color rgb="FFD8D8D8"/></bottom><diagonal/></border>',
        )
      : 0;

    const format = s.numberFormat ?? (isDate ? DATE_FORMAT : undefined);
    let numFmtId = 0;
    if (format) {
      const known = this.numFmts.get(format);
      // Custom formats start at 164 by convention, and 0 to 163 are built in.
      numFmtId = known ?? 164 + this.numFmts.size;
      if (known === undefined) this.numFmts.set(format, numFmtId);
    }

    const alignment =
      s.align || s.wrap || s.verticalAlign
        ? `<alignment${s.align ? ` horizontal="${s.align}"` : ""}` +
          `${s.verticalAlign ? ` vertical="${s.verticalAlign}"` : ""}` +
          `${s.wrap ? ' wrapText="1"' : ""}/>`
        : "";

    const xf =
      `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"` +
      `${numFmtId ? ' applyNumberFormat="1"' : ""}${fontId ? ' applyFont="1"' : ""}` +
      `${fillId ? ' applyFill="1"' : ""}${borderId ? ' applyBorder="1"' : ""}` +
      `${alignment ? ' applyAlignment="1"' : ""}>` +
      `${alignment}</xf>`;

    const id = this.xfXml.length;
    this.xfXml.push(xf);
    this.xfs.set(key, id);
    return id;
  }

  toXml(): string {
    const numFmts = [...this.numFmts.entries()]
      .map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${escapeXml(code)}"/>`)
      .join("");
    const table = (entries: Map<string, number>, tag: string) =>
      `<${tag} count="${entries.size}">${[...entries.keys()].join("")}</${tag}>`;

    return (
      `${XML_DECL}<styleSheet xmlns="${NS_MAIN}">` +
      (numFmts ? `<numFmts count="${this.numFmts.size}">${numFmts}</numFmts>` : "") +
      table(this.fonts, "fonts") +
      table(this.fills, "fills") +
      table(this.borders, "borders") +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfXml.length}">${this.xfXml.join("")}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      "</styleSheet>"
    );
  }
}

// ---------------------------------------------------------------------------
// Worksheet serialisation
// ---------------------------------------------------------------------------

function normalizeCell(cell: Cell | CellValue): Cell {
  return cell !== null && typeof cell === "object" && !(cell instanceof Date)
    ? (cell as Cell)
    : { value: cell as CellValue };
}

function sheetXml(sheet: Sheet, styles: StyleRegistry): string {
  const widestRow = sheet.rows.reduce((max, row) => Math.max(max, row.cells.length), 0);
  const lastCell = `${columnName(Math.max(widestRow, 1))}${Math.max(sheet.rows.length, 1)}`;

  const rows = sheet.rows
    .map((row, rowIndex) => {
      const r = rowIndex + 1;
      const cells = row.cells
        .map((raw, colIndex) => {
          const { value, style } = normalizeCell(raw);
          if (value === null || value === undefined || value === "") {
            // An empty cell still has to exist if it is carrying a fill.
            if (!style) return "";
            return `<c r="${columnName(colIndex + 1)}${r}" s="${styles.idFor(style, false)}"/>`;
          }

          const ref = `${columnName(colIndex + 1)}${r}`;
          const isDate = value instanceof Date;
          const s = styles.idFor(style, isDate);
          const sAttr = s ? ` s="${s}"` : "";

          if (isDate) return `<c r="${ref}"${sAttr}><v>${toExcelSerial(value)}</v></c>`;
          if (typeof value === "number" && Number.isFinite(value)) {
            return `<c r="${ref}"${sAttr}><v>${value}</v></c>`;
          }
          return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
        })
        .join("");

      const height = row.height ? ` ht="${row.height}" customHeight="1"` : "";
      return `<row r="${r}"${height}>${cells}</row>`;
    })
    .join("");

  const cols = sheet.columns?.length
    ? `<cols>${sheet.columns
        .map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";

  const pane = sheet.freezeRows
    ? `<pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/>`
    : "";

  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges
        .map((ref) => `<mergeCell ref="${ref}"/>`)
        .join("")}</mergeCells>`
    : "";

  // The order of the elements below is fixed by the SpreadsheetML schema.
  return (
    `${XML_DECL}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    `<dimension ref="A1:${lastCell}"/>` +
    `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    cols +
    `<sheetData>${rows}</sheetData>` +
    (sheet.autoFilter ? `<autoFilter ref="${sheet.autoFilter}"/>` : "") +
    merges +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    "</worksheet>"
  );
}

/** Excel rejects sheet names with certain characters in them, longer than 31
 * characters, or repeated within one workbook. */
function sanitizeSheetNames(sheets: Sheet[]): string[] {
  const seen = new Set<string>();
  return sheets.map((sheet, index) => {
    let name = (sheet.name || `Sheet${index + 1}`)
      .replace(/[[\]:*?/\\]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 31)
      .trim();
    if (!name) name = `Sheet${index + 1}`;
    let unique = name;
    let suffix = 2;
    while (seen.has(unique.toLowerCase())) {
      const trimmed = name.slice(0, 31 - String(suffix).length - 1);
      unique = `${trimmed} ${suffix++}`;
    }
    seen.add(unique.toLowerCase());
    return unique;
  });
}

// ---------------------------------------------------------------------------
// ZIP container
// ---------------------------------------------------------------------------

interface ZipEntry {
  name: string;
  data: Buffer;
}

function zip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  // A fixed timestamp means the same input always produces the same bytes.
  const dosTime = 0;
  const dosDate = (2020 - 1980) * 512 + 1 * 32 + 1;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.data, { level: 9 });
    const checksum = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    locals.push(local, name, compressed);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4); // version made by
    dir.writeUInt16LE(20, 6); // version needed
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(dosTime, 12);
    dir.writeUInt16LE(dosDate, 14);
    dir.writeUInt32LE(checksum, 16);
    dir.writeUInt32LE(compressed.length, 20);
    dir.writeUInt32LE(entry.data.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt16LE(0, 30); // extra
    dir.writeUInt16LE(0, 32); // comment
    dir.writeUInt16LE(0, 34); // disk number
    dir.writeUInt16LE(0, 36); // internal attrs
    dir.writeUInt32LE(0, 38); // external attrs
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuffer, end]);
}

// ---------------------------------------------------------------------------
// Workbook assembly
// ---------------------------------------------------------------------------

/** Turns a set of sheets into a complete .xlsx file. */
export function buildWorkbook(sheets: Sheet[]): Buffer {
  if (sheets.length === 0) throw new Error("A workbook needs at least one sheet");

  const styles = new StyleRegistry();
  const names = sanitizeSheetNames(sheets);
  const sheetXmls = sheets.map((sheet) => sheetXml(sheet, styles));

  const contentTypes =
    `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets
      .map(
        (_, i) =>
          `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join("") +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    "</Types>";

  const rootRels =
    `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
    "</Relationships>";

  const workbook =
    `${XML_DECL}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>` +
    names
      .map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("") +
    "</sheets></workbook>";

  const workbookRels =
    `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join("") +
    `<Relationship Id="rId${sheets.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
    "</Relationships>";

  const utf8 = (name: string, xml: string): ZipEntry => ({ name, data: Buffer.from(xml, "utf8") });

  return zip([
    utf8("[Content_Types].xml", contentTypes),
    utf8("_rels/.rels", rootRels),
    utf8("xl/workbook.xml", workbook),
    utf8("xl/_rels/workbook.xml.rels", workbookRels),
    ...sheetXmls.map((xml, i) => utf8(`xl/worksheets/sheet${i + 1}.xml`, xml)),
    // Styles get serialised last, because every sheet has to be rendered first
    // for the registry to have seen every style it needs to write out.
    utf8("xl/styles.xml", styles.toXml()),
  ]);
}
