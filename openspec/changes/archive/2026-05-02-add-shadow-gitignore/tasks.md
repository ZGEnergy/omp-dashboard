## 1. Update .gitignore

- [x] 1.1 Add `.shadow/` to `/.gitignore` near the existing local-working-directory entries (`node_modules/`, `dist/`).

## 2. Verify

- [x] 2.1 Run `git check-ignore -v .shadow/anything` and confirm the rule matches the new line.
- [x] 2.2 With a `.shadow/<name>/` workspace present (or a temporary `mkdir -p .shadow/test && touch .shadow/test/x`), run `git status` and confirm no `.shadow/...` paths appear.
- [x] 2.3 Run `git ls-files .shadow/` and confirm the output is empty (no previously-tracked files exist under `.shadow/`).
