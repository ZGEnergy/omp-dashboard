/**
 * OpenSpec action callbacks extracted from App.tsx.
 */
import { useCallback } from "react";
import type { OpenSpecData, OpenSpecArtifact } from "@blackbelt-technology/pi-dashboard-shared/types.js";

export interface OpenSpecActionDeps {
  send: (msg: any) => void;
  openspecMap: Map<string, OpenSpecData>;
  setPreviewState: React.Dispatch<React.SetStateAction<{
    cwd: string;
    changeName: string;
    artifactId: string;
    artifacts: OpenSpecArtifact[];
  } | null>>;
}

export function useOpenSpecActions(deps: OpenSpecActionDeps) {
  const { send, openspecMap, setPreviewState } = deps;

  const handleOpenSpecRefresh = useCallback((cwd: string) => {
    send({ type: "openspec_refresh", cwd });
  }, [send]);

  const handleBulkArchive = useCallback((cwd: string) => {
    send({ type: "openspec_bulk_archive", cwd });
  }, [send]);

  const handleReadArtifact = useCallback((cwd: string, changeName: string, artifactId: string) => {
    const openspecData = openspecMap.get(cwd);
    const change = openspecData?.changes.find((c) => c.name === changeName);
    const artifacts = change?.artifacts ?? [];
    setPreviewState({ cwd, changeName, artifactId, artifacts });
  }, [openspecMap, setPreviewState]);

  const handleAttachProposal = useCallback((sessionId: string, changeName: string) => {
    send({ type: "attach_proposal", sessionId, changeName });
  }, [send]);

  const handleDetachProposal = useCallback((sessionId: string) => {
    send({ type: "detach_proposal", sessionId });
  }, [send]);

  return {
    handleOpenSpecRefresh, handleBulkArchive, handleReadArtifact,
    handleAttachProposal, handleDetachProposal,
  };
}
