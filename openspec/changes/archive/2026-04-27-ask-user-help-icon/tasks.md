## Tasks

- [x] Import `mdiHelpCircleOutline` in `ToolCallStep.tsx`.
- [x] Branch the icon + color: `isAskUser && status !== "error" && status !== "running"` → `mdiHelpCircleOutline` + `text-sky-400`. Other tools and other ask_user states keep the existing icon/color.
- [x] `npm run build` and restart server.
- [x] Live verify: ask_user resolved row shows sky-blue `?`; running shows yellow spinner; error shows red alert.
