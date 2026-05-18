/**
 * Doctor core — section assignment, suggestion taxonomy, and the
 * Decision-8 lint (every non-ok check has non-empty
 * message/detail/suggestion). See change: doctor-rich-output.
 */
import { describe, it, expect } from "vitest";
import {
  SECTION_OF,
  SUGGESTIONS,
  stampSectionsAndSuggestions,
  serverLogLooksBad,
  type DoctorCheck,
  type DoctorStatus,
} from "../doctor-core.js";

const ALL_CHECK_NAMES = Object.keys(SECTION_OF);

describe("SECTION_OF", () => {
  it("maps every canonical check name to one of the five sections", () => {
    const allowed = new Set(["runtime", "pi-tooling", "server", "setup", "diagnostics"]);
    for (const name of ALL_CHECK_NAMES) {
      expect(allowed.has(SECTION_OF[name])).toBe(true);
    }
  });

  it("covers all five sections (none empty)", () => {
    const sections = new Set(Object.values(SECTION_OF));
    for (const s of ["runtime", "pi-tooling", "server", "setup", "diagnostics"]) {
      expect(sections.has(s as never)).toBe(true);
    }
  });
});

describe("SUGGESTIONS", () => {
  it("returns undefined for status=ok across every check name", () => {
    for (const name of ALL_CHECK_NAMES) {
      const fn = SUGGESTIONS[name];
      expect(fn).toBeDefined();
      expect(fn?.("ok")).toBeUndefined();
    }
  });

  it("returns a non-empty string for status=error or warning when defined", () => {
    for (const name of ALL_CHECK_NAMES) {
      const fn = SUGGESTIONS[name];
      // Electron is the only one that returns undefined even for non-ok
      // (because today it never fails). Skip it.
      if (name === "Electron") continue;
      const w = fn?.("warning");
      const e = fn?.("error");
      expect(typeof w === "string" && w.length > 0).toBe(true);
      expect(typeof e === "string" && e.length > 0).toBe(true);
    }
  });

  it("constrains suggestion text to the allowed Markdown subset", () => {
    // Allowed: **bold**, single-backtick code, [text](url). Disallow: tables,
    // headings, fenced blocks, raw HTML.
    for (const name of ALL_CHECK_NAMES) {
      const fn = SUGGESTIONS[name];
      const candidates: (string | undefined)[] = [
        fn?.("warning"),
        fn?.("error"),
        fn?.("error", undefined, "not-found"),
        fn?.("error", undefined, "permission-denied"),
        fn?.("error", undefined, "timeout"),
        fn?.("error", undefined, "non-zero-exit"),
      ];
      for (const s of candidates) {
        if (!s) continue;
        // No fenced code blocks.
        expect(/```/.test(s)).toBe(false);
        // No headings at line start.
        expect(/^#{1,6}\s/m.test(s)).toBe(false);
        // No raw HTML tags (closing, self-closing, or with attributes).
        // Plain `<placeholder>` text is allowed (used as prose).
        expect(/<\/[a-zA-Z]|<[a-zA-Z][^>]*\s+[^>]+>|<[a-zA-Z][^>]*\/>/.test(s)).toBe(false);
        // Triple-asterisk or underline for bold not allowed.
        expect(/\*\*\*|___/.test(s)).toBe(false);
      }
    }
  });
});

describe("stampSectionsAndSuggestions (Decision 8 lint)", () => {
  it("stamps section + suggestion on non-ok rows by name", () => {
    const checks: DoctorCheck[] = [
      { name: "pi CLI", section: undefined as unknown as never, status: "error", message: "Not found", detail: "Searched PATH" },
      { name: "System Node.js", section: undefined as unknown as never, status: "ok", message: "v22 at /usr/bin/node" },
    ];
    const out = stampSectionsAndSuggestions(checks);
    expect(out[0].section).toBe("pi-tooling");
    expect(out[0].suggestion).toBeDefined();
    expect(out[1].section).toBe("runtime");
    expect(out[1].suggestion).toBeUndefined();
  });

  it("every non-ok row produced through stamping has non-empty message + detail + suggestion", () => {
    const statuses: DoctorStatus[] = ["warning", "error"];
    for (const name of ALL_CHECK_NAMES) {
      // Electron suggestion is always undefined (decision-by-design); skip.
      if (name === "Electron") continue;
      for (const status of statuses) {
        const checks: DoctorCheck[] = [
          {
            name,
            section: undefined as unknown as never,
            status,
            message: "synthetic message",
            detail: "synthetic detail",
          },
        ];
        const [stamped] = stampSectionsAndSuggestions(checks);
        expect(stamped.message.length).toBeGreaterThan(0);
        expect((stamped.detail ?? "").length).toBeGreaterThan(0);
        expect((stamped.suggestion ?? "").length).toBeGreaterThan(0);
      }
    }
  });

  it("does not overwrite an existing suggestion", () => {
    const checks: DoctorCheck[] = [
      {
        name: "pi CLI",
        section: "pi-tooling",
        status: "error",
        message: "x",
        detail: "y",
        suggestion: "custom",
      },
    ];
    const out = stampSectionsAndSuggestions(checks);
    expect(out[0].suggestion).toBe("custom");
  });
});

// ── serverLogLooksBad ───────────────────────────────────────────────────
//
// Group 15 fix: healthy startup-only log used to flag yellow on every
// Doctor open. Server-log row now flips between informational ok and
// warning based on actual error markers in the tail.
describe("serverLogLooksBad", () => {
  it("returns false for healthy startup-only log", () => {
    const tail =
      "[2026-05-08T15:45:57.243Z] Launching via CLI: /Users/r/.pi-dashboard/node_modules/.bin/pi-dashboard start --port 8000 --pi-port 9999\n" +
      "Dashboard server started (pid 59006) at http://localhost:8000";
    expect(serverLogLooksBad(tail)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(serverLogLooksBad("")).toBe(false);
  });

  it("returns true on 'error' marker case-insensitive", () => {
    expect(serverLogLooksBad("Some Error happened during startup")).toBe(true);
    expect(serverLogLooksBad("some error happened")).toBe(true);
    expect(serverLogLooksBad("FATAL: kaboom")).toBe(true);
  });

  it("returns true on port-collision marker", () => {
    expect(serverLogLooksBad("listen EADDRINUSE: address already in use :::8000")).toBe(true);
  });

  it("returns true on module-not-found marker", () => {
    expect(serverLogLooksBad("Error: Cannot find module 'foo' (MODULE_NOT_FOUND)")).toBe(true);
    expect(serverLogLooksBad("ENOENT: no such file or directory")).toBe(true);
  });

  it("returns true on process-exit markers", () => {
    expect(serverLogLooksBad("Server child process exited prematurely")).toBe(true);
    expect(serverLogLooksBad("Process crashed unexpectedly")).toBe(true);
    expect(serverLogLooksBad("npm install failed with code 1")).toBe(true);
  });

  it("requires whole-word match (avoids false positives on substring)", () => {
    // "errorless" / "errors-list" should not match.
    expect(serverLogLooksBad("this is errorless prose")).toBe(false);
    // But "errors" (plural, whole word) — actually 'error' is a substring of
    // 'errors' but \b matches at the word boundary before the 's'. Pi's word
    // boundary regex \b(error|...)\b matches 'error' before 's' which is a
    // word char, so 'errors' does NOT match. Confirm.
    expect(serverLogLooksBad("running errors are tracked")).toBe(false);
  });

  it("detects markers within typical multi-line tail", () => {
    const tail = [
      "[2026-05-08T15:45:57.243Z] Launching via CLI...",
      "Dashboard server started (pid 59006)",
      "[2026-05-08T15:46:12.001Z] Error: connection refused on /api/health",
      "Process exited with code 1",
    ].join("\n");
    expect(serverLogLooksBad(tail)).toBe(true);
  });
});
