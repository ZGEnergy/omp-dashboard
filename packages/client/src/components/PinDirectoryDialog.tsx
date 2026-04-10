import React from "react";
import { PathPicker } from "./PathPicker.js";

interface Props {
  onPin: (path: string) => void;
  onCancel: () => void;
}

export function PinDirectoryDialog({ onPin, onCancel }: Props) {
  return (
    <div className="fixed inset-0 bg-[var(--bg-overlay)] flex items-center justify-center z-[60]">
      <div className="bg-[var(--bg-secondary)] rounded-lg p-6 w-full max-w-lg border border-[var(--border-secondary)]">
        <h3 className="text-lg font-semibold mb-4">Pin Directory</h3>

        <PathPicker
          onSelect={(path) => path.trim() && onPin(path.replace(/\/+$/, "") || "/")}
          onCancel={onCancel}
          rows={8}
        />
      </div>
    </div>
  );
}
