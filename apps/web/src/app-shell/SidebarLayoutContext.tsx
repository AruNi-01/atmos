"use client";

import React from "react";
import { DEFAULT_LEFT_SIDEBAR_SIZE } from "@/app-shell/sidebar-layout-constants";

type ToggleFn = () => void;

type SidebarLayoutContextValue = {
  isLeftCollapsed: boolean;
  leftSidebarSize: number;
  liveLeftSidebarSize: number;
  isLeftSidebarDragging: boolean;
  requestedLeftSidebarSize: number | null;
  setIsLeftCollapsed: (collapsed: boolean) => void;
  setLeftSidebarSize: (size: number) => void;
  setLiveLeftSidebarSize: (size: number) => void;
  setIsLeftSidebarDragging: (dragging: boolean) => void;
  setRequestedLeftSidebarSize: (size: number | null) => void;
  setToggleLeftSidebar: (toggle: ToggleFn | null) => void;
  toggleLeftSidebar: ToggleFn;
  resizeLeftSidebar: (size: number) => void;
};

const SidebarLayoutContext = React.createContext<SidebarLayoutContextValue | null>(null);

export function SidebarLayoutProvider({ children }: { children: React.ReactNode }) {
  const [isLeftCollapsed, setIsLeftCollapsed] = React.useState(false);
  const [leftSidebarSize, setLeftSidebarSize] = React.useState(DEFAULT_LEFT_SIDEBAR_SIZE);
  const [liveLeftSidebarSize, setLiveLeftSidebarSize] = React.useState(DEFAULT_LEFT_SIDEBAR_SIZE);
  const [isLeftSidebarDragging, setIsLeftSidebarDragging] = React.useState(false);
  const [requestedLeftSidebarSize, setRequestedLeftSidebarSize] = React.useState<number | null>(null);
  const [toggleLeftSidebarImpl, setToggleLeftSidebar] = React.useState<ToggleFn | null>(null);
  const setLeftSidebarToggle = React.useCallback((toggle: ToggleFn | null) => {
    setToggleLeftSidebar(() => toggle);
  }, []);

  const value = React.useMemo(
    () => ({
      isLeftCollapsed,
      leftSidebarSize,
      liveLeftSidebarSize,
      isLeftSidebarDragging,
      requestedLeftSidebarSize,
      setIsLeftCollapsed,
      setLeftSidebarSize,
      setLiveLeftSidebarSize,
      setIsLeftSidebarDragging,
      setRequestedLeftSidebarSize,
      setToggleLeftSidebar: setLeftSidebarToggle,
      toggleLeftSidebar: () => toggleLeftSidebarImpl?.(),
      resizeLeftSidebar: (size: number) => setRequestedLeftSidebarSize(size),
    }),
    [
      isLeftCollapsed,
      leftSidebarSize,
      liveLeftSidebarSize,
      isLeftSidebarDragging,
      requestedLeftSidebarSize,
      setLeftSidebarToggle,
      toggleLeftSidebarImpl,
    ]
  );

  return (
    <SidebarLayoutContext.Provider value={value}>
      {children}
    </SidebarLayoutContext.Provider>
  );
}

export function useSidebarLayout() {
  const context = React.useContext(SidebarLayoutContext);
  if (!context) {
    throw new Error("useSidebarLayout must be used within SidebarLayoutProvider");
  }
  return context;
}
