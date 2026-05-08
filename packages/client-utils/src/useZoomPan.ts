import { useRef, useCallback, useState } from "react";

export interface ZoomPanState {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface UseZoomPanOptions {
  minScale?: number;
  maxScale?: number;
  zoomStep?: number;
}

const DEFAULT_MIN = 0.5;
const DEFAULT_MAX = 4;
const DEFAULT_STEP = 1.2;
const WHEEL_SENSITIVITY = 0.002;

export function useZoomPan(options?: UseZoomPanOptions) {
  const minScale = options?.minScale ?? DEFAULT_MIN;
  const maxScale = options?.maxScale ?? DEFAULT_MAX;
  const zoomStep = options?.zoomStep ?? DEFAULT_STEP;

  const [state, setState] = useState<ZoomPanState>({ scale: 1, translateX: 0, translateY: 0 });

  // Refs for drag tracking (avoid re-renders during drag)
  const dragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });
  // Pinch tracking
  const pinchDist = useRef<number | null>(null);
  const pinchMid = useRef({ x: 0, y: 0 });

  const clampScale = useCallback(
    (s: number) => Math.min(maxScale, Math.max(minScale, s)),
    [minScale, maxScale],
  );

  /**
   * Zoom centered on a point (in container-local coords).
   */
  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number) => {
      setState((prev) => {
        const newScale = clampScale(prev.scale * factor);
        if (newScale === prev.scale) return prev;
        const ratio = newScale / prev.scale;
        return {
          scale: newScale,
          translateX: cx - ratio * (cx - prev.translateX),
          translateY: cy - ratio * (cy - prev.translateY),
        };
      });
    },
    [clampScale],
  );

  // ── Wheel handler ──────────────────────────────────────────────────
  const onWheel = useCallback(
    (e: React.WheelEvent | WheelEvent) => {
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * WHEEL_SENSITIVITY);
      zoomAt(cx, cy, factor);
    },
    [zoomAt],
  );

  // ── Pointer (drag) handlers ────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent | PointerEvent) => {
    // Only primary button
    if (e.button !== 0) return;
    dragging.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent | PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setState((prev) => ({
      ...prev,
      translateX: prev.translateX + dx,
      translateY: prev.translateY + dy,
    }));
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  // ── Touch (pinch) handler ──────────────────────────────────────────
  const onTouchMove = useCallback(
    (e: React.TouchEvent | TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const mx = (t0.clientX + t1.clientX) / 2 - rect.left;
      const my = (t0.clientY + t1.clientY) / 2 - rect.top;

      if (pinchDist.current != null) {
        const factor = dist / pinchDist.current;
        zoomAt(mx, my, factor);
      }
      pinchDist.current = dist;
      pinchMid.current = { x: mx, y: my };
    },
    [zoomAt],
  );

  const onTouchEnd = useCallback(() => {
    pinchDist.current = null;
  }, []);

  // ── Double-click reset ─────────────────────────────────────────────
  const onDoubleClick = useCallback(() => {
    setState({ scale: 1, translateX: 0, translateY: 0 });
  }, []);

  // ── Button controls ────────────────────────────────────────────────
  const zoomIn = useCallback(() => {
    setState((prev) => {
      const newScale = clampScale(prev.scale * zoomStep);
      return { ...prev, scale: newScale };
    });
  }, [clampScale, zoomStep]);

  const zoomOut = useCallback(() => {
    setState((prev) => {
      const newScale = clampScale(prev.scale / zoomStep);
      return { ...prev, scale: newScale };
    });
  }, [clampScale, zoomStep]);

  const reset = useCallback(() => {
    setState({ scale: 1, translateX: 0, translateY: 0 });
  }, []);

  const handlers = {
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onTouchMove,
    onTouchEnd,
    onDoubleClick,
  };

  return { state, handlers, zoomIn, zoomOut, reset };
}
