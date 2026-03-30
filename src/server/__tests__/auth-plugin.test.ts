import { describe, it, expect } from "vitest";
import { validateWsUpgrade, escapeHtml } from "../auth-plugin.js";
import { signToken, COOKIE_NAME } from "../auth.js";

const SECRET = "test-secret-for-ws-auth-testing";

describe("validateWsUpgrade", () => {
  it("should allow localhost without cookie", () => {
    expect(validateWsUpgrade(undefined, "127.0.0.1", SECRET)).toBe(true);
    expect(validateWsUpgrade(undefined, "::1", SECRET)).toBe(true);
    expect(validateWsUpgrade(undefined, "::ffff:127.0.0.1", SECRET)).toBe(true);
  });

  it("should reject external request without cookie", () => {
    expect(validateWsUpgrade(undefined, "1.2.3.4", SECRET)).toBe(false);
  });

  it("should reject external request with invalid cookie", () => {
    expect(validateWsUpgrade(`${COOKIE_NAME}=invalidtoken`, "1.2.3.4", SECRET)).toBe(false);
  });

  it("should allow external request with valid cookie", () => {
    const token = signToken({ sub: "user@example.com", name: "User", username: "user", provider: "github" }, SECRET);
    expect(validateWsUpgrade(`${COOKIE_NAME}=${token}`, "1.2.3.4", SECRET)).toBe(true);
  });

  it("should reject external request with wrong secret", () => {
    const token = signToken({ sub: "user@example.com", name: "User", username: "user", provider: "github" }, "other-secret");
    expect(validateWsUpgrade(`${COOKIE_NAME}=${token}`, "1.2.3.4", SECRET)).toBe(false);
  });
});

describe("escapeHtml", () => {
  it("should escape all HTML special characters", () => {
    expect(escapeHtml('&<>"\'')).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("should escape script tags to prevent XSS", () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("should escape crafted email addresses", () => {
    expect(escapeHtml('<img onerror="alert(1)" src=x>@evil.com')).toBe(
      '&lt;img onerror=&quot;alert(1)&quot; src=x&gt;@evil.com',
    );
  });

  it("should pass through safe strings unchanged", () => {
    expect(escapeHtml("user@example.com")).toBe("user@example.com");
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});
