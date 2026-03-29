## 1. CSS Animation

- [x] 1.1 Add `card-input-pulse` keyframe animation in `src/client/index.css` (purple tint, alongside existing `card-working-pulse`)

## 2. Card Pulse Logic

- [x] 2.1 Extract `getCardPulseClass(session)` helper in `SessionCard.tsx` that returns `card-input-pulse` when `currentTool === "ask_user"`, `card-working-pulse` when streaming/resuming, or empty string otherwise
- [x] 2.2 Replace inline pulse class logic in both mobile and desktop card `<li>` elements with the helper

## 3. Activity Indicator

- [x] 3.1 Update `ActivityIndicator` to show "Waiting for input" in purple when `currentTool === "ask_user"` instead of the generic tool display

## 4. Tests

- [x] 4.1 Add test: card applies `card-input-pulse` when `currentTool` is `"ask_user"`
- [x] 4.2 Add test: card applies `card-working-pulse` when streaming with a non-ask_user tool
- [x] 4.3 Add test: `ActivityIndicator` renders "Waiting for input" when `currentTool` is `"ask_user"`
