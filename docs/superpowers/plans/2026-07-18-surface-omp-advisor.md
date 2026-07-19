# Surface OMP Advisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface persisted and live OMP advisor notes, enable advisor only at spawn, and show passive session proof.

**Architecture:** Shared replay synthesizes existing bridge event shape from OMP `custom_message` records. Client reduces one idempotent `advisor` row and renders display-only card, spawn input, and proof chip. Server carries optional spawn bit through one argv helper, then binds persisted `advisor:true` metadata to verified spawn token at bridge registration.

**Tech Stack:** TypeScript, React TSX, Vitest, TanStack Virtual, shared browser protocol, Node session metadata.

## Global Constraints

- Keep change additive.
- Keep `SpawnSessionBrowserMessage.advisor?: boolean` optional.
- Send `advisor: true` only.
- Persist `SessionMeta.advisor?: true` only.
- Never persist `advisor:false`.
- Append `--advisor` only when input equals `true`.
- Route argv through `sessionFlagsToArgv` for tmux, WSL tmux, Windows Terminal, and headless keeper.
- Replay `type:"custom_message"`, `customType:"advisor"`, `display !== false` as `message_start` then `message_end` with `entryId`.
- Preserve `type:"custom"`, `customType:"flow-event"` replay branch.
- Upsert advisor rows by `data.entryId ?? data.message.id`.
- Render card from `details.notes`; use raw `content` only when notes absent.
- Show passive chip from `advisor:true` metadata or observed advisor row.
- Exclude live per-session advisor control, `set_advisor_enabled`, and toggle protocol.
- Preserve old-server unknown-field bare-spawn behavior.
- Preserve duplicate-delivery single-row behavior.
- Preserve default harness behavior for absent or `false` input.
- Keep `npm test` baseline: 10,882 passed, 22 skipped.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/state-replay.ts` | Map persisted advisor records into existing message events. |
| `packages/shared/src/browser-protocol.ts` | Carry optional browser spawn flag and broadcast session advisor proof. |
| `packages/shared/src/session-meta.ts` | Type durable dashboard-owned `advisor?: true`. |
| `packages/shared/src/platform/spawn-mechanism.ts` | Append advisor argv in every mechanism path. |
| `packages/server/src/browser-handlers/session-action-handler.ts` | Read browser flag. Arm token-keyed post-spawn metadata intent. |
| `packages/server/src/process-manager.ts` | Thread flag into shared spawn flags. Return existing spawn token. |
| `packages/server/src/event-wiring.ts` | Consume verified token intent during `session_register`. Merge meta and broadcast. |
| `packages/server/src/session-to-meta.ts` | Preserve advisor proof during normal full metadata persistence. |
| `packages/client/src/lib/event-reducer.ts` | Reduce idempotent advisor chat rows. |
| `packages/client/src/lib/chat-virtual-rows.ts` | Estimate advisor card rows. |
| `packages/client/src/components/AdvisorCard.tsx` | Render collapsed and expanded advisor notes. |
| `packages/client/src/components/ChatView.tsx` | Mount advisor cards in virtual transcript. |
| `packages/client/src/components/WorktreeSpawnDialog.tsx` | Seed and emit advisor spawn option. |
| `packages/client/src/components/SessionList.tsx` | Pass advisor defaults through plain and proposal spawn paths. |
| `packages/client/src/hooks/useSessionActions.ts` | Serialize checked advisor option into `spawn_session`. |
| `packages/client/src/components/SessionCard.tsx` | Render desktop and mobile passive advisor chip. |
| `packages/client/src/lib/i18n-en-source.json` | Define English advisor card, checkbox, chip, and tooltip labels. |
| `packages/shared/src/__tests__/state-replay-flow-events.test.ts` | Prove advisor replay and flow-event isolation. |
| `packages/shared/src/__tests__/state-replay-entry-id.test.ts` | Prove replay event entry identity. |
| `packages/shared/src/__tests__/spawn-session-attach-proposal.test.ts` | Prove optional protocol JSON and old-shape compatibility. |
| `packages/shared/src/__tests__/session-meta.test.ts` | Prove true-only durable advisor metadata. |
| `packages/shared/src/__tests__/spawn-mechanism.test.ts` | Prove argv coverage for every mechanism input shape. |
| `packages/client/src/lib/__tests__/event-reducer.test.ts` | Prove live advisor map, hidden skip, and idempotent upsert. |
| `packages/client/src/lib/__tests__/chat-virtual-rows.test.ts` | Prove advisor row estimate and text reserve. |
| `packages/client/src/components/__tests__/ChatView.test.tsx` | Prove advisor virtual-row rendering. |
| `packages/client/src/components/__tests__/SessionCard.test.tsx` | Prove desktop and mobile passive chip predicates. |
| `packages/client/src/components/__tests__/WorktreeSpawnDialog.test.tsx` | Prove OMP default and true-only submit option. |
| `packages/server/src/browser-handlers/__tests__/session-action-handler-spawn*.test.ts` | Prove browser flag forwarding and no-flag compatibility. |
| `packages/server/src/__tests__/worktree-base-spawn-flow.test.ts` | Prove spawn-token registration metadata path. |
| `packages/server/src/__tests__/process-manager.test.ts` | Prove process-manager shared flag threading. |
| `packages/server/src/__tests__/process-manager-keeper-spawn.test.ts` | Prove headless keeper argv. |

### Task 1: Replay Advisor Records

**Files:**
- Modify: `packages/shared/src/state-replay.ts:51-110`
- Modify: `packages/shared/src/__tests__/state-replay-flow-events.test.ts`
- Modify: `packages/shared/src/__tests__/state-replay-entry-id.test.ts`

**Interfaces:**
- Consumes: persisted `{ type: "custom_message", customType: "advisor", display?, id, content, details }`.
- Produces: two `EventForwardMessage` values with `{ message, entryId }`.
- Preserves: `type:"custom"` plus `customType:"flow-event"` collection and sequence ordering.

- [ ] **Step 1: Write replay failures**

```ts
it("replays visible advisor records as one message event pair", () => {
  const events = replayEntriesAsEvents("s1", [{
    type: "custom_message", id: "advisor-7", customType: "advisor",
    display: true, content: "<advisory>fix type</advisory>",
    details: { notes: [{ note: "fix type", severity: "concern" }] },
  }]);

  expect(events.map((event) => event.event.type)).toEqual(["message_start", "message_end"]);
  expect(events[1]?.event.data).toEqual({
    message: {
      role: "custom", customType: "advisor",
      content: "<advisory>fix type</advisory>",
      details: { notes: [{ note: "fix type", severity: "concern" }] },
    },
    entryId: "advisor-7",
  });
});

it("skips hidden and non-advisor custom_message records", () => {
  const events = replayEntriesAsEvents("s1", [
    { type: "custom_message", id: "hidden", customType: "advisor", display: false },
    { type: "custom_message", id: "other", customType: "rewind-report", display: true },
  ]);
  expect(events).toEqual([]);
});
```

- [ ] **Step 2: Run replay failures**

Run: `npm test -- packages/shared/src/__tests__/state-replay-flow-events.test.ts packages/shared/src/__tests__/state-replay-entry-id.test.ts`

Expected: FAIL. No advisor event pair exists.

- [ ] **Step 3: Add sibling replay branch**

Keep flow-event branch unchanged. Add branch after flow-event collection and before normal `message` handling.

```ts
if (
  entry.type === "custom_message" &&
  entry.customType === "advisor" &&
  entry.display !== false
) {
  const message = {
    role: "custom",
    customType: entry.customType,
    content: entry.content,
    details: entry.details,
  };
  messages.push(makeEvent(sessionId, "message_start", ts, { message, entryId: entry.id }));
  messages.push(makeEvent(sessionId, "message_end", ts, { message, entryId: entry.id }));
}
```

Add flow-event fixture containing one existing `type:"custom"` record and one advisor record. Assert flow event remains forwarded in its prior ordered output. Assert `entryId === "advisor-7"` on both generated events.

- [ ] **Step 4: Run replay tests**

Run: `npm test -- packages/shared/src/__tests__/state-replay-flow-events.test.ts packages/shared/src/__tests__/state-replay-entry-id.test.ts`

Expected: PASS. Visible advisor emits pair. Hidden and unrelated records emit none. Flow replay output matches prior assertions.

- [ ] **Step 5: Commit replay unit**

```bash
git add packages/shared/src/state-replay.ts packages/shared/src/__tests__/state-replay-flow-events.test.ts packages/shared/src/__tests__/state-replay-entry-id.test.ts
git commit -m "feat: replay advisor transcript records"
```

### Task 2: Define Protocol and Durable Metadata

**Files:**
- Modify: `packages/shared/src/browser-protocol.ts:SpawnSessionBrowserMessage`
- Modify: `packages/shared/src/browser-protocol.ts:DashboardSession`
- Modify: `packages/shared/src/session-meta.ts:SessionMeta`
- Modify: `packages/shared/src/__tests__/spawn-session-attach-proposal.test.ts`
- Modify: `packages/shared/src/__tests__/session-meta.test.ts`

**Interfaces:**
- Produces: `SpawnSessionBrowserMessage.advisor?: boolean`.
- Produces: `SessionMeta.advisor?: true` and `DashboardSession.advisor?: true`.
- Rule: browser accepts `false`; server never saves or broadcasts false.

- [ ] **Step 1: Write protocol and metadata failures**

```ts
const enabled: SpawnSessionBrowserMessage = {
  type: "spawn_session", cwd: "/repo", advisor: true,
};
const defaulted: SpawnSessionBrowserMessage = {
  type: "spawn_session", cwd: "/repo",
};
expect(JSON.parse(JSON.stringify(enabled))).toMatchObject({ advisor: true });
expect(JSON.parse(JSON.stringify(defaulted))).not.toHaveProperty("advisor");

writeSessionMeta(sessionFile, { source: "dashboard", advisor: true });
expect(readSessionMeta(sessionFile)).toMatchObject({ advisor: true });
```

Add compile-time assignment for `DashboardSession` with `advisor: true`. Do not add a `false` session metadata fixture. `advisor?: true` makes false a type error.

- [ ] **Step 2: Run protocol failures**

Run: `npm test -- packages/shared/src/__tests__/spawn-session-attach-proposal.test.ts packages/shared/src/__tests__/session-meta.test.ts`

Expected: FAIL. `advisor` properties absent from TypeScript interfaces.

- [ ] **Step 3: Add narrow optional fields**

Insert these members into existing interfaces.

```ts
// SpawnSessionBrowserMessage
/** Old servers ignore unknown field and perform bare spawn. */
advisor?: boolean;

// SessionMeta
/** Dashboard spawn proof. Absence keeps harness global default. */
advisor?: true;

// DashboardSession
advisor?: true;
```

Keep browser message union unchanged. `SpawnSessionBrowserMessage` already participates in `BrowserToServerMessage` union. Keep `readSessionMeta`, `writeSessionMeta`, and unknown-field-preserving `mergeSessionMeta` semantics unchanged.

- [ ] **Step 4: Run shared type and metadata tests**

Run: `npm test -- packages/shared/src/__tests__/spawn-session-attach-proposal.test.ts packages/shared/src/__tests__/session-meta.test.ts`

Expected: PASS. Wire JSON retains true, omits absent value, and sidecar round-trip retains true.

- [ ] **Step 5: Commit protocol unit**

```bash
git add packages/shared/src/browser-protocol.ts packages/shared/src/session-meta.ts packages/shared/src/__tests__/spawn-session-attach-proposal.test.ts packages/shared/src/__tests__/session-meta.test.ts
git commit -m "feat: define advisor spawn and session metadata"
```

### Task 3: Carry Advisor Through Every Spawn Mechanism

**Files:**
- Modify: `packages/shared/src/platform/spawn-mechanism.ts:SessionFlags`
- Modify: `packages/shared/src/__tests__/spawn-mechanism.test.ts`
- Modify: `packages/server/src/process-manager.ts:SessionOptions`
- Modify: `packages/server/src/process-manager.ts:spawnPiSession`
- Modify: `packages/server/src/__tests__/process-manager.test.ts`
- Modify: `packages/server/src/__tests__/process-manager-keeper-spawn.test.ts`

**Interfaces:**
- Consumes: `SessionOptions.advisor?: boolean`.
- Produces: `SessionFlags.advisor?: boolean`.
- Produces: argv suffix `"--advisor"` only for `advisor === true`.

- [ ] **Step 1: Write shared argv failures**

```ts
expect(sessionFlagsToArgv({ advisor: true })).toEqual(["--advisor"]);
expect(sessionFlagsToArgv({ advisor: false })).toEqual([]);
expect(sessionFlagsToArgv({ sessionFile: "/s.jsonl", mode: "continue", advisor: true }))
  .toEqual(["--session", "/s.jsonl", "--advisor"]);
expect(sessionFlagsToArgv({ sessionFile: "/s.jsonl", mode: "fork", advisor: true }))
  .toEqual(["--fork", "/s.jsonl", "--advisor"]);
```

Extend process-manager tests for tmux, WSL tmux, Windows Terminal, and headless keeper. Assert each argv contains one `--advisor` for true and none for absent or false.

- [ ] **Step 2: Run argv failures**

Run: `npm test -- packages/shared/src/__tests__/spawn-mechanism.test.ts packages/server/src/__tests__/process-manager.test.ts packages/server/src/__tests__/process-manager-keeper-spawn.test.ts`

Expected: FAIL. `SessionFlags` rejects advisor or argv lacks flag.

- [ ] **Step 3: Extend one common argv helper**

```ts
export interface SessionFlags {
  sessionFile?: string;
  mode?: "continue" | "fork";
  model?: string;
  advisor?: boolean;
}

function advisorFlag(flags: SessionFlags): string[] {
  return flags.advisor === true ? ["--advisor"] : [];
}

export function sessionFlagsToArgv(flags: SessionFlags): string[] {
  if (flags.sessionFile && flags.mode === "continue") {
    return ["--session", flags.sessionFile, ...advisorFlag(flags)];
  }
  if (flags.sessionFile && flags.mode === "fork") {
    return ["--fork", flags.sessionFile, ...modelFlag(flags), ...advisorFlag(flags)];
  }
  return [...modelFlag(flags), ...advisorFlag(flags)];
}
```

Add `advisor?: boolean` to `SessionOptions`. Pass `options.advisor` into every `SessionFlags` construction. Keep mechanism selection, model behavior, session/fork behavior, and keeper startup unchanged.

- [ ] **Step 4: Run mechanism tests**

Run: `npm test -- packages/shared/src/__tests__/spawn-mechanism.test.ts packages/server/src/__tests__/process-manager.test.ts packages/server/src/__tests__/process-manager-keeper-spawn.test.ts`

Expected: PASS. Fresh, continue, and fork argv preserve current flags and add advisor only for true across all mechanisms.

- [ ] **Step 5: Commit spawn argv unit**

```bash
git add packages/shared/src/platform/spawn-mechanism.ts packages/shared/src/__tests__/spawn-mechanism.test.ts packages/server/src/process-manager.ts packages/server/src/__tests__/process-manager.test.ts packages/server/src/__tests__/process-manager-keeper-spawn.test.ts
git commit -m "feat: pass advisor flag through spawn mechanisms"
```

### Task 4: Bind Durable Advisor Proof to Spawn Token

**Files:**
- Modify: `packages/server/src/browser-handlers/session-action-handler.ts:handleSpawnSession`
- Modify: `packages/server/src/event-wiring.ts:piGateway.onSessionRegistered`
- Modify: `packages/server/src/session-to-meta.ts:sessionToMeta`
- Modify: `packages/server/src/browser-handlers/__tests__/session-action-handler-spawn.test.ts`
- Modify: `packages/server/src/browser-handlers/__tests__/session-action-handler-spawn-with-attach.test.ts`
- Modify: `packages/server/src/__tests__/worktree-base-spawn-flow.test.ts`

**Interfaces:**
- Consumes: `SpawnResult.spawnToken`, `msg.advisor`, verified `session_register` spawn token.
- Produces: one consumed `Map<string, { advisor: true }>` record.
- Produces: registered `DashboardSession.advisor === true`, merged `.meta.json` proof, broadcast proof.
- Rejects: cwd-keyed queues, false records, registration without matching token.

- [ ] **Step 1: Write registration-flow failures**

```ts
await handleSpawnSession({ type: "spawn_session", cwd: "/repo", advisor: true });
registerSession({ cwd: "/repo", spawnToken: spawned.spawnToken });
expect(readSessionMeta(spawned.sessionFile)).toMatchObject({ advisor: true });
expect(lastBroadcast.sessions[0]).toMatchObject({ advisor: true });

await handleSpawnSession({ type: "spawn_session", cwd: "/repo", advisor: false });
registerSession({ cwd: "/repo", spawnToken: spawned.spawnToken });
expect(readSessionMeta(spawned.sessionFile)).not.toHaveProperty("advisor");
```

Add two same-`cwd` spawn fixtures with distinct tokens. Register token B before token A. Assert only matching session receives advisor proof. Add failed-spawn fixture. Assert no pending record survives because handler arms record only after successful `spawnPiSession` result.

- [ ] **Step 2: Run registration failures**

Run: `npm test -- packages/server/src/browser-handlers/__tests__/session-action-handler-spawn.test.ts packages/server/src/browser-handlers/__tests__/session-action-handler-spawn-with-attach.test.ts packages/server/src/__tests__/worktree-base-spawn-flow.test.ts`

Expected: FAIL. Handler drops advisor and registration has no token-keyed proof path.

- [ ] **Step 3: Arm and consume token-keyed proof**

Use existing post-spawn correlation location. Arm only after `spawnPiSession` resolves with token.

```ts
const spawn = await processManager.spawnPiSession(msg.cwd, {
  strategy: msg.strategy,
  advisor: msg.advisor,
});
if (msg.advisor === true && spawn.spawnToken) {
  pendingAdvisorBySpawnToken.set(spawn.spawnToken, { advisor: true });
}
```

Add event-wiring helper and invoke it from verified registration path.

```ts
function consumePendingAdvisor(spawnToken: string | undefined): { advisor: true } | undefined {
  if (!spawnToken) return undefined;
  const pending = pendingAdvisorBySpawnToken.get(spawnToken);
  if (pending) pendingAdvisorBySpawnToken.delete(spawnToken);
  return pending;
}

const advisor = consumePendingAdvisor(verifiedDashboardSpawnToken);
if (advisor) {
  session.advisor = true;
  mergeSessionMeta(session.sessionFile, { advisor: true });
}
```

Use registration token from existing strong dashboard-spawn provenance, not `cwd`, terminal name, arrival order, or unverified client message. Merge advisor write with existing worktree-base post-registration write. Add field to normal full persistence mapping.

Add one return-object member in `sessionToMeta`.

```ts
...(session.advisor === true ? { advisor: true as const } : {}),
```

This mapping prevents later full metadata persistence from erasing successful registration proof. Do not write false. Do not create live control handler or session command.

- [ ] **Step 4: Run registration tests**

Run: `npm test -- packages/server/src/browser-handlers/__tests__/session-action-handler-spawn.test.ts packages/server/src/browser-handlers/__tests__/session-action-handler-spawn-with-attach.test.ts packages/server/src/__tests__/worktree-base-spawn-flow.test.ts`

Expected: PASS. Token pair binds proof. Same-cwd out-of-order register stays isolated. False, absent, failed, and unmatched paths write no proof.

- [ ] **Step 5: Commit registration unit**

```bash
git add packages/server/src/browser-handlers/session-action-handler.ts packages/server/src/event-wiring.ts packages/server/src/session-to-meta.ts packages/server/src/browser-handlers/__tests__/session-action-handler-spawn.test.ts packages/server/src/browser-handlers/__tests__/session-action-handler-spawn-with-attach.test.ts packages/server/src/__tests__/worktree-base-spawn-flow.test.ts
git commit -m "feat: persist advisor spawn proof after registration"
```

### Task 5: Reduce and Render Advisor Transcript Rows

**Files:**
- Modify: `packages/client/src/lib/event-reducer.ts:ChatMessage,reduceEvent`
- Modify: `packages/client/src/lib/chat-virtual-rows.ts:baseRowSize,messageTextChars`
- Create: `packages/client/src/components/AdvisorCard.tsx`
- Modify: `packages/client/src/components/ChatView.tsx:virtual row switch`
- Modify: `packages/client/src/lib/i18n-en-source.json`
- Modify: `packages/client/src/lib/__tests__/event-reducer.test.ts`
- Modify: `packages/client/src/lib/__tests__/chat-virtual-rows.test.ts`
- Modify: `packages/client/src/components/__tests__/ChatView.test.tsx`
- Create: `packages/client/src/components/__tests__/AdvisorCard.test.tsx`

**Interfaces:**
- Produces: `ChatMessage.role: "advisor"`.
- Produces: advisor row fields `id`, `content`, `timestamp`, and `advisorDetails` carrying `details`.
- Consumes: `message_end` data with `message.role === "custom"`, `message.customType === "advisor"`.
- Uses: `data.entryId ?? data.message.id` as stable upsert key.

- [ ] **Step 1: Write reducer and component failures**

```ts
const event = messageEnd({
  entryId: "advisor-7",
  message: {
    id: "bridge-7", role: "custom", customType: "advisor", display: true,
    content: "<advisory>fix type</advisory>",
    details: { notes: [{ note: "fix type", severity: "concern", advisor: "Scout" }] },
  },
});
const once = reduceEvent(createInitialState(), event);
const twice = reduceEvent(once, event);
expect(twice.messages.filter((m) => m.role === "advisor")).toHaveLength(1);
expect(twice.messages.find((m) => m.id === "advisor-7")?.advisorDetails).toEqual(event.event.data.message.details);

render(<AdvisorCard message={advisorMessage({
  notes: [{ note: "n", severity: "nit" }, { note: "b", severity: "blocker" }],
})} />);
expect(screen.getByText("blocker")).toBeVisible();
await user.click(screen.getByRole("button"));
expect(screen.getByText("n")).toBeVisible();
expect(screen.getByText("b")).toBeVisible();
```

Add cases for `display:false`, `customType:"rewind-report"`, duplicate live event, and content-only fallback. Add ChatView fixture with one advisor row. Add virtual-row assertion for advisor base size and `content.length` reserve.

- [ ] **Step 2: Run client rendering failures**

Run: `npm test -- packages/client/src/lib/__tests__/event-reducer.test.ts packages/client/src/lib/__tests__/chat-virtual-rows.test.ts packages/client/src/components/__tests__/AdvisorCard.test.tsx packages/client/src/components/__tests__/ChatView.test.tsx`

Expected: FAIL. Reducer union rejects advisor or card module missing.

- [ ] **Step 3: Add idempotent reducer branch**

Add two members to existing `ChatMessage`.

```ts
role: "user" | "assistant" | "toolResult" | "thinking" | "bashOutput" |
  "commandFeedback" | "interactiveUi" | "turnSeparator" | "rawEvent" |
  "inlineTerminal" | "advisor";
advisorDetails?: Record<string, unknown>;
```

```ts
if (
  event.type === "message_end" &&
  data.message?.role === "custom" &&
  data.message.customType === "advisor" &&
  data.message.display !== false
) {
  const id = data.entryId ?? data.message.id;
  if (!id) return state;
  const row: ChatMessage = {
    id,
    role: "advisor",
    content: typeof data.message.content === "string" ? data.message.content : "",
    advisorDetails: data.message.details,
    timestamp: event.timestamp,
  };
  const index = state.messages.findIndex((message) => message.id === id);
  return index < 0
    ? { ...state, messages: [...state.messages, row] }
    : { ...state, messages: state.messages.map((message, i) => i === index ? row : message) };
}
```

Leave advisor `message_start` unhandled. Preserve existing custom-message behavior. Add no replay-only reducer path.

- [ ] **Step 4: Add card, virtual rows, ChatView, and copy**

```tsx
type AdvisorSeverity = "nit" | "concern" | "blocker";
type AdvisorNote = { note: string; severity?: AdvisorSeverity; advisor?: string };

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

const severityRank = { nit: 0, concern: 1, blocker: 2 } as const;
const notes = asAdvisorNotes(message.advisorDetails);
const topSeverity = notes.reduce<"nit" | "concern" | "blocker">(
  (top, note) => severityRank[note.severity ?? "nit"] > severityRank[top]
    ? note.severity ?? "nit" : top,
  "nit",
);
```

Render a `<button>` collapsed by default. Build label from optional first `advisor`, note count, top severity, and first-note preview. On expansion, map notes to severity-railed text rows. For absent or empty notes, render `message.content` in `<pre>`. Render no reply, input, fork, or copy-entry control. Use existing plain-text copy action only where ChatView already exposes it.

```tsx
case "advisor":
  return <AdvisorCard message={message} />;
```

Add `case "advisor": return 72;` in `baseRowSize`. Keep generic content sizing through `messageTextChars`. Add English keys `advisor.card`, `advisor.enable`, `advisor.chip`, and `advisor.chipTooltip`; regenerate only locale artifact required by existing i18n generation convention.

- [ ] **Step 5: Run client rendering tests**

Run: `npm test -- packages/client/src/lib/__tests__/event-reducer.test.ts packages/client/src/lib/__tests__/chat-virtual-rows.test.ts packages/client/src/components/__tests__/AdvisorCard.test.tsx packages/client/src/components/__tests__/ChatView.test.tsx`

Expected: PASS. One repeated id yields one row. Hidden and unrelated custom messages stay absent. Card starts collapsed, selects blocker precedence, expands notes, and falls back to raw content.

- [ ] **Step 6: Commit transcript unit**

```bash
git add packages/client/src/lib/event-reducer.ts packages/client/src/lib/chat-virtual-rows.ts packages/client/src/components/AdvisorCard.tsx packages/client/src/components/ChatView.tsx packages/client/src/lib/i18n-en-source.json packages/client/src/lib/__tests__/event-reducer.test.ts packages/client/src/lib/__tests__/chat-virtual-rows.test.ts packages/client/src/components/__tests__/AdvisorCard.test.tsx packages/client/src/components/__tests__/ChatView.test.tsx
git commit -m "feat: render advisor transcript cards"
```

### Task 6: Add Spawn Checkbox and Passive Session Chip

**Files:**
- Modify: `packages/client/src/components/WorktreeSpawnDialog.tsx`
- Modify: `packages/client/src/components/SessionList.tsx`
- Modify: `packages/client/src/hooks/useSessionActions.ts`
- Modify: `packages/client/src/components/SessionCard.tsx`
- Modify: `packages/client/src/components/__tests__/WorktreeSpawnDialog.test.tsx`
- Modify: `packages/client/src/components/__tests__/SessionCard.test.tsx`

**Interfaces:**
- Consumes: `fetchOmpConfig().settings["advisor.enabled"]?.value`.
- Produces: spawn option `{ advisor?: true }`.
- Produces: `spawn_session` payload `{ ...(options.advisor === true ? { advisor: true } : {}) }`.
- Consumes: `session.advisor === true` and reduced `messages.some((m) => m.role === "advisor")`.

- [ ] **Step 1: Write UI failures**

```tsx
render(<WorktreeSpawnDialog open onSpawn={onSpawn} advisorDefault={true} />);
expect(screen.getByRole("checkbox", { name: "Enable advisor" })).toBeChecked();
await user.click(screen.getByRole("button", { name: "Spawn" }));
expect(onSpawn).toHaveBeenCalledWith(expect.any(String), { advisor: true });

render(<WorktreeSpawnDialog open onSpawn={onSpawn} advisorDefault={false} />);
await user.click(screen.getByRole("button", { name: "Spawn" }));
expect(onSpawn).toHaveBeenCalledWith(expect.any(String), {});
```

Mock `fetchOmpConfig` three ways: `advisor.enabled` true, false, rejected/missing. Assert true seeds checked. Assert false and unavailable seed unchecked without blocking spawn. Add SessionCard desktop and mobile fixtures for metadata proof, observed advisor row proof, and absent proof.

- [ ] **Step 2: Run UI failures**

Run: `npm test -- packages/client/src/components/__tests__/WorktreeSpawnDialog.test.tsx packages/client/src/components/__tests__/SessionCard.test.tsx`

Expected: FAIL. Dialog lacks checkbox/default and cards lack passive chip.

- [ ] **Step 3: Derive spawn default and emit true-only option**

Use existing `fetchOmpConfig` helper. Resolve value only when exact boolean true.

```ts
const advisorDefault = snapshot.settings["advisor.enabled"]?.value === true;

const spawnOptions = {
  ...(gitWorktreeBase ? { gitWorktreeBase } : {}),
  ...(attachProposal ? { attachProposal } : {}),
  ...(advisorEnabled ? { advisor: true as const } : {}),
};
```

Keep fetch failure local to default derivation. Set `advisorDefault` false on rejection or missing key. Thread default through both plain and proposal dialog instances in `SessionList`. Thread option through `handleSpawnExisting`, `handleCreateAndSpawn`, and `useSessionActions.handleSpawnSession`.

```ts
send({
  type: "spawn_session",
  cwd,
  ...(options.advisor === true ? { advisor: true } : {}),
});
```

Never serialize `advisor: false`.

- [ ] **Step 4: Render passive chip on desktop and mobile**

```tsx
const hasAdvisor = session.advisor === true || messages.some((message) => message.role === "advisor");

{hasAdvisor && (
  <span title={t("advisor.chipTooltip")} className={worktreePillClass}>
    {t("advisor.chip")}
  </span>
)}
```

Place identical non-interactive chip in existing desktop and mobile SessionCard chip areas. Reuse compact chip classes and tooltip convention. Do not add checkbox, click handler, ARIA pressed state, or command dispatch to session cards.

- [ ] **Step 5: Run UI tests**

Run: `npm test -- packages/client/src/components/__tests__/WorktreeSpawnDialog.test.tsx packages/client/src/components/__tests__/SessionCard.test.tsx`

Expected: PASS. Mirror true seeds checked. Mirror false and unavailable seed unchecked. Checked sends true. Unchecked omits field. Metadata or advisor row shows non-interactive chip on both layouts.

- [ ] **Step 6: Commit spawn UI unit**

```bash
git add packages/client/src/components/WorktreeSpawnDialog.tsx packages/client/src/components/SessionList.tsx packages/client/src/hooks/useSessionActions.ts packages/client/src/components/SessionCard.tsx packages/client/src/components/__tests__/WorktreeSpawnDialog.test.tsx packages/client/src/components/__tests__/SessionCard.test.tsx
git commit -m "feat: expose advisor spawn default and session chip"
```

### Task 7: Run Focused Contract Gates

**Files:**
- Modify only when focused gate reveals a contract defect: files from Tasks 1–6.
- Modify: `docs/AGENTS.md`
- Modify: `docs/superpowers/plans/2026-07-18-surface-omp-advisor.md`

**Interfaces:**
- Verifies: replay, protocol, metadata, every argv mechanism, registration correlation, reducer, card, virtualization, spawn input, passive chip.
- Prohibits: false persistence, duplicate rows, flow replay regressions, mechanism-only argv behavior, live toggle protocol.

- [ ] **Step 1: Run focused cross-layer suite**

Run: `npm test -- packages/shared/src/__tests__/state-replay-flow-events.test.ts packages/shared/src/__tests__/state-replay-entry-id.test.ts packages/shared/src/__tests__/spawn-session-attach-proposal.test.ts packages/shared/src/__tests__/session-meta.test.ts packages/shared/src/__tests__/spawn-mechanism.test.ts packages/server/src/browser-handlers/__tests__/session-action-handler-spawn.test.ts packages/server/src/browser-handlers/__tests__/session-action-handler-spawn-with-attach.test.ts packages/server/src/__tests__/worktree-base-spawn-flow.test.ts packages/server/src/__tests__/process-manager.test.ts packages/server/src/__tests__/process-manager-keeper-spawn.test.ts packages/client/src/lib/__tests__/event-reducer.test.ts packages/client/src/lib/__tests__/chat-virtual-rows.test.ts packages/client/src/components/__tests__/AdvisorCard.test.tsx packages/client/src/components/__tests__/ChatView.test.tsx packages/client/src/components/__tests__/SessionCard.test.tsx packages/client/src/components/__tests__/WorktreeSpawnDialog.test.tsx`

Expected: PASS. Every named test file exits 0.

- [ ] **Step 2: Run i18n parity gate**

Run: `npm run i18n:parity`

Expected: PASS. English advisor keys match generated locale coverage.

- [ ] **Step 3: Run type and full test gates**

Run: `npm run lint && npm test`

Expected: PASS. TypeScript exits 0. Vitest preserves or exceeds baseline `10,882 passed`, `22 skipped`.

- [ ] **Step 4: Run changed-quality gate**

Run: `npm run quality:changed`

Expected: PASS. Biome, TypeScript, and Vitest exit 0.

- [ ] **Step 5: Update documentation index and commit gate record**

Add one `docs/AGENTS.md` row for this plan. Keep index sentence concrete. Do not add product documentation because runtime behavior already receives source tests and plan record.

```bash
git add docs/AGENTS.md docs/superpowers/plans/2026-07-18-surface-omp-advisor.md
git commit -m "docs: add advisor implementation plan"
```

## Requirement Map

| Requirement | Tasks |
|---|---|
| Live advisor row, hidden/custom skip, duplicate upsert | 5 |
| Replay pair, entryId, flow-event preservation | 1, 5 |
| Card collapse, severity precedence, note source, content fallback | 5 |
| Optional spawn flag, true-only argv, old-server bare spawn | 2, 3, 4, 6 |
| Every spawn mechanism | 3 |
| Durable true-only metadata and broadcast | 2, 4 |
| OMP mirror spawn checkbox and unavailable fallback | 6 |
| Passive metadata-or-activity chip | 5, 6 |
| No live control protocol | Global Constraints, 4, 6, 7 |
| Focused and final verification | 7 |

## Plan Self-Review

- Spec coverage: complete. Requirement map assigns every delta requirement and scenario.
- Deferred control boundary: complete. Global constraints and Tasks 4, 6, and 7 prohibit live toggle transport.
- Replay isolation: complete. Task 1 asserts `custom_message` advisor shape and existing `custom` flow-event shape.
- Metadata durability: complete. Task 4 updates token consumption, merge write, broadcast session, and `sessionToMeta` overwrite path.
- Cross-mechanism argv: complete. Task 3 routes every mechanism through `sessionFlagsToArgv` and tests fresh, fork, continue, tmux, WSL tmux, Windows Terminal, and keeper.
- Duplicate delivery: complete. Task 5 keys reducer row by `entryId ?? message.id` and repeats same event.
- Missing-detail card: complete. Task 5 covers raw `content` fallback.
- Deferred-marker scan: clean. No unresolved planning markers remain.
- Type consistency: complete. Protocol input uses `advisor?: boolean`; durable/session broadcast proof uses `advisor?: true`; client spawn option emits `advisor?: true`; reducer role uses literal `"advisor"` and `advisorDetails`.
