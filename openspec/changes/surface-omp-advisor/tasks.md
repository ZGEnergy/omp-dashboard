# surface-omp-advisor — tasks

## 1. Shared: replay + protocol

- [ ] 1.1 `packages/shared/src/state-replay.ts`: add the `entry.type === "custom_message" && entry.customType === "advisor" && entry.display !== false` branch to `replayEntriesAsEvents`, emitting `message_start` + `message_end` with the entry reshaped to message form and `entryId: entry.id` (design D3).
- [ ] 1.2 `packages/shared/src/__tests__/`: replay tests — advisor entry produces the event pair; `display: false` advisor entry is skipped; non-advisor `custom_message` entries stay skipped; `flow-event` branch unaffected.
- [ ] 1.3 `packages/shared/src/browser-protocol.ts`: add optional `advisor?: boolean` to `SpawnSessionBrowserMessage` with the old-server degradation comment (design D5); add the session-metadata `advisor?: true` field to the session info type the server broadcasts.
- [ ] 1.4 `packages/shared/src/__tests__/`: protocol type tests per existing convention.

## 2. Client: advisor row + card

- [ ] 2.1 `packages/client/src/lib/event-reducer.ts`: add `"advisor"` to the `ChatMessage` role union; map `message_end` where `data.message.role === "custom" && data.message.customType === "advisor" && data.message.display !== false` to an upserted advisor row keyed by `data.entryId ?? data.message.id` (design D2).
- [ ] 2.2 `packages/client/src/components/AdvisorCard.tsx` (new): collapsed `Advisor [<name>] · N notes · <top severity> · <preview>`; click expands severity-railed notes (`blocker` > `concern` > `nit`); `details.notes` primary source, raw `content` preformatted fallback (design D4). Match TUI `advisor-message.ts` visual intent with existing card/tailwind conventions.
- [ ] 2.3 `packages/client/src/components/ChatView.tsx`: render `role === "advisor"` rows via `AdvisorCard`; no fork/copy-entry actions beyond plain-text copy.
- [ ] 2.4 `packages/client/src/lib/chat-virtual-rows.ts`: add the `"advisor"` row case (collapsed height estimate; expandable).
- [ ] 2.5 `packages/client/src/lib/i18n-en-source.json` (+ locale stubs per convention): AdvisorCard + chip strings.
- [ ] 2.6 Tests: reducer live-path mapping (incl. upsert/no-dup on repeated id, skip `display:false`, skip non-advisor custom), `AdvisorCard` collapsed/expanded render + severity precedence + content fallback.

## 3. Server: spawn-time flag

- [ ] 3.1 `packages/server/src/browser-handlers/session-action-handler.ts`: accept `advisor` from `spawn_session` and pass it through to the spawn options.
- [ ] 3.2 `packages/server/src/process-manager.ts`: `spawnPiSession` appends `--advisor` to the omp argv only when the option is `true` (design D5); thread the option through the spawn-mechanism branches uniformly.
- [ ] 3.3 Session metadata: persist `advisor: true` to the spawned session's `.meta.json` and include it in the session info broadcast; ensure resume/restore preserves it.
- [ ] 3.4 Tests: argv contains `--advisor` iff flag true; handler passes the field; unknown-field absence unchanged (bare spawn).

## 4. Client: spawn checkbox + passive chip

- [ ] 4.1 Spawn UI (`SessionList.tsx` / `WorktreeSpawnDialog.tsx` spawn paths): "Enable advisor" checkbox; initial state = mirrored global `advisor.enabled` via `fetchOmpConfig()` (`lib/omp-config-api.ts`), falling back to unchecked when the mirror is unavailable; sends `advisor: true` only when checked.
- [ ] 4.2 Passive chip (design D6): render "Advisor" chip when session metadata has `advisor: true` OR the reduced state contains an advisor row; tooltip explains the advisor; visually non-interactive.
- [ ] 4.3 Tests: checkbox seeding (mirror on/off/unavailable), flag sent only when checked, chip visibility rules.

## 5. Gates

- [ ] 5.1 `npm test` green (capture to file, grep failures per AGENTS.md).
- [ ] 5.2 `npm run quality:changed` green.
- [ ] 5.3 `npx tsx .pi/skills/implement/scripts/review-changes.ts` advisory gate triaged.
- [ ] 5.4 Directory `AGENTS.md` rows added/updated for new files per the Documentation Update Protocol.
