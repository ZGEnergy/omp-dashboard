## Context

The client renders severity across **four** surfaces, plus a shared protocol type:

| Surface | File | Vocabulary | Color source |
|---|---|---|---|
| Session-status (cards/rails/dots) | `session-status-visuals.ts` | needs-you/working/idle/error/notice | semantic `--status-*` (clean) |
| `useToast` / `Toast` | `Toast.tsx` | error/success/info (default **error**) | raw `red-900` / `green-900` / gray |
| `SpawnErrorToastHost` | `SpawnErrorToastHost.tsx` | (always red) | hardcoded `bg-red-900/90` |
| `SpawnErrorBanner` + `TimeoutBanner` | `SpawnErrorBanner.tsx` | error / timeout | raw `red-500` / `amber-500` |
| Plugin toast `ToastSlot` | `extension-ui/ToastSlot.tsx` | `info/success/warn/error` (**protocol**) | raw `red-500` / `amber-500` / … |

`ToastVariant` is **defined twice** (`Toast.tsx:4`, `useAsyncAction.ts:5`) and a **third** inline union lives at `useMessageHandler.ts:153`. The protocol type `ToastPayload.level` (`shared/types.ts:439`) uses `warn`, not `warning`.

Root defect (verified): `showToast(text, variant = "error")` — the default is red, so any unmarked toast reads as an error. Live at `SessionList.tsx:304` (spawn success), `App.tsx:1963` (commit success).

## Goals

- One **color** source of truth (`--severity-*`) for every surface.
- An unmarked toast is never mistaken for an error — **without** silently downgrading real errors.
- Add the missing `warning` tier; preserve the muted translucent box look.

## Decisions

### D1 — Five-tier severity, one token set
`error · warning · success · info · neutral`. Each maps to a `--severity-*` **triple** (D4).

### D2 — Warning = orange, not yellow  *(user decision)*
Yellow (`#eab308`) is `--status-working`; reusing it overloads "busy" vs "caution". Orange (`--accent-orange #f97316`, already in `index.css`) keeps them distinct. No new base accent.

### D3 — Default = neutral, gated on an error-call-site sweep  *(user decision + corrected)*
Flip the default `error` → `neutral`. **The prior draft's audit claim was false** — three error call sites pass no variant and rely on the red default:
- `App.tsx:635` — `notifyError: (msg) => showToast(msg)` (the app-wide error channel; `notifyError` *is* raw `showToast`, not a wrapper that adds `"error"`).
- `SessionList.tsx:292` — open-editor failure.
- `SessionList.tsx:304` — the **failure** branch of the spawn ternary.

Therefore the flip is **co-requisite** with tagging these three `"error"`. Order matters: tag the error sites *first* (or in the same commit), never flip the default alone.

**`SessionList.tsx:304` needs a structural split, not a trailing arg.** It is one ternary expression — `showToast(success ? okMsg : failMsg)`. Appending `, "error"` would tag *both* branches, re-reddening the success path. It MUST become `if (spawnResult.success) showToast(msg, "success"); else showToast(failMsg, "error");`.

Verification: after the change, `rg 'showToast\(' packages/client/src` shows every error path passing an explicit `"error"`; no bare error call remains.

### D4 — Severity tokens are triples, theme-robust by mixing toward theme tokens  *(new — closes the reviewer gap; corrected in cycle 2)*
A single flat `--accent-red` cannot reproduce the current `bg-red-900/90 text-red-200 border-red-800` muted-translucent box; `bg-[var(--severity-error)]` would render a saturated solid box (a contrast/usability regression). So each severity is a **triple**. Crucially, the `fg` mixes toward **`--text-primary`** (which flips per theme: `#e5e5e5` dark / `#1a1a1a` light) and the `bg` mixes into **`--bg-tertiary`** (the actual card token: `#1e1e1e` dark / `#f0f0f0` light) — NOT a nonexistent `--bg-card`, and NOT a hardcoded `white`. Mixing toward theme tokens makes one formula pass AA in **both** themes (light gets dark text on a pale box; dark gets light text on a deep box):

```css
--severity-error-bg:     color-mix(in srgb, var(--accent-red) 16%, var(--bg-tertiary));
--severity-error-fg:     color-mix(in srgb, var(--accent-red) 70%, var(--text-primary));
--severity-error-border: color-mix(in srgb, var(--accent-red) 40%, transparent);
/* …warning (orange), success (green), info (blue), neutral (--text-muted) analogously */
```

Authored in `index.css` (NOT via `applyThemeVars`/`CSS_VAR_KEYS`) — they resolve against the inline `--accent-*` / `--bg-tertiary` / `--text-primary` a named theme sets at computed-value time, so no per-theme `--severity-*` entry is needed (verified: accents + bg-tertiary + text-primary are all in `CSS_VAR_KEYS`). The base accent stays the single knob; the triple is derived. `VARIANT_CLASSES` references it via arbitrary-value classes (`bg-[var(--severity-error-bg)] text-[var(--severity-error-fg)] border-[var(--severity-error-border)]`). Exact percentages are tuned against WCAG in implementation (D6).

**Exception — `neutral` is NOT color-mix-derived.** The `neutral` tier is the *absence* of severity, so it reuses the existing subdued UI tokens **literally**: `bg = --bg-tertiary`, `fg = --text-secondary`, `border = --border-primary` (today's `info` look, a proven ~7.7:1). Deriving `neutral` from `--text-muted` via the same mix was measured to **fail AA** (~4.2:1 dark, ~3.7:1 light) — rejected. The four accent tiers (error/warning/success/info) derive via color-mix; `neutral` maps to base semantic tokens. This split is deliberate, not an oversight.

**Close-button shade.** Each variant's close (×) button reuses its `-fg` at reduced opacity (`text-[var(--severity-<level>-fg)]/70 hover:…/100`) — one derivation, no separate `-close` token.

### D5 — `info` (blue) vs `neutral` (styleless); own token, not `--status-notice`  *(new; refined cycle 2)*
`--status-notice` is a **protocol signal** ("model returned reasoning only"). Reusing it for generic info toasts overloads it. Introduce `--severity-info` from `--accent-blue` independently (the two may share the accent but stay separate tokens).

The current `info` variant is deliberately *neutral* (`--bg-tertiary`/`--text-secondary`, no accent). That styleless role now belongs to the new **`neutral`** tier (which inherits exactly those literal tokens — see D4 exception). So: `neutral` = the old subdued look (and the new default); `info` = blue mild-attention. There is exactly **one** production `showToast(…, "info")` call site — the still-working background hint in `useAsyncAction.ts` ("Still working in the background…"). **Decided: reclass to `neutral`** — it is a passive background hint, not mild-attention. (Not a multi-site "seek-hint" audit — the earlier draft over-counted.)

Note the two "info" meanings the rename splits: `Toast.tsx`'s old `info` is *muted/neutral*, while the plugin `ToastSlot`'s `info` default is already *blue*. Post-change: client old-`info` → `neutral`; `ToastSlot` `info`/default → `--severity-info` (blue, matching its current look). No silent divergence.

### D5b — CSS var name is `warning`; ToastSlot maps the protocol `warn`  *(new cycle 2)*
The client vocabulary and tokens use `warning`; the protocol `ToastPayload.level` uses `warn` (non-goal to rename — D8). `ToastSlot.levelClass` maps **all four** branches onto `--severity-*`: `success→success`, `error→error`, `warn→--severity-warning-*` (the name bridge), `default(info)→--severity-info`. Without the `warn` bridge, a protocol `warn` toast would address a nonexistent `--severity-warn-*`. The bridge lives only in `ToastSlot`.

### D6 — Contrast is a gate, verified across all 9 themes × light+dark  *(strengthened; scoped in scenario-design)*
Verify AA on the *derived* triples, not just the raw accents, across **all 9 named themes** (base, dracula, nord, github, catppuccin, tokyo-night, rose-pine, solarized, gruvbox) in **both** light and dark modes — **18 combos**: body text (`-fg` on `-bg`) ≥ 4.5:1; border/large ≥ 3:1. Orange-on-light and blue-on-dark are the tight cases. If a mix fails in any combo, adjust the percentage — the token indirection localizes the fix. `neutral` (literal tokens) is included in the sweep.

### D7 — Type de-duplication  *(new)*
Collapse the two `ToastVariant` definitions to one canonical export (keep `Toast.tsx`'s; `useAsyncAction.ts` re-exports it) and replace the inline union at `useMessageHandler.ts:153` with `ToastVariant`. Otherwise adding `warning`/`neutral` type-errors the consumers importing the stale definition.

### D8 — Protocol boundary is a hard non-goal  *(new)*
`ToastPayload.level` keeps `warn` (renaming is a protocol/`shared` change, explicitly out of scope). `ToastSlot.tsx` maps its existing `level` names onto the shared `--severity-*` **colors** only. So "unified" = one color layer; the variant *string* vocabulary stays per-surface where a protocol boundary exists.

## Risks / Trade-offs

- **Silent error downgrade** — the exact bug the prior draft mis-claimed as handled. Mitigated by D3's mandatory error-site tagging + the post-change grep gate.
- **Triple mix tuning** — color-mix percentages need a11y iteration (D6); localized to `index.css`.
- **Vocabulary asymmetry** — client toasts use `neutral`, protocol uses `warn`; accepted as the cost of the no-protocol-change non-goal (D8).
- **Host overlap** — three top-right containers remain; out of scope, noted as follow-up.

## Migration order

1. Add `--severity-*` triple tokens (additive, no behavior change).
2. De-dup `ToastVariant` (D7).
3. Extend `ToastVariant` + `VARIANT_CLASSES` with `warning`/`neutral`; point `info` at `--severity-info`.
4. **Tag error call sites** (D3) — *before* step 5.
5. Flip default → `neutral`.
6. Tag success call sites (`"success"`).
7. Swap raw literals in `SpawnErrorToastHost`, `SpawnErrorBanner`, `ToastSlot` for tokens.
8. Update `Toast.test.tsx` assertions.
