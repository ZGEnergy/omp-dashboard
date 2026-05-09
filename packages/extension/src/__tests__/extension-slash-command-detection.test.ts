/**
 * Pure-predicate tests for `isExtensionSlashCommand`.
 * One scenario per ADDED Requirement in
 * openspec/changes/fix-extension-slash-commands-in-dashboard/specs/command-routing/spec.md.
 *
 * regression: see openspec/changes/fix-extension-slash-commands-in-dashboard/
 */
import { describe, it, expect } from "vitest";
import { isExtensionSlashCommand } from "../bridge-context.js";

describe("isExtensionSlashCommand", () => {
  it("detects a bare extension command", () => {
    expect(
      isExtensionSlashCommand("/ctx-stats", [{ name: "ctx-stats", source: "extension" }]),
    ).toBe(true);
  });

  it("detects an extension command with arguments", () => {
    expect(
      isExtensionSlashCommand("/ctx-stats verbose=1", [
        { name: "ctx-stats", source: "extension" },
      ]),
    ).toBe(true);
  });

  it("rejects a skill command (source: skill)", () => {
    expect(
      isExtensionSlashCommand("/skill:foo", [{ name: "skill:foo", source: "skill" }]),
    ).toBe(false);
  });

  it("rejects a prompt template (source: prompt)", () => {
    expect(
      isExtensionSlashCommand("/review", [{ name: "review", source: "prompt" }]),
    ).toBe(false);
  });

  it("rejects bridge-native dashboard command (DASHBOARD_NATIVE_COMMANDS)", () => {
    // `roles` is in DASHBOARD_NATIVE_COMMANDS even though pi-flows registers it
    // with source: extension.
    expect(
      isExtensionSlashCommand("/roles", [{ name: "roles", source: "extension" }]),
    ).toBe(false);
  });

  it("rejects __-prefixed bridge-native command", () => {
    expect(
      isExtensionSlashCommand("/__dashboard_reload", [
        { name: "__dashboard_reload", source: "extension" },
      ]),
    ).toBe(false);
  });

  it("rejects an unknown slash", () => {
    expect(isExtensionSlashCommand("/totally-unknown", [])).toBe(false);
  });

  it("rejects multi-line input", () => {
    expect(
      isExtensionSlashCommand("/ctx-stats\nuser context", [
        { name: "ctx-stats", source: "extension" },
      ]),
    ).toBe(false);
  });

  it("rejects non-slash input", () => {
    expect(
      isExtensionSlashCommand("hello world", [{ name: "ctx-stats", source: "extension" }]),
    ).toBe(false);
  });

  it("rejects empty slash `/`", () => {
    expect(
      isExtensionSlashCommand("/", [{ name: "ctx-stats", source: "extension" }]),
    ).toBe(false);
  });
});
