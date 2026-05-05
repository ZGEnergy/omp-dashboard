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
});
