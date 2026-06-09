# Specs: Fix URL routing in OpenSpec preview overlay

## Spec 1: Tab selection navigates to new URL

**When:** User clicks a tab letter (P/D/S/T) in the OpenSpec preview overlay.

**Then:** 
1. Local state updates (`reader.setActiveTab(tabId)`)
2. URL changes to `/folder/:encodedCwd/openspec/:changeName/:newArtifactId`
3. Browser history entry is pushed (not replaced)

**Test:**
1. Open preview at `/folder/cwd/openspec/my-change/proposal`
2. Click the "D" (Design) tab
3. Verify URL changes to `/folder/cwd/openspec/my-change/design`
4. Refresh page — Design artifact loads (not Proposal)
5. Copy URL and share — recipient sees Design artifact

**Implementation:** In `OpenSpecPreview` component, `onTabChange` callback:
```typescript
onTabChange={(tabId) => {
  reader.setActiveTab(tabId);
  navigate(buildOpenSpecPreviewUrl(cwd, changeName, tabId));
}}
```

---

## Spec 2: Artifact state re-syncs on re-entry

**When:** User navigates away from the preview overlay and back via browser back/forward.

**Then:**
- `useOpenSpecReader` hook re-initializes with the URL param
- Active tab reflects the URL param (not stale state from previous visit)
- Artifact content is fresh

**Test:**
1. Open preview at `/folder/cwd/openspec/my-change/design`
2. Click back button → leaves overlay
3. Click forward button → re-enters overlay
4. Verify Design tab is active and content is fresh (not stale from previous state)

**Implementation:** In `useOpenSpecReader` hook, add dependency:
```typescript
useEffect(() => {
  setActiveTab(initialArtifact);
}, [initialArtifact]);
```

---

## Files to change

- `packages/client/src/App.tsx` (OpenSpecPreview onTabChange callback)
- `packages/client/src/hooks/useOpenSpecReader.ts` (useEffect dependency)
