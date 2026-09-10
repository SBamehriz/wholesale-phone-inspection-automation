import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express from "express";

import { registerRoutes } from "./routes";
import { MAX_IMAGES_PER_INSPECTION } from "../shared/inspection";

/**
 * Checks that run against a real HTTP server, so the session cookie, the
 * validation layer and the status codes all get exercised the same way a
 * browser would exercise them.
 */

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let baseUrl: string;
let server: ReturnType<typeof registerRoutes>;
let cookie = "";

before(async () => {
  const app = express();
  app.use(express.json({ limit: "24mb" }));
  server = registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server.close());

async function call(
  method: string,
  path: string,
  body?: unknown,
  options: { auth?: boolean } = { auth: true },
) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth !== false && cookie) headers.Cookie = cookie;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];

  const type = response.headers.get("content-type") ?? "";
  const payload = type.includes("json")
    ? await response.json()
    : type.includes("spreadsheet")
      ? Buffer.from(await response.arrayBuffer())
      : await response.text();

  return { status: response.status, body: payload as any, headers: response.headers };
}

describe("health", () => {
  it("reports without a session", async () => {
    const response = await call("GET", "/api/health", undefined, { auth: false });
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "ok");
  });
});

describe("authentication", () => {
  it("refuses every data route until signed in", async () => {
    for (const path of ["/api/orders", "/api/auth/user", "/api/reports/summary"]) {
      const response = await call("GET", path, undefined, { auth: false });
      assert.equal(response.status, 401, path);
    }
  });

  it("rejects empty credentials", async () => {
    const response = await call("POST", "/api/auth/signin", { username: " ", password: "" });
    assert.equal(response.status, 400);
  });

  it("opens a session and identifies the user", async () => {
    const signIn = await call("POST", "/api/auth/signin", {
      username: "inspector",
      password: "anything",
    });
    assert.equal(signIn.status, 200);
    assert.equal(signIn.body.username, "inspector");

    const me = await call("GET", "/api/auth/user");
    assert.equal(me.status, 200);
    assert.equal(me.body.username, "inspector");
  });
});

describe("orders", () => {
  it("lists the seeded lots with their counts", async () => {
    const response = await call("GET", "/api/orders");
    assert.equal(response.status, 200);
    assert.ok(response.body.length >= 5);
    assert.ok(response.body.every((order: any) => typeof order.completedCount === "number"));
  });

  it("validates the payload before creating anything", async () => {
    const noClient = await call("POST", "/api/orders", { expectedQuantity: 4 });
    assert.equal(noClient.status, 400);
    assert.match(noClient.body.message, /[Cc]lient/);

    const badQuantity = await call("POST", "/api/orders", { client: "X", expectedQuantity: 0 });
    assert.equal(badQuantity.status, 400);

    const badNumber = await call("POST", "/api/orders", {
      client: "X",
      expectedQuantity: 2,
      orderNumber: "123",
    });
    assert.equal(badNumber.status, 400);
    assert.match(badNumber.body.message, /12 digits/);
  });

  it("refuses a duplicate order number", async () => {
    const first = await call("POST", "/api/orders", {
      client: "Duplicate Co",
      expectedQuantity: 2,
      orderNumber: "999888777666",
    });
    assert.equal(first.status, 201);

    const second = await call("POST", "/api/orders", {
      client: "Someone Else",
      expectedQuantity: 2,
      orderNumber: "999888777666",
    });
    assert.equal(second.status, 409);
  });

  it("404s an unknown order and 400s a malformed id", async () => {
    assert.equal((await call("GET", "/api/orders/999999")).status, 404);
    assert.equal((await call("GET", "/api/orders/abc")).status, 400);
  });
});

describe("the inspection workflow", () => {
  let orderId: number;

  it("creates the lot to work", async () => {
    const response = await call("POST", "/api/orders", {
      client: "Workflow Test Ltd",
      expectedQuantity: 2,
      description: "Two devices",
    });
    assert.equal(response.status, 201);
    orderId = response.body.id;
  });

  it("identifies a device from its IMEI", async () => {
    const response = await call("GET", "/api/devices/356741080481921");
    assert.equal(response.status, 200);
    assert.equal(response.body.brand, "Apple");
    assert.equal(response.body.source, "tac");
  });

  it("rejects an IMEI that fails its checksum", async () => {
    const response = await call("GET", "/api/devices/356741080481922");
    assert.equal(response.status, 400);
    assert.match(response.body.message, /[Cc]hecksum/);
  });

  it("refuses to record a device with a bad ID or unknown grade", async () => {
    const badId = await call("POST", "/api/inspections", {
      deviceId: "123",
      orderId,
      grade: "A",
    });
    assert.equal(badId.status, 400);

    const badGrade = await call("POST", "/api/inspections", {
      deviceId: "490154203237518",
      orderId,
      grade: "Z",
    });
    assert.equal(badGrade.status, 400);

    const badDefect = await call("POST", "/api/inspections", {
      deviceId: "490154203237518",
      orderId,
      grade: "A",
      defects: ["haunted"],
    });
    assert.equal(badDefect.status, 400);
  });

  it("records a device", async () => {
    const response = await call("POST", "/api/inspections", {
      deviceId: "490154203237518",
      orderId,
      grade: "B+",
      defects: ["screen-crack"],
      notes: "Hairline crack in the top corner",
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.status, "scanning");
    assert.deepEqual(response.body.defects, ["screen-crack"]);
  });

  it("reports a duplicate scan with the record that already exists", async () => {
    const response = await call("POST", "/api/inspections", {
      deviceId: "490154203237518",
      orderId,
      grade: "A",
    });
    assert.equal(response.status, 409);
    assert.equal(response.body.inspection.deviceId, "490154203237518");
  });

  it("will not sign off a device with no photo evidence", async () => {
    const { body } = await call("GET", `/api/orders/${orderId}`);
    const inspection = body.inspections[0];

    const response = await call("POST", `/api/inspections/${inspection.id}/complete`);
    assert.equal(response.status, 409);
    assert.match(response.body.message, /photo/i);
  });

  it("validates images before storing them", async () => {
    const { body } = await call("GET", `/api/orders/${orderId}`);
    const id = body.inspections[0].id;

    assert.equal((await call("POST", `/api/inspections/${id}/images`, { images: [] })).status, 400);
    assert.equal(
      (await call("POST", `/api/inspections/${id}/images`, { images: ["https://example.com/x.jpg"] }))
        .status,
      400,
    );
    assert.equal(
      (
        await call("POST", `/api/inspections/${id}/images`, {
          images: Array(MAX_IMAGES_PER_INSPECTION + 1).fill(PIXEL),
        })
      ).status,
      400,
    );
  });

  it("attaches photos and advances the device", async () => {
    const { body } = await call("GET", `/api/orders/${orderId}`);
    const id = body.inspections[0].id;

    const response = await call("POST", `/api/inspections/${id}/images`, { images: [PIXEL] });
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "photographed");
    assert.equal(response.body.images.length, 1);
  });

  it("signs the device off, leaving the order open until the lot is done", async () => {
    const { body } = await call("GET", `/api/orders/${orderId}`);
    const id = body.inspections[0].id;

    const response = await call("POST", `/api/inspections/${id}/complete`);
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "completed");

    const after = await call("GET", `/api/orders/${orderId}`);
    assert.equal(after.body.order.status, "active");
    assert.equal(after.body.order.completedCount, 1);
  });

  it("completes the order once the second device is finished", async () => {
    const created = await call("POST", "/api/inspections", {
      deviceId: "356938035643809",
      orderId,
      grade: "A",
    });
    await call("POST", `/api/inspections/${created.body.id}/images`, { images: [PIXEL] });
    await call("POST", `/api/inspections/${created.body.id}/complete`);

    const response = await call("GET", `/api/orders/${orderId}`);
    assert.equal(response.body.order.status, "completed");
    assert.ok(response.body.order.completedAt);
  });

  it("edits a recorded device", async () => {
    const { body } = await call("GET", `/api/orders/${orderId}`);
    const id = body.inspections[0].id;

    const response = await call("PATCH", `/api/inspections/${id}`, { grade: "C", defects: [] });
    assert.equal(response.status, 200);
    assert.equal(response.body.grade, "C");
    assert.deepEqual(response.body.defects, []);
  });

  it("removes a device and reopens the order", async () => {
    const { body } = await call("GET", `/api/orders/${orderId}`);
    const id = body.inspections[0].id;

    assert.equal((await call("DELETE", `/api/inspections/${id}`)).status, 204);
    assert.equal((await call("DELETE", `/api/inspections/${id}`)).status, 404);

    const response = await call("GET", `/api/orders/${orderId}`);
    assert.equal(response.body.order.status, "active");
  });
});

describe("reports", () => {
  it("summarises grades and defects across every device", async () => {
    const response = await call("GET", "/api/reports/summary");
    assert.equal(response.status, 200);
    assert.ok(response.body.devices > 0);
    assert.equal(typeof response.body.grades, "object");
  });

  it("serves an order workbook as a spreadsheet download", async () => {
    const response = await call("GET", "/api/orders/1/report.xlsx");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type")!, /spreadsheetml/);
    assert.match(response.headers.get("content-disposition")!, /attachment; filename=".*\.xlsx"/);
    // Every xlsx is a ZIP, so it starts with the local file header signature.
    assert.equal(response.body.subarray(0, 2).toString("latin1"), "PK");
  });

  it("serves the portfolio workbook", async () => {
    const response = await call("GET", "/api/reports/completed.xlsx");
    assert.equal(response.status, 200);
    assert.equal(response.body.subarray(0, 2).toString("latin1"), "PK");
  });

  it("404s a report for an order that does not exist", async () => {
    assert.equal((await call("GET", "/api/orders/999999/report.xlsx")).status, 404);
  });
});

describe("sign out", () => {
  it("ends the session", async () => {
    assert.equal((await call("POST", "/api/auth/signout")).status, 200);
    assert.equal((await call("GET", "/api/orders")).status, 401);
  });
});
