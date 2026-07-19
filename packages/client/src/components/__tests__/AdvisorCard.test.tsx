import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../lib/event-reducer.js";
import { AdvisorCard } from "../AdvisorCard.js";

function advisorMessage({
  content = "",
  notes,
}: {
  content?: string;
  notes?: Array<{ note: string; severity?: "nit" | "concern" | "blocker"; advisor?: string }>;
} = {}): ChatMessage {
  return {
    id: "advisor-1",
    role: "advisor",
    content,
    timestamp: 0,
    ...(notes ? { advisorDetails: { notes } } : {}),
  };
}

describe("AdvisorCard", () => {
  it("starts collapsed, chooses the top severity, and expands all notes", () => {
    render(
      <AdvisorCard
        message={advisorMessage({
          notes: [
            { note: "nit note", severity: "nit", advisor: "Scout" },
            { note: "blocked note", severity: "blocker" },
          ],
        })}
      />,
    );

    const trigger = screen.getByRole("button", { name: /scout.*2.*blocker/i });
    expect(screen.queryByText("blocked note")).toBeNull();

    fireEvent.click(trigger);

    expect(screen.getByText("nit note")).not.toBeNull();
    expect(screen.getByText("blocked note")).not.toBeNull();
  });

  it("falls back to preformatted raw content when structured notes are absent", () => {
    const { container } = render(<AdvisorCard message={advisorMessage({ content: "raw\nadvisory" })} />);

    expect(container.querySelector("pre")?.textContent).toBe("raw\nadvisory");
  });
});
