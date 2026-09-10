import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { InMemoryStorage } from "./storage";

let store: InMemoryStorage;
let inspectorId: number;

beforeEach(() => {
  store = new InMemoryStorage();
  inspectorId = store.getUserByUsername("demo")!.id;
});

function newOrder(expectedQuantity: number) {
  return store.createOrder({
    orderNumber: "111111111111",
    client: "Test Client",
    description: "",
    expectedQuantity,
    createdBy: inspectorId,
  });
}

function scan(orderId: number, deviceId: string, grade = "A") {
  return store.createInspection({ deviceId, orderId, grade, defects: [], inspectorId });
}

describe("seeded demo data", () => {
  it("ships orders in every state the UI has to render", () => {
    const orders = store.listOrders();
    assert.ok(orders.some((o) => o.status === "completed"));
    assert.ok(orders.some((o) => o.status === "active" && o.scannedCount > 0));
    assert.ok(orders.some((o) => o.scannedCount === 0));
  });

  it("counts inspections consistently with the order status", () => {
    for (const order of store.listOrders()) {
      const inspections = store.listInspections(order.id);
      assert.equal(order.scannedCount, inspections.length);
      assert.equal(
        order.completedCount,
        inspections.filter((i) => i.status === "completed").length,
      );
      if (order.status === "completed") {
        assert.equal(order.completedCount, order.expectedQuantity);
        assert.ok(order.completedAt instanceof Date);
      }
    }
  });

  it("gives every finished device the photo evidence completion requires", () => {
    for (const order of store.listOrders()) {
      for (const inspection of store.listInspections(order.id)) {
        if (inspection.status === "completed") {
          assert.ok(inspection.images.length > 0, `${inspection.deviceId} has no photos`);
        }
      }
    }
  });

  it("identifies every seeded device from its ID alone", () => {
    for (const order of store.listOrders()) {
      for (const inspection of store.listInspections(order.id)) {
        assert.notEqual(inspection.specs, null);
        assert.notEqual(inspection.specs!.source, "unknown", inspection.deviceId);
      }
    }
  });

  it("issues unique device IDs across the whole dataset", () => {
    const ids = store
      .listOrders()
      .flatMap((order) => store.listInspections(order.id).map((i) => i.deviceId));
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("order completion", () => {
  it("stays active while devices are still expected", () => {
    const order = newOrder(3);
    const first = scan(order.id, "490154203237518");
    store.addImages(first.id, ["data:image/png;base64,AAAA"]);
    store.completeInspection(first.id);

    assert.equal(store.getOrder(order.id)!.status, "active");
  });

  it("completes only once every expected device is finished", () => {
    const order = newOrder(2);
    for (const deviceId of ["490154203237518", "356938035643809"]) {
      const inspection = scan(order.id, deviceId);
      store.addImages(inspection.id, ["data:image/png;base64,AAAA"]);
      store.completeInspection(inspection.id);
    }

    const completed = store.getOrder(order.id)!;
    assert.equal(completed.status, "completed");
    assert.ok(completed.completedAt);
  });

  it("reopens when a device is deleted or the expected count grows", () => {
    const order = newOrder(1);
    const inspection = scan(order.id, "490154203237518");
    store.addImages(inspection.id, ["data:image/png;base64,AAAA"]);
    store.completeInspection(inspection.id);
    assert.equal(store.getOrder(order.id)!.status, "completed");

    store.updateOrder(order.id, { expectedQuantity: 2 });
    assert.equal(store.getOrder(order.id)!.status, "active");
    assert.equal(store.getOrder(order.id)!.completedAt, null);

    store.updateOrder(order.id, { expectedQuantity: 1 });
    assert.equal(store.getOrder(order.id)!.status, "completed");

    store.deleteInspection(inspection.id);
    assert.equal(store.getOrder(order.id)!.status, "active");
  });
});

describe("inspections", () => {
  it("normalises the device ID it stores", () => {
    const order = newOrder(5);
    const inspection = scan(order.id, " gtab00048192 ");
    assert.equal(inspection.deviceId, "GTAB00048192");
    assert.equal(inspection.idKind, "serial");
  });

  it("finds a device however the ID was typed", () => {
    const order = newOrder(5);
    scan(order.id, "GTAB00048192");
    assert.ok(store.findInspection(order.id, " gtab00048192 "));
    assert.equal(store.findInspection(order.id, "GTAB00048193"), undefined);
  });

  it("scopes devices to their order", () => {
    const a = newOrder(5);
    const b = store.createOrder({
      orderNumber: "222222222222",
      client: "Other",
      description: "",
      expectedQuantity: 5,
      createdBy: inspectorId,
    });
    scan(a.id, "490154203237518");
    assert.ok(store.findInspection(a.id, "490154203237518"));
    assert.equal(store.findInspection(b.id, "490154203237518"), undefined);
  });

  it("moves to photographed on the first upload and caps the gallery", () => {
    const order = newOrder(5);
    const inspection = scan(order.id, "490154203237518");
    assert.equal(inspection.status, "scanning");

    store.addImages(inspection.id, ["data:image/png;base64,AAAA"]);
    assert.equal(store.getInspection(inspection.id)!.status, "photographed");
    assert.ok(store.getInspection(inspection.id)!.photographedAt);

    store.addImages(inspection.id, Array(10).fill("data:image/png;base64,BBBB"));
    assert.equal(store.getInspection(inspection.id)!.images.length, 6);
  });

  it("rejects a device ID that fails its checksum", () => {
    const order = newOrder(5);
    assert.throws(() => scan(order.id, "490154203237519"), /[Cc]hecksum/);
  });

  it("reports whether a delete found anything", () => {
    const order = newOrder(5);
    const inspection = scan(order.id, "490154203237518");
    assert.equal(store.deleteInspection(inspection.id), true);
    assert.equal(store.deleteInspection(inspection.id), false);
  });
});

describe("orders", () => {
  it("allocates an unused order number when none is given", () => {
    const order = store.createOrder({
      client: "Auto",
      description: "",
      expectedQuantity: 4,
      createdBy: inspectorId,
    });
    assert.match(order.orderNumber, /^\d{12}$/);
    assert.equal(store.getOrderByNumber(order.orderNumber)!.id, order.id);
  });

  it("lists newest first", () => {
    const orders = store.listOrders();
    for (let i = 1; i < orders.length; i++) {
      assert.ok(orders[i - 1].createdAt.getTime() >= orders[i].createdAt.getTime());
    }
  });
});
