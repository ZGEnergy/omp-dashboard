# Reverse-spec prompt tuning — results

Records `reverse-spec-from-code` skill prompt tuning + generator-model-loss experiment. Raw per-capability generated specs live in gitignored `.reverse-spec-scratch/`. Skill lives at `.pi/skills/reverse-spec-from-code/`.

Ground truth: 6 real openspec/specs. Generators ran BLIND (code only). Judge scored gen-vs-real semantically (granularity-neutral, stale-spec-aware).

## Scores (requirement coverage / scenario coverage)
| capability | v1 req | v1 scen | v2 req | v2 scen |
|---|---|---|---|---|
| server-cors | 72 | 80 | 96 | 92 |
| server-restart | 40 | 30 | 95 | 85 |
| token-stats-bar | 65 | 55 | 92 | 85 |
| jiti-loader | 72 | 55 | 100 | 100 |
| ws-ping-pong | 90 | 78 | 100 | 95 |
| force-kill-handler | 62 | 55 | 100 | 88 |
| average | 66.8 | 58.8 | 97.2 | 90.8 |

## What changed v1->v2 (prompt levers)
1. Cross-boundary exploration (STEP 1): follow every emitted message / registry write / spawned process / config read into the OTHER file and spec it. Dominant lever (server-restart 40->95).
2. Group into 3-8 requirements with multiple scenarios; stop over-splitting.
3. Add `# <cap> Specification` title header.
4. "Describe CURRENT code, do not soften to older assumptions" — real specs drift from code; a more code-accurate generated spec is a WIN not a miss.

## Residual (folded into shipped prompt v3)
- token-stats-bar invented a 4-color stacked bar not in code -> rule: do not describe visual/detail specifics not confirmed in code.

## Key insight for fitness
"Match the real spec" = PROXY not goal. Real specs go stale. Goal = spec that accurately describes CURRENT code and is kb_search-able. Target high requirement coverage + zero code-ungrounded hallucination, accepting code-current divergence from stale specs.

## Model-size loss test (generator model swap; judge held constant @research)
Same 6 ground-truth specs, same v2/v3 prompts, same scope. ONLY GENERATOR model changed. Judge = @research (opus) for all, so comparison clean.
| capability | opus req | haiku req | opus scen | haiku scen | haiku format | haiku validate |
|---|---|---|---|---|---|---|
| server-cors | 96 | 90 | 92 | 92 | 98 | PASS |
| server-restart | 95 | 95 | 85 | 85 | 90 | (pass) |
| token-stats-bar | 92 | 90 | 85 | 85 | 20 | FAIL |
| jiti-loader | 100 | 90 | 100 | 75 | 30 | FAIL |
| ws-ping-pong | 100 | 95 | 95 | 90 | 80 | (pass) |
| force-kill-handler | 100 | 68 | 88 | 60 | 55 | FAIL |
| average | 97.2 | 88.0 | 90.8 | 81.2 | 62.2 | 3/6 pass |

Loss opus @research -> haiku @compact: req 97.2->88.0 (-9.2 pts); scen 90.8->81.2 (-9.6 pts); openspec validate 6/6->3/6 (format collapse dominant).

Where loss concentrates:
1. FORMAT big drop — haiku invents markdown TABLES, bold `**Scenario:**` instead of `#### Scenario:`, numbered `### Requirement N:`; 3/6 fail openspec validate; semantic content fine, STRUCTURE breaks.
2. HARDEST cross-cutting cap degrades most: force-kill 100->68 req; haiku missed PID-correlation / pre-SIGKILL safety-check / no-direct-kill (needs 3-4 files); single-file caps hold ~90+.
3. Hallucinations rise ~0 -> a few (token-stats continuous-gradient vs discrete thresholds; force-kill durable liveness marker).

## Third data point: @fast = deepseek-v4-flash (generator), judge held @research
| capability | flash req | flash scen | flash format | flash validate |
|---|---|---|---|---|
| server-cors | 100 | 100 | 100 | PASS |
| server-restart | 100 | 100 | 95 | PASS |
| token-stats-bar | 80 | 72 | 95 | PASS |
| jiti-loader | 95 | 90 | 98 | PASS |
| ws-ping-pong | 100 | 92 | 90 | PASS |
| force-kill-handler | 100 | 88 | 96 | PASS |
| average | 95.8 | 90.3 | 95.7 | 6/6 pass |

## Full loss curve (generator swapped; judge constant @research)
| generator model | req cov | scen cov | validate | hallucinations |
|---|---|---|---|---|
| opus (@research) | 97.2 | 90.8 | 6/6 | ~0 |
| deepseek-v4-flash (@fast) | 95.8 | 90.3 | 6/6* | 3 (minor) |
| haiku-4.5 (@compact) | 88.0 | 81.2 | 3/6 | 3 (minor) |

CAVEAT/CONFOUND: @fast prompts added ONE explicit format directive ("use `#### Scenario:` headings, not bold, not a table") that @compact prompts lacked. Format gap (95.7 vs 62.2) PARTLY prompt not pure model — key mitigation finding: one-line format directive takes cheap model from 3/6 to 6/6 valid.

## Corrected takeaways
1. "fast" != "small/weak". deepseek-v4-flash nearly matches opus on semantic coverage (95.8 vs 97.2 req). Real capability floor shows on haiku-4.5 (88.0 req; hardest cross-cutting spec force-kill collapsed to 68).
2. Format compliance CHEAP to recover: explicit heading directive fixed it even on fast model (6/6 valid). Bake directive into generator prompt regardless of model.
3. Cheaper generators still hallucinate a little (jiti tsx-loader contradiction; force-kill WS-close ordering). Keep @research auditor + `openspec validate` gate + revise loop; catches both.
4. Practical config: @fast generator + format directive + validate gate + @research auditor/revise ~= opus quality at fraction of cost.
