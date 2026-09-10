import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { imeiCheckDigit, isValidImei, normalizeScan, parseDeviceId } from "./inspection";

describe("isValidImei", () => {
  it("accepts IMEIs with a correct Luhn check digit", () => {
    // These are published test IMEIs.
    assert.equal(isValidImei("490154203237518"), true);
    assert.equal(isValidImei("356938035643809"), true);
  });

  it("rejects a single mistyped digit", () => {
    assert.equal(isValidImei("490154203237519"), false);
  });

  it("rejects transposed digits", () => {
    assert.equal(isValidImei("490154203237581"), false);
  });

  it("rejects anything that is not 15 digits", () => {
    assert.equal(isValidImei(""), false);
    assert.equal(isValidImei("49015420323751"), false);
    assert.equal(isValidImei("4901542032375180"), false);
    assert.equal(isValidImei("49015420323751X"), false);
  });
});

describe("imeiCheckDigit", () => {
  it("produces the digit that completes a valid IMEI", () => {
    assert.equal(imeiCheckDigit("49015420323751"), 8);
    assert.equal(isValidImei("49015420323751" + imeiCheckDigit("49015420323751")), true);
  });

  it("round trips for every prefix it is given", () => {
    for (let n = 0; n < 200; n++) {
      const prefix = String(10_000_000_000_000 + n * 7919).slice(0, 14);
      assert.equal(isValidImei(prefix + imeiCheckDigit(prefix)), true, `failed for ${prefix}`);
    }
  });

  it("refuses inputs that are not 14 digits", () => {
    assert.throws(() => imeiCheckDigit("123"));
  });
});

describe("normalizeScan", () => {
  it("strips the label a scanner prints alongside the code", () => {
    assert.equal(normalizeScan("IMEI:490154203237518"), "490154203237518");
    assert.equal(normalizeScan("imei 490154203237518"), "490154203237518");
    assert.equal(normalizeScan("S/N: gtab00048192"), "GTAB00048192");
  });

  it("removes whitespace anywhere in the scan, including a trailing newline", () => {
    assert.equal(normalizeScan("  4901 5420 3237 518\n"), "490154203237518");
    assert.equal(normalizeScan("490154203237518\u00a0"), "490154203237518");
  });

  it("keeps the letters and dashes a tablet serial needs", () => {
    assert.equal(normalizeScan("gtab-0004-8192"), "GTAB-0004-8192");
  });

  it("caps the length so a runaway scan cannot grow unbounded", () => {
    assert.equal(normalizeScan("4".repeat(200)).length, 20);
  });

  it("leaves an already-clean IMEI untouched", () => {
    assert.equal(normalizeScan("490154203237518"), "490154203237518");
  });
});

describe("parseDeviceId", () => {
  it("recognises a valid IMEI", () => {
    assert.deepEqual(parseDeviceId("490154203237518"), {
      kind: "imei",
      value: "490154203237518",
    });
  });

  it("explains why a numeric ID was rejected", () => {
    const wrongLength = parseDeviceId("49015420323751");
    assert.equal(wrongLength.kind, "invalid");
    assert.match((wrongLength as { reason: string }).reason, /15 digits/);

    const badChecksum = parseDeviceId("490154203237519");
    assert.equal(badChecksum.kind, "invalid");
    assert.match((badChecksum as { reason: string }).reason, /[Cc]hecksum/);
  });

  it("treats alphanumeric IDs as serial numbers and upper cases them", () => {
    assert.deepEqual(parseDeviceId(" gtab00048192 "), {
      kind: "serial",
      value: "GTAB00048192",
    });
  });

  it("rejects serials that are too short or contain punctuation", () => {
    assert.equal(parseDeviceId("AB1").kind, "invalid");
    assert.equal(parseDeviceId("GTAB_0004").kind, "invalid");
  });

  it("rejects an empty scan", () => {
    assert.equal(parseDeviceId("   ").kind, "invalid");
  });
});
