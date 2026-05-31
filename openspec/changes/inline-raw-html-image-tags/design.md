# Design — Inline raw HTML `<img>` tags

## Context

The bridge inliner is a pure function (`inlineMessageText`) that scans assistant message text and rewrites local-path image references. It currently handles one token shape:

```
![alt](src)
```

via a single regex. The client's markdown renderer has `rehypeRaw` enabled to support HTML-in-markdown, and the `img` component is overridden by `PiAssetImg` which resolves `pi-asset:<hash>` srcs against a per-session asset map.

The asymmetry the model can stumble into is:

```
<img src="/Users/x/foo.png" alt="screenshot">   ← bypasses inliner, renders broken
```

Both shapes terminate at the same client component. The inliner just needs a second detection pass.

## Decision 1 — Regex parsing, not a full HTML parser

The bridge already chose regex (`IMAGE_TOKEN_RE`) over a markdown AST for the existing token shape, and the same rationale applies here:

- Bridge is in-process inside the agent — startup cost matters, dependency surface matters.
- We only care about `src=` extraction; we don't validate HTML structure.
- The class of inputs is dominated by LLM output, which uses well-formed `<img>` tags overwhelmingly.

Tradeoff: pathological inputs (e.g. `<img src="a\"b" >`, deeply nested quoting, srcset, `<picture>` elements) are not handled. We accept these as out-of-scope — they degrade to the same broken-image behavior we have today, never worse.

## Decision 2 — Regex shape

```
/<img\b[^>]*?\bsrc\s*=\s*(?:"([^"\n]*)"|'([^'\n]*)')[^>]*?\/?>/gi
```

Properties:
- `\b` word boundaries so we don't match `<imgur>` or similar.
- Case-insensitive (`i` flag) — `<IMG>`, `<Img>`, `<img>` all match.
- `[^>]*?` (non-greedy) so we don't span past the closing `>`.
- Captures double-quoted OR single-quoted `src` values. Unquoted `src=foo.png` is NOT supported — uncommon in LLM output, ambiguous to parse.
- Forbids `\n` inside the quoted value — markdown HTML doesn't allow newlines mid-attribute and the regex stays anchored to a single line.
- `\/?>` accepts both self-closing `<img ... />` and unclosed `<img ...>`.

## Decision 3 — Rewrite-in-place strategy

For a matched `<img>` tag, the rewriter operates on the `src` attribute substring only:

```
input:   <img src="/Users/x/foo.png" alt="pic" width="64">
hash:    abc1234567890123
output:  <img src="pi-asset:abc1234567890123" alt="pic" width="64">
```

Implementation:
1. Compute the rewritten `src=` substring (`src="${quote}pi-asset:${hash}${quote}"`) using the same quote style as the original.
2. Slice-and-stitch the tag: `tag.slice(0, srcStart) + rewrittenSrc + tag.slice(srcEnd)`.

This preserves attribute order, attribute spelling/case, attribute quoting style, whitespace between attributes, and any boolean/empty attributes. The only mutation is the `src` value.

## Decision 4 — Failure modes replace the full tag

For markdown tokens, a read failure replaces the entire `![alt](src)` with placeholder text like `[image not found: /path]`. For HTML tags, the symmetric behavior is to replace the entire `<img ...>` tag with the same placeholder text:

```
input:   <img src="/nonexistent.png" alt="missing">
output:  [image not found: /nonexistent.png]
```

Rationale: the placeholder is informational text, not HTML. Leaving a partial `<img>` tag in the output (e.g. `<img src="[image not found: ...]">`) would be malformed and render unpredictably. Replacing the full tag is consistent with markdown-token behavior and produces clean text.

## Decision 5 — Single combined scan vs two passes

Two options for combining markdown-token and HTML-tag detection:

**A. Two independent passes (chosen)**:
```
text → scan markdown tokens → rewrite → scan HTML tags → rewrite → output
```
- Simpler — each pass operates on a single token shape with a focused regex.
- Per-pass output is well-defined and individually testable.
- Idempotency holds trivially: pass 1 rewrites markdown tokens to `![alt](pi-asset:hash)` which are not HTML tags; pass 2 only sees `<img>` tags. Re-applying both passes on the output yields no further changes.

**B. Single unified token list (rejected)**:
- Requires interleaving two regexes and tracking offsets simultaneously.
- More complex test surface; no benefit since the two token shapes never overlap.

Edge case considered: an `<img>` tag inside a fenced code block (` ```html\n<img src="...">\n``` `). Current inliner does NOT have code-block awareness — markdown tokens inside fenced code blocks are *also* rewritten today. This is a known existing limitation, out of scope for this change, and tracked separately if it becomes a real problem. The symmetry with markdown-token behavior is the safest precedent.

## Decision 6 — Shared dedup set

The per-session `alreadyEmitted: Set<string>` of hashes is threaded into both passes via the same `InlineOptions`. A file referenced first by `![]()` and later by `<img>` (or any other ordering) emits exactly one `asset_register`. Test: hash content is the source of truth; the token shape is irrelevant.

## Decision 7 — Out of scope

Deliberately not addressed in this change:

- `<picture>`, `<source>`, `srcset` attributes — multi-resolution image hints. Rare in LLM output; would require value-list parsing.
- HTML-in-HTML inside `<pre>`/`<code>` blocks — see Decision 5 edge case; matches existing markdown-token treatment.
- Unquoted `src=foo.png` — ambiguous tokenization (where does the attribute value end without quotes?). Accept as broken until a real case demands it.
- Mixed `<img>` tags inside markdown link wrappers (e.g. `[<img src="...">](href)`) — these still match because the `<img>` regex is independent of surrounding markdown link syntax. Verified mentally; covered by test.

## Open Questions

None blocking. The change is small and the precedent (markdown-token detection) covers all the design surface.
