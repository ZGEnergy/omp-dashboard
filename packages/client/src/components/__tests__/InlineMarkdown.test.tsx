import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import React from "react";
import { InlineMarkdown } from "../interactive-renderers/InlineMarkdown.js";

afterEach(cleanup);

describe("InlineMarkdown", () => {
  it("renders bold text", () => {
    const { container } = render(<InlineMarkdown content="Allow **dangerous** operation?" />);
    const strong = container.querySelector("strong");
    expect(strong).toBeTruthy();
    expect(strong!.textContent).toBe("dangerous");
  });

  it("renders inline code", () => {
    const { container } = render(<InlineMarkdown content="Run `rm -rf` command?" />);
    const code = container.querySelector("code");
    expect(code).toBeTruthy();
    expect(code!.textContent).toBe("rm -rf");
  });

  it("renders italic text", () => {
    const { container } = render(<InlineMarkdown content="This is *important*" />);
    const em = container.querySelector("em");
    expect(em).toBeTruthy();
    expect(em!.textContent).toBe("important");
  });

  it("renders links", () => {
    const { container } = render(<InlineMarkdown content="See [docs](https://example.com)" />);
    const link = container.querySelector("a");
    expect(link).toBeTruthy();
    expect(link!.getAttribute("href")).toBe("https://example.com");
    expect(link!.textContent).toBe("docs");
  });

  it("strips block elements like paragraphs", () => {
    const { container } = render(<InlineMarkdown content="Hello world" />);
    expect(container.querySelector("p")).toBeNull();
    expect(container.textContent).toContain("Hello world");
  });

  it("strips list elements but keeps text", () => {
    const { container } = render(<InlineMarkdown content="- item one\n- item two" />);
    expect(container.querySelector("ul")).toBeNull();
    expect(container.querySelector("li")).toBeNull();
    expect(container.textContent).toContain("item one");
    expect(container.textContent).toContain("item two");
  });

  it("strips heading elements but keeps text", () => {
    const { container } = render(<InlineMarkdown content="# Big Title" />);
    expect(container.querySelector("h1")).toBeNull();
    expect(container.textContent).toContain("Big Title");
  });
});
