import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GatewaySetupGuide } from "../Gateway/GatewaySetupGuide.js";
import { ProviderAuthSection } from "../ProviderAuthSection.js";

describe("iOS Autofill Hardening Tests (#112)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/provider-auth/status")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                {
                  id: "openai",
                  name: "OpenAI",
                  flowType: "api_key",
                  authenticated: false,
                },
              ]),
          });
        }
        if (url.includes("/api/provider-auth/handlers")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ ids: ["openai"] }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("ProviderAuthSection", () => {
    it("renders secret input inside form with anti-autofill attributes", async () => {
      render(<ProviderAuthSection />);

      const addKeyBtn = await screen.findByRole("button", { name: /Add Key/i });
      fireEvent.click(addKeyBtn);

      const input = screen.getByPlaceholderText(/Paste API key/i);
      expect(input.getAttribute("type")).toBe("password");
      expect(input.getAttribute("autocomplete")).toBe("off");
      expect(input.getAttribute("autocorrect")).toBe("off");
      expect(input.getAttribute("autocapitalize")).toBe("off");
      expect(input.getAttribute("spellcheck")).toBe("false");
      expect(input.getAttribute("data-lpignore")).toBe("true");

      const form = input.closest("form");
      expect(form).not.toBeNull();

      const event = new Event("submit", { cancelable: true, bubbles: true });
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");
      form?.dispatchEvent(event);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe("GatewaySetupGuide", () => {
    it("renders secret parameter input inside form with anti-autofill attributes", () => {
      render(<GatewaySetupGuide provider="ngrok" />);

      const input = screen.getByTestId("gateway-setup-param");
      expect(input.getAttribute("type")).toBe("password");
      expect(input.getAttribute("autocomplete")).toBe("off");
      expect(input.getAttribute("autocorrect")).toBe("off");
      expect(input.getAttribute("autocapitalize")).toBe("off");
      expect(input.getAttribute("spellcheck")).toBe("false");
      expect(input.getAttribute("data-lpignore")).toBe("true");

      const form = input.closest("form");
      expect(form).not.toBeNull();

      const event = new Event("submit", { cancelable: true, bubbles: true });
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");
      form?.dispatchEvent(event);
      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });
});
