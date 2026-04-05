# agent-browser Commands Cheatsheet

Quick reference for the `browser` tool (powered by `agent-browser` CLI).

## Navigation

| Command | Description |
|---------|-------------|
| `open <url>` | Navigate to URL |
| `reload` | Reload current page |
| `back` | Go back |
| `forward` | Go forward |

## Inspection

| Command | Description |
|---------|-------------|
| `snapshot -i` | List interactive elements with `@ref` handles |
| `screenshot` | Capture viewport (returned inline as image) |
| `screenshot --full` | Capture full scrollable page |
| `screenshot --annotate` | Capture with numbered element labels |
| `get text` | Get full page text |
| `get text @eN` | Get text of specific element |
| `get title` | Get page title |
| `get url` | Get current URL |

## Interaction

| Command | Description |
|---------|-------------|
| `click @eN` | Click element by ref |
| `fill @eN "text"` | Clear field and type text |
| `type @eN "text"` | Type text without clearing |
| `press Enter` | Press a keyboard key |
| `select @eN "value"` | Select dropdown option |
| `scroll down [px]` | Scroll down (default or by pixels) |
| `scroll up [px]` | Scroll up |
| `hover @eN` | Hover over element |

## Browser Settings

| Command | Description |
|---------|-------------|
| `set viewport <w> <h>` | Set viewport size (e.g., `375 667`) |
| `set media dark` | Switch to dark color scheme |
| `set media light` | Switch to light color scheme |

## Debugging

| Command | Description |
|---------|-------------|
| `console` | Show console output (errors, warnings, logs) |
| `network` | Show network requests |
| `eval '<js>'` | Run JavaScript in page context |

## Waiting

| Command | Description |
|---------|-------------|
| `wait --load networkidle` | Wait for network to settle (essential for SPAs) |
| `wait @eN` | Wait for specific element to appear |
| `wait 2000` | Wait N milliseconds |

## Session

| Command | Description |
|---------|-------------|
| `close` | Close browser session |
