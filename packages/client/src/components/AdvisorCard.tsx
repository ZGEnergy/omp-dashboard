import { useState } from "react";
import type { ChatMessage } from "../lib/event-reducer.js";
import { t as i18nT } from "../lib/i18n";

type AdvisorSeverity = "nit" | "concern" | "blocker";
type AdvisorNote = { note: string; severity?: AdvisorSeverity; advisor?: string };

const severityRank = { nit: 0, concern: 1, blocker: 2 } as const;

function asAdvisorNotes(details: Record<string, unknown> | undefined): AdvisorNote[] {
  const rawNotes = details?.notes;
  if (!Array.isArray(rawNotes)) return [];
  return rawNotes.flatMap((raw): AdvisorNote[] => {
    if (!raw || typeof raw !== "object") return [];
    const record = raw as Record<string, unknown>;
    if (typeof record.note !== "string") return [];
    const severity = record.severity;
    return [{
      note: record.note,
      ...(severity === "nit" || severity === "concern" || severity === "blocker" ? { severity } : {}),
      ...(typeof record.advisor === "string" ? { advisor: record.advisor } : {}),
    }];
  });
}

function topSeverity(notes: AdvisorNote[]): AdvisorSeverity {
  return notes.reduce<AdvisorSeverity>(
    (top, note) => severityRank[note.severity ?? "nit"] > severityRank[top]
      ? note.severity ?? "nit"
      : top,
    "nit",
  );
}

const severityRail: Record<AdvisorSeverity, string> = {
  nit: "border-l-slate-400",
  concern: "border-l-amber-400",
  blocker: "border-l-red-500",
};

export function AdvisorCard({ message }: { message: ChatMessage }) {
  const notes = asAdvisorNotes(message.advisorDetails);
  const [expanded, setExpanded] = useState(false);

  if (notes.length === 0) {
    return (
      <section className="my-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2" data-testid="advisor-card">
        <pre className="whitespace-pre-wrap break-words font-mono text-sm text-[var(--text-secondary)]">{message.content}</pre>
      </section>
    );
  }

  const severity = topSeverity(notes);
  const advisor = notes.find((note) => note.advisor)?.advisor;
  const preview = notes[0]!.note;
  const label = [
    advisor ?? i18nT("advisor.card", undefined, "Advisor"),
    `${notes.length} ${notes.length === 1 ? "note" : "notes"}`,
    severity,
    preview,
  ].join(" · ");

  return (
    <section className={`my-3 rounded-lg border border-[var(--border-subtle)] border-l-4 ${severityRail[severity]} bg-[var(--bg-secondary)]`} data-testid="advisor-card">
      <button
        type="button"
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-[var(--text-primary)]"
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="min-w-0 truncate">{label}</span>
        <span aria-hidden="true" className="shrink-0 text-[var(--text-tertiary)]">{expanded ? "−" : "+"}</span>
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-[var(--border-subtle)] px-3 py-2">
          {notes.map((note, index) => (
            <div key={`${note.advisor ?? "advisor"}-${index}`} className={`border-l-2 pl-2 text-sm text-[var(--text-secondary)] ${severityRail[note.severity ?? "nit"]}`}>
              {note.advisor && <span className="mr-1 font-medium text-[var(--text-primary)]">{note.advisor}:</span>}
              {note.note}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
