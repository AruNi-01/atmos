"use client";

import React from 'react';
import { Preview } from './Preview';
import { RunScript } from './RunScript';

interface RunPreviewPanelProps {
  workspaceId: string | null;
}

export const RunPreviewPanel: React.FC<RunPreviewPanelProps> = ({ workspaceId }) => {
  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Top: Preview (2/3) */}
      <div className="flex-[2] min-h-0 overflow-hidden border-b border-border relative">
        <Preview />
      </div>

      {/* Bottom: Run Script (1/3) */}
      <div className="flex-[1] min-h-0 overflow-hidden relative shadow-[0_-1px_10px_rgba(0,0,0,0.1)] z-10">
        <RunScript workspaceId={workspaceId} />
      </div>
    </div>
  );
};
