/**
 * Engine binding selection (§3.4). Prefer the Real engine (invoice-bot facade
 * over the `file:` link); fall back to the Fake when the facade is absent
 * (CI / `release-cut` / git worktree). Logs which binding is active at load.
 * See change: add-invoicebot-rest-plugin.
 */

import { FakeInvoiceEngine } from "./fake.js";
import type { BoundEngine } from "./port.js";
import { loadRealEngine } from "./real.js";

export async function selectEngine(log: (m: string) => void): Promise<BoundEngine> {
  const real = await loadRealEngine();
  if (real) {
    log("invoicebot-plugin: bound RealInvoiceEngine (invoice-bot facade resolved over the file: link)");
    return { engine: real, binding: "real" };
  }
  log(
    "invoicebot-plugin: bound FakeInvoiceEngine (invoice-bot facade absent — CI/release-cut/worktree). " +
      "TODO(release): retire the file: link so shipped builds bind the real engine.",
  );
  return { engine: new FakeInvoiceEngine(), binding: "fake" };
}
