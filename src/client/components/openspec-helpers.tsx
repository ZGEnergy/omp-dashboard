import React from "react";
import type { OpenSpecChange, OpenSpecArtifact } from "../../shared/types.js";

export const LETTER_MAP: Record<string, string> = {
  proposal: "P",
  design: "D",
  specs: "S",
  tasks: "T",
};

export function artifactLetter(id: string): string {
  return LETTER_MAP[id] ?? id.charAt(0).toUpperCase();
}

export function statusColor(status: string): string {
  if (status === "done") return "text-green-500";
  if (status === "ready") return "text-yellow-500";
  return "text-[var(--text-muted)]";
}

export function ArtifactLetters({
  artifacts,
  changeName,
  onReadArtifact,
}: {
  artifacts: OpenSpecArtifact[];
  changeName: string;
  onReadArtifact?: (changeName: string, artifactId: string) => void;
}) {
  if (artifacts.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      {artifacts.map((a) => (
        <button
          key={a.id}
          data-testid="artifact-letter"
          title={`${a.id}: ${a.status}`}
          className={`text-[10px] font-bold font-mono cursor-pointer hover:underline ${statusColor(a.status)}`}
          onClick={(e) => { e.stopPropagation(); onReadArtifact?.(changeName, a.id); }}
        >
          {artifactLetter(a.id)}
        </button>
      ))}
    </div>
  );
}

export function allArtifactsDone(artifacts: OpenSpecChange["artifacts"]): boolean {
  return artifacts.length > 0 && artifacts.every((a) => a.status === "done");
}
