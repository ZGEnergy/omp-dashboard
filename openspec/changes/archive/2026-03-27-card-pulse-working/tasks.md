## 1. CSS Animation

- [x] 1.1 Add `@keyframes card-working-pulse` to `src/client/index.css` — cycle between `transparent` and `rgba(234, 179, 8, 0.06)` over 3s ease-in-out infinite

## 2. Card Integration

- [x] 2.1 Add conditional animation class to the `<li>` element in `SessionCard.tsx` when `session.status === "streaming"` or `session.resuming === true`

## 3. Tests

- [x] 3.1 Add test: streaming session card has the pulse animation class
- [x] 3.2 Add test: resuming session card has the pulse animation class
- [x] 3.3 Add test: idle session card does not have the pulse animation class
- [x] 3.4 Add test: ended session card does not have the pulse animation class
