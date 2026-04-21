/**
 * Family I — settings.json shape variants.
 *
 * I1: malformed-settings     — broken JSON in settings.json.
 * I2: settings-other-packages — settings contains unrelated extensions
 *     that MUST be preserved across bridge registration.
 *
 * Bridge-registration semantics live in `registerBridgeExtension`,
 * which uses node:fs directly. The harness can only assert input
 * (fake settings.json shape visible via readSettings) — full round-trip
 * asserting preservation lands when bridge-register is refactored
 * to accept an injectable fs (future task, cross-proposal).
 */
import { describe, expect, it } from "vitest";
import { withFakeEnv } from "../harness.js";
import * as fixtures from "../fixtures/index.js";
import { register, SKIPPED_SCENARIOS, cellKey } from "../scenarios.js";

const I = [
  { platform: "linux", dash: "managed", pi: "present-valid", settings: "malformed", env: "normal" },
] as const;
for (const cell of I) {
  register(cell, "families/i-malformed-settings.test.ts");
  SKIPPED_SCENARIOS.delete(cellKey(cell));
}

describe("Family I — settings.json variants", () => {
  it("I1 — malformed JSON surfaces as null from readSettings", async () => {
    const homedir = "/home/r";
    await withFakeEnv(
      {
        platform: "linux",
        homedir,
        fs: fixtures.settingsJson({
          homedir,
          platform: "linux",
          malformed: true,
        }),
      },
      (ctx) => {
        // readSettings returns null for malformed JSON — tolerant
        // fallback behavior. Consumers (registerBridgeExtension)
        // treat null as "start fresh".
        expect(ctx.readSettings()).toBeNull();
      },
    );
  });

  it("I2 — settings with unrelated packages is preserved in fixture", async () => {
    const homedir = "/home/r";
    await withFakeEnv(
      {
        platform: "linux",
        homedir,
        fs: fixtures.settingsJson({
          homedir,
          platform: "linux",
          packages: [
            "/home/r/.pi/extensions/custom-pkg",
            "/home/r/.pi/extensions/another-pkg",
          ],
        }),
      },
      (ctx) => {
        const settings = ctx.readSettings();
        expect(settings).toEqual({
          packages: [
            "/home/r/.pi/extensions/custom-pkg",
            "/home/r/.pi/extensions/another-pkg",
          ],
        });
        // Full round-trip preservation test: pending bridge-register
        // fs injection. Asserted at input side only for now.
      },
    );
  });
});
