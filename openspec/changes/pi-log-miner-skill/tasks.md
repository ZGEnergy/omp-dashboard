## 1. Shared Types & Config

- [ ] 1.1 Create `src/shared/summary-types.ts` with RollingSummary, TopicSection, ChunkAnalysis, SummaryReport, SummaryStatus types
- [ ] 1.2 Add `honcho` section to DashboardConfig in `src/shared/config.ts` (enabled, port, mode, externalUrl, proxyPort, liveTrackingDefault) with defaults
- [ ] 1.3 Add summary WebSocket event types to `src/shared/browser-protocol.ts` (summary_progress, summary_complete)

## 2. Topic-Aware Chunking

- [ ] 2.1 Create `src/server/log-miner/chunk-parser.ts` — JSONL parser using session-file-reader that groups entries into agent rounds
- [ ] 2.2 Create `src/server/log-miner/topic-detector.ts` — hybrid topic boundary detection (file clusters, time gaps, keywords, tool patterns)
- [ ] 2.3 Create `src/server/log-miner/chunk-content-extractor.ts` — extract text content from chunks, truncate large tool results at 500 chars
- [ ] 2.4 Write tests for chunk-parser (multi-round sessions, compaction entries, empty sessions)
- [ ] 2.5 Write tests for topic-detector (file disjointness, time gaps, keyword detection, tool pattern shifts)

## 3. Knowledge Seed Management

- [ ] 3.1 Create `src/server/log-miner/knowledge-seed.ts` — seed creation, staleness check, recreation logic
- [ ] 3.2 Implement content-hash computation for source docs (AGENTS.md, architecture.md) and hash storage as sidecar JSON
- [ ] 3.3 Implement seed creation via pi SDK (createAgentSession with Haiku, read-only tools, minimal resource loader)
- [ ] 3.4 Implement model fallback — prefer Haiku, fall back to cheapest available model via modelRegistry.getAvailable()
- [ ] 3.5 Write tests for staleness detection (hash match, hash mismatch, contradiction flag)

## 4. Rolling Summarization Pipeline

- [ ] 4.1 Create `src/server/log-miner/rolling-analyzer.ts` — fork-per-chunk orchestrator with sequential processing
- [ ] 4.2 Implement structured analysis prompt template (rolling summary + chunk + JSON extraction instructions)
- [ ] 4.3 Implement rolling summary accumulation logic (topic sections, append vs new topic)
- [ ] 4.4 Implement fork cleanup in finally blocks (delete fork session files after each chunk)
- [ ] 4.5 Write tests for rolling summary accumulation (topic changes, same-topic appends, empty summary start)

## 5. Summary Output

- [ ] 5.1 Create `src/server/log-miner/summary-formatter.ts` — convert RollingSummary to markdown report
- [ ] 5.2 Implement metadata header (session ID, name, date, costs, duration, chunk count)
- [ ] 5.3 Implement topic section rendering (summaries, decisions, discoveries, patterns)
- [ ] 5.4 Implement surprises/contradictions section and knowledge-for-seed-update section
- [ ] 5.5 Implement file writing to `.pi/memories/session-summaries/<session-id>.md` with directory creation
- [ ] 5.6 Write tests for markdown formatting (all sections, no-findings case, re-analysis overwrite)

## 6. Honcho Docker Lifecycle

- [ ] 6.1 Create `src/server/honcho-docker.ts` — Docker availability detection (cached `docker compose version` check)
- [ ] 6.2 Implement compose file generation at `~/.pi/dashboard/honcho/docker-compose.yml` (PostgreSQL+pgvector, Honcho server, host.docker.internal, named volume)
- [ ] 6.3 Implement auto-start (`docker compose -p pi-dashboard-honcho up -d`) as non-blocking background task
- [ ] 6.4 Implement health probe with backoff on Honcho `/health` endpoint (60s timeout)
- [ ] 6.5 Implement pi-model-proxy connectivity check (`GET localhost:<proxyPort>/health`) — reasoning toggle
- [ ] 6.6 Implement auto-stop (`docker compose -p pi-dashboard-honcho stop`) on dashboard shutdown
- [ ] 6.7 Wire Docker lifecycle into server startup/shutdown hooks in `src/server/server.ts`
- [ ] 6.8 Write tests for Docker detection, compose file generation, health probe logic

## 7. Honcho Memory Integration

- [ ] 7.1 Add `@honcho-ai/sdk` npm dependency
- [ ] 7.2 Create `src/server/honcho-client.ts` — SDK wrapper with workspace/peer management, graceful degradation
- [ ] 7.3 Implement two-peer model: create workspace per cwd, `project` peer, read-only `developer` peer access
- [ ] 7.4 Implement conclusion storage with metadata (category, importance, topic, sessionId, sourceRound)
- [ ] 7.5 Implement knowledge feedback loop — query project peer representation + top conclusions for seed enrichment
- [ ] 7.6 Implement Honcho session creation per analysis with message storage for chunk results
- [ ] 7.7 Integrate Honcho client into knowledge-seed.ts (enrich seed with Honcho data when available)
- [ ] 7.8 Integrate Honcho client into rolling-analyzer.ts (store conclusions after pipeline completes)
- [ ] 7.9 Write tests for Honcho client (mock SDK — workspace creation, conclusion storage, graceful degradation)

## 8. Live Automatic Tracking

- [ ] 8.1 Create `src/server/log-miner/live-tracker.ts` — per-session accumulator with in-memory round buffer and rolling summary
- [ ] 8.2 Implement debounced analysis trigger (topic change OR 3-round threshold OR 30s idle timeout)
- [ ] 8.3 Implement incremental pipeline: fork knowledge seed, analyze buffered rounds, update rolling summary
- [ ] 8.4 Implement dual output: write Honcho conclusions per batch + persist markdown on session end or toggle-off
- [ ] 8.5 Implement per-session toggle state map with global default from `honcho.liveTrackingDefault`
- [ ] 8.6 Wire into `event-wiring.ts`: add `liveTracker.onRoundComplete(sessionId, event)` call in `agent_end` case
- [ ] 8.7 Wire session unregister: persist rolling summary as markdown report when session ends
- [ ] 8.8 Add WebSocket message for toggle state: browser sends toggle command, server updates per-session state
- [ ] 8.9 Write tests for live-tracker (accumulation, debounce triggers, toggle on/off, session end persistence)

## 9. Dashboard Server Routes

- [ ] 9.1 Create `src/server/routes/summary-routes.ts` — POST /api/session/:id/summarize, GET /api/session/:id/summary
- [ ] 9.2 Create `src/server/routes/honcho-routes.ts` — GET /api/honcho/status
- [ ] 9.3 Create `src/server/summary-pipeline.ts` — background pipeline runner that wires chunker → seed → analyzer → formatter → Honcho storage
- [ ] 9.4 Implement WebSocket progress events (summary_progress, summary_complete) via browser gateway
- [ ] 9.5 Implement summary status tracking (pending/processing/ready/error) with in-memory state
- [ ] 9.6 Register new routes in server.ts
- [ ] 9.7 Write tests for summary routes (trigger, status polling, progress events)

## 10. Dashboard Client UI

- [ ] 10.1 Create `src/client/components/SummarizeButton.tsx` — button for session header and mobile action menu
- [ ] 10.2 Add "Summarize"/"Re-analyze" option to MobileActionMenu kebab menu
- [ ] 10.3 Add summarize action to SessionHeader actions
- [ ] 10.4 Create `src/client/components/LiveTrackingToggle.tsx` — compact toggle (brain icon + switch) for session header, green when active
- [ ] 10.5 Wire LiveTrackingToggle into SessionHeader — visible only for active sessions, sends toggle command via WebSocket
- [ ] 10.6 Create `src/client/components/SummaryView.tsx` — content-area view with collapsible topic sections, colored badges
- [ ] 10.7 Implement summary progress indicator on session card during processing
- [ ] 10.8 Implement re-analyze staleness detection (session has new events since last summary)
- [ ] 10.9 Add Honcho section to SettingsPanel with: Honcho status indicator, Live Knowledge Tracking toggle (`liveTrackingDefault`)
- [ ] 10.10 Handle summary + live tracking WebSocket events in useMessageHandler.ts
- [ ] 10.11 Add summary fetch hook (`useSessionSummary.ts`)

## 11. Skill Definition

- [ ] 11.1 Create `.pi/skills/pi-log-miner/SKILL.md` with skill metadata, description, and usage instructions
- [ ] 11.2 Create `.pi/skills/pi-log-miner/references/extraction-prompts.md` with prompt templates for seed system prompt and chunk analysis
- [ ] 11.3 Create `.pi/skills/pi-log-miner/references/output-schema.md` with JSON schema for chunk analysis response
- [ ] 11.4 Create `.pi/skills/pi-log-miner/references/honcho-integration.md` with Honcho setup guide and two-peer model docs

## 12. Documentation

- [ ] 12.1 Update AGENTS.md with new key files (honcho-docker.ts, honcho-client.ts, summary-pipeline.ts, live-tracker.ts, log-miner/ modules)
- [ ] 12.2 Update docs/architecture.md with log-miner pipeline data flow, live tracking event hook, and Honcho Docker lifecycle
- [ ] 12.3 Update README.md with Honcho setup section (Docker requirement, pi-model-proxy dependency, config options, live tracking toggle)
