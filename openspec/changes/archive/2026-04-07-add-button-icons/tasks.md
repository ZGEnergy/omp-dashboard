## 1. Dialog close and action buttons

- [x] 1.1 ExploreDialog: replace ✕ with `mdiClose` icon; add `mdiCompassOutline` to Explore button
- [x] 1.2 NewChangeDialog: replace ✕ with `mdiClose` icon; add `mdiSend` to Send button
- [x] 1.3 ConfirmDialog: add `mdiCheck` icon to confirm button
- [x] 1.4 FlowLaunchDialog: add `mdiPlay` icon to Run button
- [x] 1.5 TerminalView: replace ✕ with `mdiClose` icon

## 2. Session action buttons

- [x] 2.1 SessionCard: add `mdiPlayCircleOutline` to Resume button; add `mdiSourceFork` to Fork button
- [x] 2.2 SessionHeader: replace 📋 with `mdiPaperclip` on Attach button; replace × with `mdiLinkOff` on Detach; replace ▶ with `mdiPlay` on Flow button; replace 📄 with `mdiFileCompare` on Changed Files button
- [x] 2.3 SessionFlowActions: replace ▶ with `mdiPlay` on Run Flow button; replace + with `mdiPlus` on New Flow button

## 3. Flow control buttons

- [x] 3.1 FlowDashboard: add `mdiRobotOutline` to Auto toggle; add `mdiStop` to Abort button; add `mdiChevronUp` to collapse button
- [x] 3.2 FlowSummary: add `mdiCloseCircleOutline` to Dismiss button

## 4. Content view navigation buttons

- [x] 4.1 FileDiffView: replace ← with `mdiArrowLeft` on Back; replace ↻ with `mdiRefresh` on Refresh/Retry; add `mdiFileTreeOutline` to Files button
- [x] 4.2 MarkdownPreviewView: already uses `mdiArrowLeft` — no change needed
- [x] 4.3 ZrokInstallGuide: already uses `mdiArrowLeft` — no change needed

## 5. OpenSpec and diff panel buttons

- [x] 5.1 FolderOpenSpecSection: replace ▼/▶ with `mdiChevronDown`/`mdiChevronRight` on toggle; add `mdiArchiveOutline` to Archive button; add `mdiFileDocumentOutline` to Specs button
- [x] 5.2 DiffPanel: add `mdiCompare`/`mdiFileOutline` to Diff/File toggles; add `mdiViewSplitVertical`/`mdiViewSequential` to Split/Unified toggles

## 6. Remaining buttons

- [x] 6.1 CommandInput: replace × with `mdiClose` on remove-image button
- [x] 6.2 ProviderAuthSection: add `mdiArrowRight` to Continue button; add `mdiKeyPlus` to Add Key button
- [x] 6.3 SettingsPanel: add `mdiUpdate` to Check for Updates button
- [x] 6.4 SessionHeader detach (×): replace with `mdiLinkOff` icon (done in 2.2)

## 7. Extended emoji/symbol cleanup (added during implementation)

- [x] 7.1 SessionOpenSpecActions: add icons to all ActionButtons (Explore, Continue, FF, Apply, Verify, Archive, Detach, Bulk Archive, Attach, Change); replace 📋 badges with `mdiPaperclip`
- [x] 7.2 SessionList: replace 📌+ emoji with `mdiPin` + `mdiPlus` icons
- [x] 7.3 ThinkingLevelSelector: replace 💭 emoji with `mdiHeadLightbulb`
- [x] 7.4 SessionHeader: replace 💭 emoji with `mdiHeadLightbulb`; replace 📋 in mobile attach menu with `mdiPaperclip`
- [x] 7.5 OpenSpecActivityBadge: replace 📋 emoji with `mdiClipboardTextOutline`
- [x] 7.6 FlowActivityBadge: replace 🔄✓⚠■ with MDI icons (mdiLoading, mdiCheckCircle, mdiAlertCircle, mdiStopCircle)
- [x] 7.7 FlowAgentCard: replace ○⠋✓✗⚠ with MDI icons; replace ↻ with `mdiRefresh`
- [x] 7.8 FlowAgentDetail: replace ✓✗⚠●○ with MDI icons
- [x] 7.9 FlowSummary: replace ✓⚠■✗○ with MDI icons for flow and agent status
- [x] 7.10 ModelSelector: replace ⏳ with `mdiLoading` spinning icon
