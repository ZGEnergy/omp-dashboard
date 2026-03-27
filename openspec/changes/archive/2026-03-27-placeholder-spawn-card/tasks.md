## 1. PlaceholderSessionCard Component

- [x] 1.1 Create `PlaceholderSessionCard.tsx` with skeleton card matching SessionCard dimensions and Tailwind `animate-pulse` loading bars
- [x] 1.2 Write tests for `PlaceholderSessionCard` rendering (pulse animation class present, correct structure)

## 2. Spawning State in App.tsx

- [x] 2.1 Add `spawningCwds: Set<string>` state to `App.tsx`
- [x] 2.2 Set cwd into `spawningCwds` when `handleSpawnSession` is called
- [x] 2.3 Remove cwd from `spawningCwds` on `session_added` with matching cwd
- [x] 2.4 Remove cwd from `spawningCwds` on `spawn_result` with `success: false`
- [x] 2.5 Add 30-second safety timeout to auto-remove cwd from `spawningCwds`
- [x] 2.6 Pass `spawningCwds` prop down to `SessionList`

## 3. SessionList Integration

- [x] 3.1 Accept `spawningCwds` prop in `SessionList` component
- [x] 3.2 Render `PlaceholderSessionCard` at top of group when group's cwd is in `spawningCwds`
- [x] 3.3 Disable "New" button for groups whose cwd is in `spawningCwds`
- [x] 3.4 Write tests for placeholder rendering in group and New button disabled state
