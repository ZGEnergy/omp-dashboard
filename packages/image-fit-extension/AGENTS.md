# DOX — packages/image-fit-extension

Files in this directory. One row per source file.

| File | Purpose |
|------|---------|
| `README.md` | Package overview. pi extension resizes oversize images at Read-time to fit model byte + pixel ceilings. Hooks `pi.on("tool_call")`; on built-in `read` of image (`.png`/`.jpg`/`.jpeg`/`.webp`/`.gif`) probes dims via jimp. Fits both → leaves `event.input.path` untouched. Else re-encodes (long-edge scaled) to `os.tmpdir()/pi-image-fit/<session>/<sha256>.<ext>`, mutates `event.input.path`. No native deps (jimp only). |
| `vitest.config.ts` | Package vitest config (registered in root `vitest.config.ts` `test.projects`). See change: pi-image-fit-extension. |
