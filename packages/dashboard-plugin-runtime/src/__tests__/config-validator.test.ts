import { describe, it, expect } from "vitest";
import { validatePluginConfig, applySchemaDefaults, ValidationError } from "../server/config-validator.js";

const schema = {
  type: "object",
  properties: {
    pollIntervalSeconds: { type: "number", default: 30 },
    label: { type: "string" },
  },
  additionalProperties: false,
};

describe("validatePluginConfig", () => {
  it("passes valid config", () => {
    expect(() =>
      validatePluginConfig("demo", { pollIntervalSeconds: 60 }, schema),
    ).not.toThrow();
  });

  it("throws ValidationError on type mismatch", () => {
    try {
      validatePluginConfig("demo", { pollIntervalSeconds: "not-a-number" as unknown as number }, schema);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).pluginId).toBe("demo");
    }
  });

  it("throws ValidationError on additional properties", () => {
    expect(() =>
      validatePluginConfig("demo", { unknownField: true } as Record<string, unknown>, schema),
    ).toThrow(ValidationError);
  });
});

describe("applySchemaDefaults", () => {
  it("fills in default values", () => {
    const result = applySchemaDefaults({}, schema);
    expect(result.pollIntervalSeconds).toBe(30);
  });

  it("does not overwrite provided values", () => {
    const result = applySchemaDefaults({ pollIntervalSeconds: 60 }, schema);
    expect(result.pollIntervalSeconds).toBe(60);
  });
});
