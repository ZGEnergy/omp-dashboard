## 1. Fuzzy Search Component (reusable, no dependencies)

- [x] 1.1 Add `fuse.js` dependency to package.json
- [x] 1.2 Create `MarkdownSearch` component: search input with match counter (N/M) and prev/next (▲/▼) buttons; accepts a ref to the markdown content container
- [x] 1.3 Implement fuse.js indexing: extract text paragraphs from container, build index on content change
- [x] 1.4 Implement highlight logic: wrap matching text in `<mark>` elements via DOM manipulation, clear on search change
- [x] 1.5 Implement prev/next navigation: scroll highlighted match into view, update current match index, wrap around at boundaries
- [x] 1.6 Add `searchable` prop to `MarkdownPreviewView` that renders `MarkdownSearch` in the header row
- [x] 1.7 Write tests for `MarkdownSearch` (fuzzy matching, highlight count, navigation wrap-around, clear on empty input)

## 2. Specs Browser View

- [x] 2.1 Create `useMainSpecsReader(cwd)` hook: fetch `openspec/specs/` directory listing, fetch all `{specName}/spec.md` in parallel, concatenate with `# {specName}` headings and `id="spec-{specName}"` anchors, return `{ specNames, content, isLoading, error }`
- [x] 2.2 Create `SpecsBrowserView` component: back button, title "Main Specs", combobox of spec names, scrollable markdown content area using `MarkdownPreviewView` with `searchable={true}`
- [x] 2.3 Implement combobox jump-to: on select, call `document.getElementById('spec-{name}')?.scrollIntoView({ behavior: 'smooth' })`
- [x] 2.4 Write tests for `useMainSpecsReader` (sorted names, concatenated content, error handling, loading state)
- [x] 2.5 Write tests for `SpecsBrowserView` (combobox rendering, scroll-to behavior)

## 3. Move Bulk Archive to Session Level

- [x] 3.1 Add `onBulkArchive` prop and `changes` array awareness to `SessionOpenSpecActions`; render "Bulk Archive" button with confirmation dialog when `changes.some(c => c.status === "complete")`; show in both attached and unattached states; disable when streaming
- [x] 3.2 Remove Bulk Archive button and confirmation dialog from `FolderOpenSpecSection`
- [x] 3.3 Thread `onBulkArchive` callback through `SessionList` to each session card (passing folder cwd)
- [x] 3.4 Update `FolderOpenSpecSection` tests: remove bulk archive assertions
- [x] 3.5 Write tests for `SessionOpenSpecActions` bulk archive: shown when completed, hidden when none, confirmation dialog, disabled when streaming

## 4. Specs Button on Folder Header

- [x] 4.1 Add `onOpenSpecs` prop to `FolderOpenSpecSection`; render "Specs" button on the right side of the header row with `stopPropagation`
- [x] 4.2 Wire `onOpenSpecs(cwd)` through `SessionList` and `App.tsx` to open `SpecsBrowserView` in the content area (same slot as `MarkdownPreviewView`)
- [x] 4.3 Write test for `FolderOpenSpecSection` Specs button rendering and click behavior
