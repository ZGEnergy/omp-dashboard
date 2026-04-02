import React, { useState } from "react";
import type { FlowInfo } from "../../shared/types.js";
import { FlowLaunchDialog } from "./FlowLaunchDialog.js";
import { SearchableSelectDialog, type SelectOption } from "./SearchableSelectDialog.js";

export function SessionFlowActions({
  flows,
  hasFlowsNew,
  onSendPrompt,
}: {
  flows: FlowInfo[];
  hasFlowsNew: boolean;
  onSendPrompt: (text: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedFlow, setSelectedFlow] = useState<FlowInfo | null>(null);
  const [newFlowOpen, setNewFlowOpen] = useState(false);

  if (flows.length === 0 && !hasFlowsNew) return null;

  const flowOptions: SelectOption[] = flows.map((f) => ({
    value: f.name,
    label: f.name,
    description: f.description,
  }));

  return (
    <>
      <div className="mt-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-[var(--text-muted)]">Flows:</span>
          {flows.length > 0 && (
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
            const flow = flows.find(f => f.name === value);
            if (flow) setSelectedFlow(flow);
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
