import React, { useState } from "react";
import type { CommandInfo } from "../../shared/types.js";
import { getFlowCommands } from "../lib/flow-commands.js";
import { FlowLaunchDialog } from "./FlowLaunchDialog.js";
import { SearchableSelectDialog, type SelectOption } from "./SearchableSelectDialog.js";

export function SessionFlowActions({
  commands,
  onSendPrompt,
}: {
  commands: CommandInfo[];
  onSendPrompt: (text: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedFlow, setSelectedFlow] = useState<CommandInfo | null>(null);
  const [newFlowOpen, setNewFlowOpen] = useState(false);
  const flowCommands = getFlowCommands(commands);
  const hasFlowsNew = commands.some(c => c.name === "flows:new");

  if (flowCommands.length === 0 && !hasFlowsNew) return null;

  const flowOptions: SelectOption[] = flowCommands.map((cmd) => ({
    value: cmd.name,
    label: cmd.name,
    description: cmd.description,
  }));

  return (
    <>
      <div className="mt-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[var(--text-muted)]">Flows:</span>
          {flowCommands.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setPickerOpen(true); }}
              className="text-[10px] px-1.5 py-0.5 rounded border border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
            >
              ▶ Run Flow...
            </button>
          )}
          {hasFlowsNew && (
            <button
              onClick={(e) => { e.stopPropagation(); setNewFlowOpen(true); }}
              className="text-[10px] px-1.5 py-0.5 rounded border border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
            >
              + New Flow
            </button>
          )}
        </div>
      </div>

      {pickerOpen && (
        <SearchableSelectDialog
          title="Run Flow"
          options={flowOptions}
          placeholder="Search flows..."
          emptyMessage="No flows available"
          onSelect={(value) => {
            const cmd = flowCommands.find(c => c.name === value);
            if (cmd) setSelectedFlow(cmd);
            setPickerOpen(false);
          }}
          onCancel={() => setPickerOpen(false)}
        />
      )}

      {newFlowOpen && (
        <FlowLaunchDialog
          flowName="flows:new"
          description="Design a new flow with the Flow Architect"
          onSubmit={(task) => {
            const prompt = task ? `/flows:new ${task}` : `/flows:new`;
            onSendPrompt(prompt);
            setNewFlowOpen(false);
          }}
          onCancel={() => setNewFlowOpen(false)}
        />
      )}

      {selectedFlow && (
        <FlowLaunchDialog
          flowName={selectedFlow.name}
          description={selectedFlow.description}
          onSubmit={(task) => {
            const prompt = task ? `/${selectedFlow.name} ${task}` : `/${selectedFlow.name}`;
            onSendPrompt(prompt);
            setSelectedFlow(null);
          }}
          onCancel={() => setSelectedFlow(null)}
        />
      )}
    </>
  );
}
