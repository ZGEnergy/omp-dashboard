import React, { createContext, useContext, type ReactNode } from "react";
import { useMediaQuery } from "./useMediaQuery.js";

const MobileContext = createContext(false);

/**
 * Provides isMobile boolean (viewport < 768px) to the component tree.
 */
export function MobileProvider({ children }: { children: ReactNode }) {
  const isMobile = useMediaQuery("(max-width: 767px)");
  return (
    <MobileContext.Provider value={isMobile}>
      {children}
    </MobileContext.Provider>
  );
}

/**
 * Returns true when viewport is less than 768px.
 */
export function useMobile(): boolean {
  return useContext(MobileContext);
}
