import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inflateRawSync } from "node:zlib";

import { buildWorkbook, columnName, type Sheet } from "./xlsx";

/** A small ZIP reader, so the tests check the container we actually write. */
function readZip(buffer: Buffer): Map<string, string> {
  const entries = new Map<string, string>();

  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.notEqual(eocd, -1, "end of central directory record missing");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, "bad central directory signature");
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");

    assert.equal(buffer.readUInt32LE(localOffset), 0x04034b50, "bad local header signature");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = inflateRawSync(buffer.subarray(dataStart, dataStart + compressedSize));

    entries.set(name, data.toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/** Catches unbalanced tags, and raw ampersands or angle brackets in cell text. */
function assertWellFormed(xml: string, label: string) {
  const stack: string[] = [];
  const tag = /<\/?([A-Za-z_:][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  const body = xml.replace(/<\?xml[^>]*\?>/, "");

  let match: RegExpExecArray | null;
  let consumed = 0;
  while ((match = tag.exec(body))) {
    const text = body.slice(consumed, match.index);
    assert.ok(!/[<>]/.test(text), `${label}: unescaped angle bracket in text`);
    assert.ok(!/&(?!(amp|lt|gt|quot|apos|#\d+);)/.test(text), `${label}: unescaped ampersand`);
    consumed = match.index + match[0].length;

    const [, name, , selfClosing] = match;
    if (match[0].startsWith("</")) {
      assert.equal(stack.pop(), name, `${label}: mismatched </${name}>`);
    } else if (!selfClosing) {
      stack.push(name);
    }
  }
  assert.deepEqual(stack, [], `${label}: unclosed tags`);
}

const sample: Sheet[] = [
  {
    name: "Summary",
    columns: [30, 20],
    merges: ["A1:B1"],
    rows: [
      { cells: [{ value: "Inspection Report", style: { bold: true, fontSize: 18 } }], height: 30 },
      { cells: ["Devices", 24] },
      { cells: ["Completion", { value: 0.75, style: { numberFormat: "0.0%" } }] },
      { cells: ["Generated", new Date("2025-03-01T12:00:00Z")] },
      { cells: [] },
      {
        cells: [
          { value: "Grade", style: { bold: true, fill: "1C1C1E", color: "FFFFFF", border: true } },
          { value: "A+", style: { fill: "D6F5E3", border: true, align: "center" } },
        ],
      },
    ],
  },
  {
    name: "Devices",
    freezeRows: 1,
    autoFilter: "A1:B1",
    rows: [
      { cells: ["Device ID", "Notes"] },
      { cells: ["490154203237518", `Cracked <screen> & "water" damage, 'parts only'`] },
    ],
  },
];

describe("columnName", () => {
  it("maps column numbers onto spreadsheet letters", () => {
    assert.equal(columnName(1), "A");
    assert.equal(columnName(26), "Z");
    assert.equal(columnName(27), "AA");
    assert.equal(columnName(52), "AZ");
    assert.equal(columnName(53), "BA");
    assert.equal(columnName(702), "ZZ");
  });
});

describe("buildWorkbook", () => {
  const files = readZip(buildWorkbook(sample));

  it("writes every part Excel requires to open the file", () => {
    for (const part of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]) {
      assert.ok(files.has(part), `missing ${part}`);
    }
  });

  it("emits XML that is well formed in every part", () => {
    for (const [name, xml] of files) assertWellFormed(xml, name);
  });

  it("declares a content type for every worksheet", () => {
    const contentTypes = files.get("[Content_Types].xml")!;
    assert.match(contentTypes, /PartName="\/xl\/worksheets\/sheet1\.xml"/);
    assert.match(contentTypes, /PartName="\/xl\/worksheets\/sheet2\.xml"/);
    assert.match(contentTypes, /PartName="\/xl\/styles\.xml"/);
  });

  it("points each workbook sheet at a declared relationship", () => {
    const workbook = files.get("xl/workbook.xml")!;
    const rels = files.get("xl/_rels/workbook.xml.rels")!;
    const referenced = [...workbook.matchAll(/r:id="(rId\d+)"/g)].map((m) => m[1]);
    assert.equal(referenced.length, 2);
    for (const id of referenced) assert.ok(rels.includes(`Id="${id}"`), `${id} not declared`);
  });

  it("keeps the two reserved fills at the head of the fill table", () => {
    const styles = files.get("xl/styles.xml")!;
    const fills = styles.slice(styles.indexOf("<fills"), styles.indexOf("</fills>"));
    assert.ok(fills.indexOf('patternType="none"') < fills.indexOf('patternType="gray125"'));
    assert.ok(fills.indexOf('patternType="gray125"') < fills.indexOf('patternType="solid"'));
  });

  it("registers every style index a sheet refers to", () => {
    const styles = files.get("xl/styles.xml")!;
    const declared = Number(styles.match(/<cellXfs count="(\d+)"/)![1]);
    assert.equal(declared, (styles.match(/<xf [^>]*xfId="0"/g) ?? []).length);

    for (const [name, xml] of files) {
      if (!name.startsWith("xl/worksheets/")) continue;
      for (const match of xml.matchAll(/<c [^>]*s="(\d+)"/g)) {
        assert.ok(Number(match[1]) < declared, `${name} uses undeclared style ${match[1]}`);
      }
    }
  });

  it("writes numbers as numbers and text as inline strings", () => {
    const sheet = files.get("xl/worksheets/sheet1.xml")!;
    assert.match(sheet, /<c r="B2"[^>]*><v>24<\/v><\/c>/);
    assert.match(sheet, /<c r="A2"[^>]*t="inlineStr"><is><t[^>]*>Devices<\/t>/);
  });

  it("converts dates to Excel serials", () => {
    // 2025-03-01T12:00Z is day 45717 plus half a day.
    assert.match(files.get("xl/worksheets/sheet1.xml")!, /<v>45717\.5<\/v>/);
  });

  it("escapes characters that would otherwise break the XML", () => {
    const sheet = files.get("xl/worksheets/sheet2.xml")!;
    assert.match(sheet, /Cracked &lt;screen&gt; &amp; &quot;water&quot;/);
  });

  it("records freeze panes, filters and merges", () => {
    assert.match(files.get("xl/worksheets/sheet2.xml")!, /<pane ySplit="1"[^>]*state="frozen"\/>/);
    assert.match(files.get("xl/worksheets/sheet2.xml")!, /<autoFilter ref="A1:B1"\/>/);
    assert.match(files.get("xl/worksheets/sheet1.xml")!, /<mergeCell ref="A1:B1"\/>/);
  });

  it("orders autoFilter before mergeCells, as the schema requires", () => {
    const xml = buildWorkbook([
      { name: "S", autoFilter: "A1:B1", merges: ["A1:B1"], rows: [{ cells: ["a", "b"] }] },
    ]);
    const sheet = readZip(xml).get("xl/worksheets/sheet1.xml")!;
    assert.ok(sheet.indexOf("<autoFilter") < sheet.indexOf("<mergeCells"));
  });

  it("makes sheet names legal and unique", () => {
    const files = readZip(
      buildWorkbook([
        { name: "Report[2024]/Q1", rows: [{ cells: ["a"] }] },
        { name: "Report 2024 Q1", rows: [{ cells: ["a"] }] },
        { name: "Report 2024 Q1", rows: [{ cells: ["a"] }] },
        { name: "x".repeat(60), rows: [{ cells: ["a"] }] },
      ]),
    );
    const names = [...files.get("xl/workbook.xml")!.matchAll(/name="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(names.slice(0, 3), ["Report 2024 Q1", "Report 2024 Q1 2", "Report 2024 Q1 3"]);
    assert.equal(names[3].length, 31);
    for (const name of names) assert.ok(!/[[\]:*?/\\]/.test(name));
  });

  it("refuses to build an empty workbook", () => {
    assert.throws(() => buildWorkbook([]), /at least one sheet/);
  });
});
