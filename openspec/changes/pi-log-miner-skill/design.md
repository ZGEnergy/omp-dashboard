## Context

Pi session logs (JSONL files at `~/.pi/agent/sessions/`) contain rich knowledge that is lost after sessions end. The dashboard already has session discovery (`session-file-reader.ts`, `session-discovery.ts`), event replay (`state-replay.ts`), and a REST API for session metadata. The pi SDK provides `createAgentSession`, `SessionManager`, fork mechanics, and read-only tools — everything needed to spawn cheap Haiku workers programmatically.

Honcho (`@honcho-ai/sdk`) provides memory infrastructure with background reasoning. The community `pi-honcho-memory` extension proves the integration pattern. `pi-model-proxy` (`@blackbelt-technology/pi-model-proxy`) exposes pi's authenticated models as OpenAI/Anthropic-compatible local endpoints on `localhost:9876`, letting Honcho use pi's models without separate API keys.

The dashboard server already manages external processes (zrok tunnel via subprocess + PID files). Docker Compose lifecycle follows the same pattern but uses `docker compose` CLI instead of direct spawning.

## Goals / Non-Goals

**Goals:**
- Cost-efficient session analysis (~$0.02/session via Haiku fork-per-chunk pipeline)
- Topic-aware summaries with surprise/contradiction/gap detection against project knowledge
- Persistent knowledge that compounds across mining runs via Honcho
- Zero-config Honcho setup via Docker managed by the dashboard server
- Honcho LLM calls routed through pi-model-proxy (no API key duplication)
- Dashboard UI: summarize button, progress tracking, summary viewer
- Graceful degradation at every layer (no Docker → no Honcho → markdown-only output)

**Non-Goals:**
- Real-time session analysis during active sessions (post-hoc only, though active sessions can get partial summaries)
- Replacing the community `pi-honcho-memory` extension (we complement it, not compete)
- Custom Honcho server modifications (we use stock Honcho Docker image)
- Multi-user/team sharing (single-user pipeline, team sharing via `.pi/memories/` export)
- Batch "summarize all sessions" UI (individual session summarization only)

## Decisions

### 1. Pi SDK over `pi --print` for chunk processing

**Decision**: Use `createAgentSession` + `SessionManager` from the pi SDK directly, not `pi --print` subprocess calls.

**Rationale**: The SDK gives us fork control (`SessionManager.forkFrom`), in-process event streaming, and no subprocess overhead. Each fork inherits the knowledge seed's conversation history without re-reading files. For 20 chunks, this saves 20× file-reading latency plus subprocess spawn time.

**Alternative considered**: `pi --print --model haiku` per chunk. Simpler to implement but each call is a cold start — re-reads AGENTS.md, re-discovers extensions, re-builds system prompt. ~2s overhead per chunk × 20 chunks = 40s wasted.

### 2. Fork-per-chunk with cleanup over fresh sessions

**Decision**: Fork the knowledge seed for each chunk, then delete the fork session file after extracting the response.

**Rationale**: Fork instantly inherits ~2K tokens of project context. Fresh sessions would need to re-inject that context as a prompt, doubling token cost. Fork session files are small (~10KB each) and cleaned up immediately.

**Alternative considered**: Single long-running session processing all chunks sequentially. Risk: context window fills up after ~15 chunks, forcing compaction that loses earlier analysis. Fork-per-chunk keeps each analysis independent.

### 3. Hybrid topic detection (heuristic + LLM confirmation)

**Decision**: Use cheap heuristics first (file-cluster disjointness, time gaps >10min, user prompt keywords, tool-pattern shifts), then have the Haiku chunk analyzer confirm/refine the topic label as part of its normal analysis prompt.

**Rationale**: No separate LLM call for topic detection. The heuristics catch ~80% of boundaries at zero cost. The remaining 20% are refined by Haiku during its chunk analysis response, which it's already doing anyway.

**Alternative considered**: Dedicated topic-classification LLM call before each chunk. Doubles the number of LLM calls for marginal accuracy improvement.

### 4. Honcho two-peer model (project + developer)

**Decision**: Model the project codebase as a Honcho peer (`project`), not just a session or workspace-level concept. Store architectural knowledge as conclusions about this peer.

**Rationale**: Honcho's reasoning layer builds representations of peers. By modeling the project as a peer, Honcho automatically synthesizes a "project profile" that evolves over time — exactly what the knowledge seed needs. The developer peer is populated by the community extension if installed.

**Alternative considered**: Store conclusions without a peer target (workspace-level). Loses Honcho's peer representation feature, which is its core value proposition.

### 5. Docker Compose managed by dashboard server

**Decision**: Dashboard generates a `docker-compose.yml` at `~/.pi/dashboard/honcho/` and manages the stack lifecycle via `docker compose` CLI commands.

**Rationale**: Follows the same pattern as zrok tunnel management (detect binary → spawn → health check → cleanup). Docker Compose handles PostgreSQL + Honcho networking internally. Named volumes survive container restarts. Non-blocking startup doesn't delay dashboard boot.

**Alternative considered**: 
- Hosted Honcho at `api.honcho.dev` only — simpler but requires internet, doesn't work offline, data leaves the machine.
- Single Docker container — Honcho needs PostgreSQL with pgvector, can't bundle both in one container cleanly.
- Dashboard embeds SQLite-based Honcho alternative — doesn't exist, would be a massive effort.

### 6. pi-model-proxy for Honcho's LLM access

**Decision**: Configure Honcho's Docker container with `OPENAI_BASE_URL=http://host.docker.internal:9876/v1` pointing to pi-model-proxy.

**Rationale**: Zero API key duplication. Honcho uses whatever models/subscriptions pi has — including OAuth subscriptions (Claude Pro/Max). The proxy is already designed for this exact use case (its README shows Honcho as the primary example). `host.docker.internal` lets the Docker container reach the host's localhost.

**Alternative considered**: Pass API keys from `~/.pi/agent/auth.json` as Docker environment variables. Requires reading auth storage, handling OAuth token refresh, and duplicating key management logic. pi-model-proxy handles all of this already.

### 7. Summary storage: markdown files + Honcho conclusions

**Decision**: Dual output — human-readable markdown at `.pi/memories/session-summaries/<session-id>.md` AND structured Honcho conclusions for semantic search.

**Rationale**: Markdown files work without Honcho (graceful degradation), are git-friendly, and human-readable. Honcho conclusions enable semantic search ("what do we know about auth?") and feed back into future knowledge seeds. Both outputs are generated from the same rolling summary data.

### 8. Dashboard summarize button on both ended and active sessions

**Decision**: Show summarize action for ended sessions (full analysis) and active sessions (partial analysis of activity so far).

**Rationale**: Active session summaries are useful for long-running sessions — "what has this agent done in the last 2 hours?" Active summaries are marked as "in-progress" and can be re-analyzed after the session ends.

## Risks / Trade-offs

### Docker dependency for Honcho features
**Risk**: Users without Docker lose Honcho's semantic search and knowledge compounding.
**Mitigation**: Full graceful degradation — pipeline produces identical markdown output without Honcho. External mode (`mode: "external"`) supports hosted Honcho or user-managed instances. Docker is only needed for the zero-config managed experience.

### pi-model-proxy must be running for Honcho reasoning
**Risk**: If pi-model-proxy is not installed or the pi session that hosts it isn't running, Honcho's deriver/summarizer/dream won't function.
**Mitigation**: Dashboard health-checks the proxy before starting Honcho with reasoning enabled. If proxy is down, Honcho starts in CRUD-only mode — storage works, pipeline stores conclusions directly, but no background reasoning. Dashboard UI shows proxy status clearly.

### `host.docker.internal` portability
**Risk**: `host.docker.internal` works on Docker Desktop (macOS/Windows) but may need `--add-host` on Linux Docker Engine.
**Mitigation**: Generated docker-compose.yml includes `extra_hosts: ["host.docker.internal:host-gateway"]` for Linux compatibility.

### Fork session file accumulation during analysis
**Risk**: A session with 30 chunks creates 30 temporary fork files before cleanup.
**Mitigation**: Forks are created and deleted sequentially (not in parallel). Each fork file is ~10KB and exists for <5 seconds. Cleanup is in a `finally` block to handle crashes.

### Haiku model availability
**Risk**: User may not have Anthropic API key or Haiku access.
**Mitigation**: Pipeline should fall back to any available cheap model via `modelRegistry.getAvailable()`. The seed and chunk analysis don't need a specific model — any fast, cheap model works.

### Knowledge seed staleness
**Risk**: Seed becomes outdated as project evolves, leading to false "surprise" detections.
**Mitigation**: Content hash of source docs (AGENTS.md, architecture.md) checked before each pipeline run. Contradictions detected during analysis also trigger seed staleness flag. Seed recreation is cheap (~$0.001).

### Honcho Docker image size and startup time
**Risk**: First run downloads ~500MB of Docker images, taking minutes on slow connections.
**Mitigation**: Dashboard starts Honcho stack non-blocking in the background. Pipeline waits for health check but dashboard UI is immediately available. Subsequent starts use cached images (<5s).

## Open Questions

- **Honcho Docker image tag**: Pin to a specific version or use `latest`? Pinning is safer but requires manual updates. Recommend pinning to a known-good release.
- **Honcho TOML configuration**: Which models should Honcho's deriver/summarizer default to via pi-model-proxy? Gemini for cheap operations, Anthropic for dialectic reasoning — but these need to be valid model IDs in pi-model-proxy's registry.
- **Linux `host.docker.internal`**: Test that `extra_hosts` approach works across Docker Engine versions. May need version detection.
