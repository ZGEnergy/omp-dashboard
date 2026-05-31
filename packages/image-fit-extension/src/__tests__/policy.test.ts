import { describe, expect, it } from "vitest";
import { DEFAULTS, readConfigFromEnv } from "../policy.js";

describe("readConfigFromEnv", () => {
  it("returns documented defaults for empty env", () => {
    const cfg = readConfigFromEnv({ env: {}, warn: () => {} });
    expect(cfg).toEqual({
      disabled: false,
      maxEdge: 1568,
      maxBytes: 4 * 1024 * 1024,
      quality: 85,
    });
    // DEFAULTS export matches what readConfigFromEnv returns for empty env.
    expect(DEFAULTS).toEqual(cfg);
  });

  it.each(["1", "true", "yes", "ON", "True"])(
    "treats PI_IMAGE_FIT_DISABLE=%s as truthy",
    (raw) => {
      const cfg = readConfigFromEnv({ env: { PI_IMAGE_FIT_DISABLE: raw }, warn: () => {} });
      expect(cfg.disabled).toBe(true);
    },
  );

  it.each(["0", "false", "no", "off", ""])(
    "treats PI_IMAGE_FIT_DISABLE=%s as falsy",
    (raw) => {
      const cfg = readConfigFromEnv({ env: { PI_IMAGE_FIT_DISABLE: raw }, warn: () => {} });
      expect(cfg.disabled).toBe(false);
    },
  );

  it("accepts numeric overrides", () => {
    const cfg = readConfigFromEnv({
      env: {
        PI_IMAGE_FIT_MAX_EDGE: "1024",
        PI_IMAGE_FIT_MAX_BYTES: "1048576",
        PI_IMAGE_FIT_QUALITY: "75",
      },
      warn: () => {},
    });
    expect(cfg.maxEdge).toBe(1024);
    expect(cfg.maxBytes).toBe(1048576);
    expect(cfg.quality).toBe(75);
  });

  it.each([
    ["PI_IMAGE_FIT_MAX_EDGE", "abc", "maxEdge", 1568],
    ["PI_IMAGE_FIT_MAX_BYTES", "1.5e6", "maxBytes", 4 * 1024 * 1024],
    ["PI_IMAGE_FIT_QUALITY", "120", "quality", 85],
    ["PI_IMAGE_FIT_QUALITY", "-5", "quality", 85],
    ["PI_IMAGE_FIT_QUALITY", "0", "quality", 85],
  ])("invalid %s=%s falls back to default and warns once", (varName, raw, field, expected) => {
    const warnings: string[] = [];
    const cfg = readConfigFromEnv({
      env: { [varName]: raw },
      warn: (msg) => warnings.push(msg),
    });
    expect((cfg as unknown as Record<string, unknown>)[field]).toBe(expected);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(varName);
    expect(warnings[0]).toContain(String(expected));
  });

  it("warns once per invalid var, not globally", () => {
    const warnings: string[] = [];
    readConfigFromEnv({
      env: {
        PI_IMAGE_FIT_MAX_EDGE: "bad",
        PI_IMAGE_FIT_QUALITY: "bad",
      },
      warn: (msg) => warnings.push(msg),
    });
    expect(warnings).toHaveLength(2);
    expect(warnings.some((w) => w.includes("PI_IMAGE_FIT_MAX_EDGE"))).toBe(true);
    expect(warnings.some((w) => w.includes("PI_IMAGE_FIT_QUALITY"))).toBe(true);
  });
});
