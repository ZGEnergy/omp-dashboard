/**
 * Seed a temporary dashboard HOME with fixture data.
 *
 * This is a minimal implementation: it creates the expected directory
 * structure under HOME/.pi/agent/sessions/ and writes one stub session
 * JSON per entry in fixtures/sessions.json so the dashboard's session
 * scanner finds them at startup.
 *
 * The real, rich fixture generator (full event logs, turn_end stats,
 * flow state, diffs) is a follow-up — see fixtures/README.md.
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";

export interface SessionFixture {
  id: string;
  cwd: string;
  name: string;
  createdAt: string;
  model: string;
  status: "running" | "idle" | "ended";
}

const HERE = new URL(".", import.meta.url).pathname;

export async function seedHome(home: string): Promise<void> {
  const sessionsDir = join(home, ".pi", "agent", "sessions");
  await mkdir(sessionsDir, { recursive: true });

  const sessions: SessionFixture[] = JSON.parse(
    await readFile(join(HERE, "fixtures", "sessions.json"), "utf8"),
  );

  for (const s of sessions) {
    const dir = join(sessionsDir, s.id);
    await mkdir(dir, { recursive: true });
    // Minimal meta sidecar so the scanner picks it up with a friendly name.
    await writeFile(
      join(dir, ".meta.json"),
      JSON.stringify(
        {
          id: s.id,
          cwd: s.cwd,
          name: s.name,
          createdAt: s.createdAt,
          model: s.model,
        },
        null,
        2,
      ),
    );
    // Empty events file so the session exists even without a full replay log.
    await writeFile(join(dir, "events.jsonl"), "");
  }

  // eslint-disable-next-line no-console
  console.log(
    `[seed] wrote ${sessions.length} fixture sessions into ${sessionsDir}`,
  );
}
