import React from "react";
import Icon from "@mdi/react";
import { mdiDownload } from "@mdi/js";

interface Props {
  canInstall: boolean;
  isInstalled?: boolean;
  prompt: () => void;
}

export function InstallButton({ canInstall, isInstalled, prompt }: Props) {
  if (!canInstall || isInstalled) return null;

  return (
    <button
      onClick={prompt}
      className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      title="Install app"
      data-testid="install-btn"
    >
      <Icon path={mdiDownload} size={0.6} />
    </button>
  );
}
