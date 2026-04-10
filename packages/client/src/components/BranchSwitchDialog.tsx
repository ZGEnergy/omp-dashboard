import React, { useState } from "react";
import { BranchPicker } from "./BranchPicker.js";
import { checkoutBranch, stashPop, gitInit } from "../lib/git-api.js";
import { DialogPortal } from "./DialogPortal.js";

interface Props {
  cwd: string;
  onClose: () => void;
}

type Step =
  | { type: "pick" }
  | { type: "no-git" }
  | { type: "dirty"; branch: string; files: string[] }
  | { type: "switching"; branch: string }
  | { type: "ask-pop"; branch: string }
  | { type: "error"; message: string };

export function BranchSwitchDialog({ cwd, onClose }: Props) {
  const [step, setStep] = useState<Step>({ type: "pick" });

  const handleSelect = async (branch: string) => {
    setStep({ type: "switching", branch });
    try {
      const result = await checkoutBranch(cwd, branch, false);
      if (!result.success) {
        setStep({ type: "dirty", branch, files: result.files });
        return;
      }
      onClose();
    } catch (err: any) {
      setStep({ type: "error", message: err.message ?? "Checkout failed" });
    }
  };

  const handleStashAndSwitch = async (branch: string) => {
    setStep({ type: "switching", branch });
    try {
      const result = await checkoutBranch(cwd, branch, true);
      if (!result.success) {
        setStep({ type: "error", message: "Checkout failed even after stash" });
        return;
      }
      if (result.stashed) {
        setStep({ type: "ask-pop", branch });
      } else {
        onClose();
      }
    } catch (err: any) {
      setStep({ type: "error", message: err.message ?? "Stash & checkout failed" });
    }
  };

  const handlePop = async () => {
    try {
      const result = await stashPop(cwd);
      if (result.conflicts) {
        setStep({ type: "error", message: "Stash popped with merge conflicts. Please resolve them manually." });
      } else {
        onClose();
      }
    } catch (err: any) {
      setStep({ type: "error", message: err.message ?? "Stash pop failed" });
    }
  };

  return (
    <DialogPortal>
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-secondary)] p-4 w-[420px] max-w-[90vw] max-h-[80vh] overflow-y-auto shadow-lg">
          {step.type === "pick" && (
            <>
              <h3 className="text-sm font-medium mb-3">Switch Branch</h3>
              <BranchPicker
                cwd={cwd}
                onSelect={handleSelect}
                onCancel={onClose}
                onNotGitRepo={() => setStep({ type: "no-git" })}
              />
            </>
          )}

          {step.type === "no-git" && (
            <>
              <h3 className="text-sm font-medium mb-2">No Git Repository</h3>
              <p className="text-xs text-[var(--text-secondary)] mb-3">
                This directory is not a git repository. Initialize one?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 rounded text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try {
                      await gitInit(cwd);
                      onClose();
                    } catch (err: any) {
                      setStep({ type: "error", message: err.message ?? "Init failed" });
                    }
                  }}
                  className="px-3 py-1.5 rounded text-sm bg-blue-600 hover:bg-blue-500"
                >
                  Initialize Git
                </button>
              </div>
            </>
          )}

          {step.type === "switching" && (
            <div className="py-8 text-center text-sm text-[var(--text-secondary)]">
              Switching to <span className="font-mono text-[var(--text-primary)]">{step.branch}</span>…
            </div>
          )}

          {step.type === "dirty" && (
            <>
              <h3 className="text-sm font-medium mb-2">Uncommitted Changes</h3>
              <p className="text-xs text-[var(--text-secondary)] mb-2">
                {step.files.length} file{step.files.length !== 1 ? "s" : ""} with uncommitted changes:
              </p>
              <div className="max-h-32 overflow-y-auto bg-[var(--bg-tertiary)] rounded border border-[var(--border-secondary)] p-2 mb-3">
                {step.files.map((f) => (
                  <div key={f} className="text-xs font-mono text-[var(--text-secondary)] truncate">{f}</div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 rounded text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleStashAndSwitch(step.branch)}
                  className="px-3 py-1.5 rounded text-sm bg-blue-600 hover:bg-blue-500"
                >
                  Stash &amp; Switch
                </button>
              </div>
            </>
          )}

          {step.type === "ask-pop" && (
            <>
              <h3 className="text-sm font-medium mb-2">Switched to <span className="font-mono">{step.branch}</span></h3>
              <p className="text-xs text-[var(--text-secondary)] mb-3">
                Your changes were stashed. Pop stash on this branch?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 rounded text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                >
                  No, keep stashed
                </button>
                <button
                  onClick={handlePop}
                  className="px-3 py-1.5 rounded text-sm bg-blue-600 hover:bg-blue-500"
                >
                  Pop
                </button>
              </div>
            </>
          )}

          {step.type === "error" && (
            <>
              <h3 className="text-sm font-medium mb-2 text-red-400">Error</h3>
              <p className="text-xs text-[var(--text-secondary)] mb-3">{step.message}</p>
              <div className="flex justify-end">
                <button
                  onClick={onClose}
                  className="px-3 py-1.5 rounded text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </DialogPortal>
  );
}
