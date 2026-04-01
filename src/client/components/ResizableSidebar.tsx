import React, { useCallback, useRef, useEffect, type ReactNode } from "react";
import { Icon } from "@mdi/react";
import { mdiChevronLeft, mdiChevronRight } from "@mdi/js";
import type { SidebarState } from "../hooks/useSidebarState.js";

interface Props {
  sidebar: SidebarState;
  children: ReactNode;
}

const COLLAPSED_WIDTH = 28;
const DOUBLE_CLICK_MS = 300;

export function ResizableSidebar({ sidebar, children }: Props) {
  const { width, collapsed, setWidth, toggleCollapse } = sidebar;
  const dragging = useRef(false);
  const lastClick = useRef(0);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Drag-to-resize handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Double-click detection
      const now = Date.now();
      if (now - lastClick.current < DOUBLE_CLICK_MS) {
        toggleCollapse();
        lastClick.current = 0;
        return;
      }
      lastClick.current = now;

      if (collapsed) return;
      e.preventDefault();
      dragging.current = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [collapsed, toggleCollapse],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const newWidth = e.clientX;
      if (sidebarRef.current) {
        sidebarRef.current.style.width = `${Math.max(180, Math.min(500, newWidth))}px`;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setWidth(e.clientX);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [setWidth]);

  // Collapsed strip
  if (collapsed) {
    return (
      <div
        className="flex flex-col items-center border-r border-[var(--border-primary)] bg-[var(--bg-primary)] flex-shrink-0"
        style={{ width: COLLAPSED_WIDTH }}
      >
        <button
          onClick={toggleCollapse}
          className="mt-3 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          title="Expand sidebar"
          data-testid="sidebar-expand"
        >
          <Icon path={mdiChevronRight} size={0.7} />
        </button>
      </div>
    );
  }

  // Expanded sidebar with drag handle
  return (
    <div
      ref={sidebarRef}
      className="flex flex-shrink-0 relative"
      style={{ width }}
    >
      <div className="flex-1 overflow-hidden flex flex-col border-r border-[var(--border-primary)]">
        {children}
      </div>
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="w-1 cursor-col-resize hover:bg-blue-500/30 active:bg-blue-500/50 flex-shrink-0"
        data-testid="drag-handle"
      />
    </div>
  );
}
