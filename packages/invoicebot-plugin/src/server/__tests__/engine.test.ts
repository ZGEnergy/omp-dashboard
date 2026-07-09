/**
 * FakeInvoiceEngine returns the documented `details` shapes for every selector
 * (api-contract §6–§9), and sets `flow` for exactly the five flow-triggering
 * ops. Routes import only the port, so these shapes are the client contract.
 * See change: add-invoicebot-rest-plugin (§3.5).
 */
import { describe, expect, it } from "vitest";
import { FakeInvoiceEngine } from "../engine/fake.js";
import type { InvoiceEngine } from "../engine/port.js";

const CWD = "/work/acme";
const engine: InvoiceEngine = new FakeInvoiceEngine();

describe("FakeInvoiceEngine — query views", () => {
  it("pending → { items: PendingItem[] }", async () => {
    const r = await engine.query(CWD, { view: "pending" });
    expect(Array.isArray((r.details as any).items)).toBe(true);
    expect((r.details as any).items[0]).toHaveProperty("id");
    expect(r.flow).toBeUndefined();
  });

  it("list (grouped) → { total, groups }", async () => {
    const r = await engine.query(CWD, { view: "list" });
    expect(r.details).toHaveProperty("total");
    expect(r.details).toHaveProperty("groups");
  });

  it("list (state filter) → { state, items }", async () => {
    const r = await engine.query(CWD, { view: "list", state: "pending_approval" });
    expect((r.details as any).state).toBe("pending_approval");
    expect((r.details as any).items.every((i: any) => i.state === "pending_approval")).toBe(true);
  });

  it("list (all) → flat { items }", async () => {
    const r = await engine.query(CWD, { view: "list", state: "all" });
    expect(Array.isArray((r.details as any).items)).toBe(true);
    expect(r.details).not.toHaveProperty("groups");
  });

  it("search → { ids }", async () => {
    const r = await engine.query(CWD, { view: "search", query: "INV-2024-001" });
    expect(Array.isArray((r.details as any).ids)).toBe(true);
  });

  it("search without query → ok:false", async () => {
    const r = await engine.query(CWD, { view: "search" });
    expect(r.details.ok).toBe(false);
  });

  it("surface → ApprovalSurface (invoice_id echoed)", async () => {
    const r = await engine.query(CWD, { view: "surface", invoice_id: "z9" });
    expect((r.details as any).invoice_id).toBe("z9");
    expect((r.details as any).summary).toHaveProperty("invoiceNumber");
    expect((r.details as any).actions).toEqual(["approve", "reject"]);
  });

  it("status → SetupStatus w/ cadence", async () => {
    const r = await engine.query(CWD, { view: "status" });
    expect(r.details).toHaveProperty("setup_complete");
    expect((r.details as any).cadence).toHaveProperty("process");
  });

  it("finance → { settled, outstanding, totals }", async () => {
    const r = await engine.query(CWD, { view: "finance" });
    expect((r.details as any).totals).toHaveProperty("outstanding");
  });

  it("rules → { effective, all }", async () => {
    const r = await engine.query(CWD, { view: "rules" });
    expect(Array.isArray((r.details as any).effective)).toBe(true);
  });

  it("diagram → { mermaid }", async () => {
    const r = await engine.query(CWD, { view: "diagram" });
    expect(typeof (r.details as any).mermaid).toBe("string");
  });

  it("unknown view → ok:false", async () => {
    const r = await engine.query(CWD, { view: "nope" });
    expect(r.details.ok).toBe(false);
  });
});

describe("FakeInvoiceEngine — flow-triggering vs pure ops", () => {
  it("approve carries flow invoicebot:process (task)", async () => {
    const r = await engine.review(CWD, { action: "approve", invoice_id: "a1b2" });
    expect(r.flow).toEqual({ flowName: "invoicebot:process", task: "source://a1b2" });
  });

  it("repair carries flow invoicebot:process (inputs)", async () => {
    const r = await engine.review(CWD, { action: "repair", invoice_id: "a1b2", patch: { currency: "HUF" } });
    expect(r.flow).toEqual({ flowName: "invoicebot:process", inputs: { invoice_id: "a1b2" } });
  });

  it("partner confirm carries flow", async () => {
    const r = await engine.review(CWD, { action: "partner", op: "confirm", invoice_id: "a1b2" });
    expect(r.flow?.flowName).toBe("invoicebot:process");
  });

  it("submit carries flow", async () => {
    const r = await engine.review(CWD, { action: "submit", ref: "/tmp/x.pdf" });
    expect(r.flow).toEqual({ flowName: "invoicebot:process", task: "/tmp/x.pdf" });
  });

  it("rules request carries flow invoicebot:add-rule", async () => {
    const r = await engine.rules(CWD, { action: "request", id: "r2", seq: 20, description: "x" });
    expect(r.flow?.flowName).toBe("invoicebot:add-rule");
  });

  it("note is pure (no flow)", async () => {
    const r = await engine.review(CWD, { action: "note", target_kind: "invoice", target_id: "x", author: "a", text: "t" });
    expect(r.flow).toBeUndefined();
    expect((r.details as any).note).toBeTruthy();
  });

  it("handoff prepare vs deliver (no flow)", async () => {
    const prep = await engine.review(CWD, { action: "handoff", target_id: "book1" });
    expect((prep.details as any).status).toBe("prepared");
    const sent = await engine.review(CWD, { action: "handoff", target_id: "book1", confirm: true });
    expect((sent.details as any).status).toBe("sent");
    expect(sent.flow).toBeUndefined();
  });

  it("setup connector is pure", async () => {
    const r = await engine.setup(CWD, { action: "connector", id: "drop", kind: "folder", config: { path: "/x" } });
    expect(r.flow).toBeUndefined();
    expect((r.details as any).connector.id).toBe("drop");
  });

  it("rules approve/reject/move/archive are pure", async () => {
    for (const a of [
      { action: "approve", id: "r2" },
      { action: "reject", id: "r2" },
      { action: "move", id: "r2", seq: 5 },
      { action: "archive", id: "r2" },
    ]) {
      const r = await engine.rules(CWD, a);
      expect(r.flow).toBeUndefined();
    }
  });
});
