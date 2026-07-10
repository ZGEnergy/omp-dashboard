#!/usr/bin/env bash
#
# grep-tui-surface.sh — augment-mode prelude.
#
# Emits a deterministic JSON list of TUI/extension-UI/banned callsites in the
# current working directory. Re-running on the same source tree produces
# identical output.
#
# Output:
#   { "callsites": [ { file, line, callsite, category }, ... ] }
#
# Categories:
#   tui-prompt    — ctx.ui.{select,input,confirm,editor,multiselect}
#   tui-custom    — ctx.ui.custom
#   tool-register — pi.registerTool
#   extension-ui  — registerExtensionUI / pi.events.emit("ui:list-modules"
#   banned        — ctx.fork / pi.newSession / ctx.switchSession
#                    (session-replacement; banned in dashboard sessions)

set -eu

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required" >&2
  exit 2
fi

exec python3 - <<'PY'
import json, os, re, sys

PATTERNS = [
    ("tui-prompt",    re.compile(r"ctx\.ui\.(?:select|input|confirm|editor|multiselect)\b")),
    ("tui-custom",    re.compile(r"ctx\.ui\.custom\b")),
    ("tool-register", re.compile(r"pi\.registerTool\b")),
    ("extension-ui",  re.compile(r"registerExtensionUI\b|pi\.events\.emit\(\"ui:list-modules\"")),
    ("banned",        re.compile(r"ctx\.fork\(|pi\.newSession\(|ctx\.switchSession\(")),
]

EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".cts", ".mts"}
SKIP_DIRS = {"node_modules", "dist", ".git", "build", "out", "coverage", ".next", ".turbo", ".omp"}

def walk(root):
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for name in sorted(filenames):
            ext = os.path.splitext(name)[1]
            if ext in EXTENSIONS:
                yield os.path.relpath(os.path.join(dirpath, name), root)

callsites = []
root = os.getcwd()
for rel in walk(root):
    abs_path = os.path.join(root, rel)
    try:
        with open(abs_path, "r", encoding="utf-8", errors="replace") as fh:
            for lineno, line in enumerate(fh, start=1):
                for category, regex in PATTERNS:
                    if regex.search(line):
                        callsites.append({
                            "file": rel,
                            "line": lineno,
                            "callsite": line.rstrip("\n"),
                            "category": category,
                        })
                        # Multiple categories per line possible; keep going.
    except OSError:
        continue

# Deterministic order: by file, then line, then category.
callsites.sort(key=lambda c: (c["file"], c["line"], c["category"]))

sys.stdout.write(json.dumps({"callsites": callsites}, separators=(",", ":")) + "\n")
PY
