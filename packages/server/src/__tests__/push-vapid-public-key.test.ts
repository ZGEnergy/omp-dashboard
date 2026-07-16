import { describe, expect, it } from "vitest";
import { publicKeyForLivePush } from "../push/push-vapid.js";

describe("publicKeyForLivePush", () => {
  const keys = { publicKey: "PUB", privateKey: "PRIV" };

  it("returns empty when push is disabled", () => {
    expect(publicKeyForLivePush(false, "ops@example.com", keys)).toBe("");
  });

  it("returns empty when contactEmail is removed", () => {
    expect(publicKeyForLivePush(true, undefined, keys)).toBe("");
    expect(publicKeyForLivePush(true, "", keys)).toBe("");
  });

  it("returns the public key only when enabled with contactEmail", () => {
    expect(publicKeyForLivePush(true, "ops@example.com", keys)).toBe("PUB");
  });
});
