"use client";

import React from "react";

type ToggleFn = () => void;

type SidebarLayoutContextValue = {
  isLeftCollapsed: boolean;
  isRightCollapsed: boolean;
  showRightSidebar: boolean;
  setIsLeftCollapsed: (collapsed: boolean) => void;
  setIsRightCollapsed: (collapsed: boolean) => void;
  setShowRightSidebar: (show: boolean) => void;
  setToggleLeftSidebar: (toggle: ToggleFn | null) => void;
  setToggleRightSidebar: (toggle: ToggleFn | null) => void;
  toggleLeftSidebar: ToggleFn;
  toggleRightSidebar: ToggleFn;
};

const SidebarLayoutContext = React.createContext<SidebarLayoutContextValue | null>(null);

export function SidebarLayoutProvider({ children }: { children: React.ReactNode }) {
  const [isLeftCollapsed, setIsLeftCollapsed] = React.useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = React.useState(false);
  const [showRightSidebar, setShowRightSidebar] = React.useState(false);
  const [toggleLeftSidebarImpl, setToggleLeftSidebar] = React.useState<ToggleFn | null>(null);
  const [toggleRightSidebarImpl, setToggleRightSidebar] = React.useState<ToggleFn | null>(null);
  const setLeftSidebarToggle = React.useCallback((toggle: ToggleFn | null) => {
    setToggleLeftSidebar(() => toggle);
  }, []);
  const setRightSidebarToggle = React.useCallback((toggle: ToggleFn | null) => {
    setToggleRightSidebar(() => toggle);
  }, []);

  const value = React.useMemo(
    () => ({
      isLeftCollapsed,
      isRightCollapsed,
      showRightSidebar,
      setIsLeftCollapsed,
      setIsRightCollapsed,
      setShowRightSidebar,
      setToggleLeftSidebar: setLeftSidebarToggle,
      setToggleRightSidebar: setRightSidebarToggle,
      toggleLeftSidebar: () => toggleLeftSidebarImpl?.(),
      toggleRightSidebar: () => toggleRightSidebarImpl?.(),
    }),
    [
      isLeftCollapsed,
      isRightCollapsed,
      showRightSidebar,
      setLeftSidebarToggle,
      setRightSidebarToggle,
      toggleLeftSidebarImpl,
      toggleRightSidebarImpl,
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
