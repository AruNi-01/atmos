"use client";

import React from "react";
import { TerminalManagerView } from "./TerminalManagerView";

export const TerminalsView: React.FC = () => {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-hidden">
        <TerminalManagerView />
      </div>
    </div>
  );
};
