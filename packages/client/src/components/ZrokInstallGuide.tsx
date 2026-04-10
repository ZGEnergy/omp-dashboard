import React, { useState, useEffect } from "react";
import { getApiBase } from "../lib/api-context.js";
import { Icon } from "@mdi/react";
import { mdiArrowLeft, mdiOpenInNew } from "@mdi/js";
import type { TunnelStatus } from "@blackbelt-technology/pi-dashboard-shared/rest-api.js";

interface Props {
  onBack: () => void;
}

type ServerOs = "darwin" | "linux" | "win32" | string;

function useServerOs(): ServerOs {
  const [os, setOs] = useState<ServerOs>("linux");
  useEffect(() => {
    fetch(`${getApiBase()}/api/tunnel-status`)
      .then((r) => r.json())
      .then((data: TunnelStatus) => setOs(data.serverOs))
      .catch(() => {});
  }, []);
  return os;
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-3 text-sm font-mono overflow-x-auto whitespace-pre-wrap">
      {children}
    </pre>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">{title}</h3>
      {children}
    </div>
  );
}

function DarwinGuide() {
  return (
    <>
      <Section title="1. Install zrok">
        <p className="text-sm text-[var(--text-secondary)] mb-2">
          Install via Homebrew:
        </p>
        <CodeBlock>{`brew install zrok`}</CodeBlock>
      </Section>
      <EnrollAndVerify />
    </>
  );
}

function LinuxGuide() {
  return (
    <>
      <Section title="1. Install zrok">
        <p className="text-sm text-[var(--text-secondary)] mb-2">
          Install via the official install script:
        </p>
        <CodeBlock>{`curl -sSLf https://get.openziti.io/install.bash | sudo bash -s zrok`}</CodeBlock>
        <p className="text-sm text-[var(--text-tertiary)] mt-2">
          Or on Debian/Ubuntu via apt:
        </p>
        <CodeBlock>{`# Add the OpenZiti repo
curl -sSLf https://get.openziti.io/install.bash | sudo bash -s openziti-controller
sudo apt install zrok`}</CodeBlock>
      </Section>
      <EnrollAndVerify />
    </>
  );
}

function WindowsGuide() {
  return (
    <>
      <Section title="1. Install zrok">
        <p className="text-sm text-[var(--text-secondary)] mb-2">
          Install via Chocolatey:
        </p>
        <CodeBlock>{`choco install zrok`}</CodeBlock>
        <p className="text-sm text-[var(--text-tertiary)] mt-2">
          Or via Scoop:
        </p>
        <CodeBlock>{`scoop bucket add openziti https://github.com/openziti/scoop-bucket.git
scoop install zrok`}</CodeBlock>
      </Section>
      <EnrollAndVerify />
    </>
  );
}

function EnrollAndVerify() {
  return (
    <>
      <Section title="2. Create Account & Enroll">
        <p className="text-sm text-[var(--text-secondary)] mb-2">
          Sign up at{" "}
          <a href="https://myzrok.io" target="_blank" rel="noopener" className="text-blue-400 hover:underline">
            myzrok.io
          </a>{" "}
          to get your invite token, then enroll:
        </p>
        <CodeBlock>{`zrok enable <your-token>`}</CodeBlock>
        <p className="text-sm text-[var(--text-tertiary)] mt-2">
          This stores your API token in zrok's own config directory
          (<code className="text-xs bg-[var(--bg-surface)] px-1 py-0.5 rounded font-mono">~/.zrok2/environment.json</code>).
          The dashboard reads this file to detect enrollment — no keys are
          copied into the dashboard config.
        </p>
      </Section>
      <Section title="3. Verify">
        <p className="text-sm text-[var(--text-secondary)] mb-2">
          Check that zrok is working:
        </p>
        <CodeBlock>{`zrok version`}</CodeBlock>
      </Section>
    </>
  );
}

export function ZrokInstallGuide({ onBack }: Props) {
  const serverOs = useServerOs();

  const osLabel = serverOs === "darwin" ? "macOS" : serverOs === "win32" ? "Windows" : "Linux";

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-primary)]">
        <button
          onClick={onBack}
          className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          title="Back"
          data-testid="tunnel-guide-back"
        >
          <Icon path={mdiArrowLeft} size={0.8} />
        </button>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Tunnel Setup — Install zrok ({osLabel})
        </h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl">
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          zrok enables secure public tunnels to your dashboard server.
          Follow the steps below to install and configure it on your{" "}
          <strong>{osLabel}</strong> server.
        </p>

        {serverOs === "darwin" && <DarwinGuide />}
        {serverOs === "win32" && <WindowsGuide />}
        {serverOs !== "darwin" && serverOs !== "win32" && (
          <>
            {serverOs !== "linux" && (
              <p className="text-xs text-[var(--text-tertiary)] mb-4 italic">
                Your server OS was not recognized — showing Linux instructions.
                Check <a href="https://docs.zrok.io" target="_blank" rel="noopener" className="text-blue-400 hover:underline">docs.zrok.io</a> for your platform.
              </p>
            )}
            <LinuxGuide />
          </>
        )}

        <Section title="4. Restart the Dashboard Server">
          <p className="text-sm text-[var(--text-secondary)] mb-2">
            The tunnel is <strong>enabled by default</strong> (<code className="text-xs bg-[var(--bg-surface)] px-1 py-0.5 rounded font-mono">tunnel.enabled: true</code>).
            After installing and enrolling zrok, restart the dashboard server —
            it will automatically detect zrok and open a tunnel on startup.
            The tunnel URL will appear in the server logs.
          </p>
          <CodeBlock>{`pi-dashboard stop && pi-dashboard start`}</CodeBlock>
          <p className="text-sm text-[var(--text-tertiary)] mt-2">
            To disable auto-tunnel, set <code className="text-xs bg-[var(--bg-surface)] px-1 py-0.5 rounded font-mono">tunnel.enabled</code> to{" "}
            <code className="text-xs bg-[var(--bg-surface)] px-1 py-0.5 rounded font-mono">false</code> in Settings or pass{" "}
            <code className="text-xs bg-[var(--bg-surface)] px-1 py-0.5 rounded font-mono">--no-tunnel</code> on the CLI.
          </p>
        </Section>

        <div className="mt-4 pt-4 border-t border-[var(--border-primary)]">
          <a
            href="https://docs.zrok.io"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 text-sm text-blue-400 hover:underline"
          >
            Official zrok documentation
            <Icon path={mdiOpenInNew} size={0.5} />
          </a>
        </div>
      </div>
    </div>
  );
}
