/**
 * System tray integration.
 * Minimizes to tray on window close, with Show/Quit context menu.
 */
import { app, Tray, Menu, nativeImage, type BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;

/** Resolve path to a resource file (works in both dev and packaged modes). */
function resourcePath(filename: string): string {
  // In packaged app, resources are in app.asar's parent directory.
  // In dev, they're relative to src/lib/ → ../../resources/
  if (app.isPackaged) {
    return path.join(process.resourcesPath, filename);
  }
  return path.join(__dirname, "..", "..", "resources", filename);
}

/**
 * Create the system tray icon with context menu.
 * The `onQuit` callback is invoked when the user explicitly quits.
 */
export function createTray(
  getWindow: () => BrowserWindow | null,
  onQuit: () => void,
): Tray {
  // macOS: use template images that auto-adapt to dark/light menu bar.
  // Windows/Linux: use the full app icon.
  let icon: Electron.NativeImage;
  if (process.platform === "darwin") {
    icon = nativeImage.createFromPath(resourcePath("trayTemplate.png"));
    icon.setTemplateImage(true);
  } else if (process.platform === "win32") {
    icon = nativeImage.createFromPath(resourcePath("icon.ico"));
  } else {
    icon = nativeImage.createFromPath(resourcePath("icon.png"));
  }
  tray = new Tray(icon);
  tray.setToolTip("PI Dashboard");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show",
      click: () => {
        const win = getWindow();
        if (win) {
          win.show();
          win.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: onQuit,
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    const win = getWindow();
    if (win) {
      win.show();
      win.focus();
    }
  });

  return tray;
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
