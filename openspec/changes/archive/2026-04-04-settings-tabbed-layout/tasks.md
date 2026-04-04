## 1. Fixed Header + Tab Bar Structure

- [x] 1.1 Restructure SettingsPanel outer layout: move `overflow-y-auto` from root div to content area, add `shrink-0` to header and tab bar
- [x] 1.2 Add tab state (`useState<string>("general")`) and render tab bar below header with 4 tabs: General, Providers, Security, Advanced
- [x] 1.3 Style active tab with accent underline (blue-500, 2px bottom border) and brighter text; inactive tabs get muted text with hover

## 2. Tab Content Extraction

- [x] 2.1 Wrap General tab content: Server, Sessions, Tunnel, Developer sections (conditional on `activeTab === "general"`)
- [x] 2.2 Wrap Providers tab content: ProviderAuthSection + LLM Providers section (conditional on `activeTab === "providers"`)
- [x] 2.3 Wrap Security tab content: OAuth provider config, Allowed Users, Bypass URLs, Trusted Hosts (conditional on `activeTab === "security"`)
- [x] 2.4 Wrap Advanced tab content: Memory Limits section (conditional on `activeTab === "advanced"`)

## 3. Message Banner Placement

- [x] 3.1 Move save/error/warn message banner between tab bar and scrollable content so it's always visible

## 4. Testing

- [x] 4.1 Add test: header and tab bar remain outside scroll container
- [x] 4.2 Add test: clicking tabs switches visible content
- [x] 4.3 Add test: save works across tabs (modify fields on different tabs, save sends all changes)
- [x] 4.4 Verify existing settings tests still pass
