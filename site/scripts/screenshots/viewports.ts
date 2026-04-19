/**
 * Viewport definitions for the screenshot pipeline.
 *
 * Keep these in sync with site/src/content/features.ts — screenshots are
 * referenced by filename + folder, and the folder name is the viewport id.
 */

export interface Viewport {
  id: "desktop" | "mobile";
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile?: boolean;
  hasTouch?: boolean;
}

export const DESKTOP: Viewport = {
  id: "desktop",
  width: 1440,
  height: 900,
  deviceScaleFactor: 2,
};

export const MOBILE: Viewport = {
  id: "mobile",
  width: 390,
  height: 844,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

export const ALL_VIEWPORTS: Viewport[] = [DESKTOP, MOBILE];
