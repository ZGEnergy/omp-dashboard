/**
 * Tests for the provider-catalogue cache.
 * See change: replace-hardcoded-provider-lists.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  setCatalogueForSession,
  getCatalogueForSession,
  getLatestCatalogue,
  clearForSession,
  _resetForTests,
} from "../provider-catalogue-cache.js";
import type { ProviderInfo } from "@blackbelt-technology/pi-dashboard-shared/types.js";

const A: ProviderInfo = { id: "a", displayName: "A", hasOAuth: false, configured: false };
const B: ProviderInfo = { id: "b", displayName: "B", hasOAuth: false, configured: false };

describe("provider-catalogue-cache", () => {
  beforeEach(() => _resetForTests());

  it("starts empty", () => {
    expect(getLatestCatalogue()).toEqual([]);
    expect(getCatalogueForSession("s1")).toBeUndefined();
  });

  it("set/get per session", () => {
    setCatalogueForSession("s1", [A]);
    expect(getCatalogueForSession("s1")).toEqual([A]);
  });

  it("latestSnapshot reflects most recent push across sessions", () => {
    setCatalogueForSession("s1", [A]);
    expect(getLatestCatalogue()).toEqual([A]);
    setCatalogueForSession("s2", [A, B]);
    expect(getLatestCatalogue()).toEqual([A, B]);
  });

  it("clearForSession removes that session and clears latest only when empty", () => {
    setCatalogueForSession("s1", [A]);
    setCatalogueForSession("s2", [B]);
    clearForSession("s1");
    expect(getCatalogueForSession("s1")).toBeUndefined();
    expect(getLatestCatalogue()).toEqual([B]);
    clearForSession("s2");
    expect(getLatestCatalogue()).toEqual([]);
  });

  it("_resetForTests wipes everything", () => {
    setCatalogueForSession("s1", [A]);
    _resetForTests();
    expect(getLatestCatalogue()).toEqual([]);
    expect(getCatalogueForSession("s1")).toBeUndefined();
  });

  // Regression — see change: fix-providers-list-spurious-models-refreshed
  describe("setCatalogueForSession `changed` signal", () => {
    it("reports changed=true on first write", () => {
      const r = setCatalogueForSession("s1", [A]);
      expect(r).toEqual({ changed: true });
    });

    it("reports changed=false when re-writing identical content", () => {
      setCatalogueForSession("s1", [A, B]);
      const r = setCatalogueForSession("s1", [A, B]);
      expect(r).toEqual({ changed: false });
    });

    it("reports changed=false when re-writing identical content from a fresh array reference", () => {
      // Critical: the bridge re-builds the array on every push, so reference
      // equality won't help. Deep equality MUST work.
      setCatalogueForSession("s1", [{ ...A }, { ...B }]);
      const r = setCatalogueForSession("s1", [{ ...A }, { ...B }]);
      expect(r).toEqual({ changed: false });
    });

    it("reports changed=true when length changes", () => {
      setCatalogueForSession("s1", [A]);
      const r = setCatalogueForSession("s1", [A, B]);
      expect(r).toEqual({ changed: true });
    });

    it("reports changed=true when a field on any entry differs", () => {
      setCatalogueForSession("s1", [{ ...A, configured: false }]);
      const r = setCatalogueForSession("s1", [{ ...A, configured: true }]);
      expect(r).toEqual({ changed: true });
    });

    it("reports changed=true when the order of entries differs", () => {
      setCatalogueForSession("s1", [A, B]);
      const r = setCatalogueForSession("s1", [B, A]);
      expect(r).toEqual({ changed: true });
    });

    it("reports changed=true when the `custom` flag flips", () => {
      // The known race covered by `fix-custom-provider-flag-race`: first push
      // has no custom flag, second push has it after `discoverModels` resolves.
      setCatalogueForSession("s1", [{ ...A }]);
      const r = setCatalogueForSession("s1", [{ ...A, custom: true }]);
      expect(r).toEqual({ changed: true });
    });

    it("keeps the cached value updated regardless of changed signal", () => {
      setCatalogueForSession("s1", [A]);
      // Even when changed=false (write a duplicate), the entry must still be
      // present (mutating a `Map` to the same value is safe).
      setCatalogueForSession("s1", [A]);
      expect(getCatalogueForSession("s1")).toEqual([A]);
    });

    it("latestSnapshot is updated only when content changes", () => {
      // Latest tracks the most-recent CHANGED catalogue. A no-op write to s1
      // after an unrelated push to s2 must not clobber the latest.
      setCatalogueForSession("s1", [A]);
      setCatalogueForSession("s2", [A, B]);
      expect(getLatestCatalogue()).toEqual([A, B]);
      setCatalogueForSession("s1", [A]); // identical re-push
      // latest should still reflect the s2 catalogue (most-recent CHANGE).
      expect(getLatestCatalogue()).toEqual([A, B]);
    });
  });
});
