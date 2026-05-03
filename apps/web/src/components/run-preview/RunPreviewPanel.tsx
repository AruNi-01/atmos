"use client";

import React, { useCallback, useRef, useState } from 'react';
import { useQueryState } from "nuqs";
import { Preview } from './Preview';
import { RunScript } from './RunScript';
import { Panel, PanelGroup, PanelResizeHandle, ImperativePanelHandle } from "@workspace/ui";
import { useAppStorage } from "@atmos/shared";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { previewUrlParams } from "@/lib/nuqs/searchParams";

interface RunPreviewPanelProps {
  workspaceId: string | null;
  projectId?: string;
  isActive?: boolean;
  projectName?: string;
  workspaceName?: string;
}

export const RunPreviewPanel: React.FC<RunPreviewPanelProps> = ({ workspaceId, projectId, isActive = false, projectName, workspaceName }) => {

  const storage = useAppStorage();
  const runScriptPanelRef = useRef<ImperativePanelHandle>(null);
  const [isRunScriptCollapsed, setIsRunScriptCollapsed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [committedPreviewUrl, setCommittedPreviewUrl] = useQueryState("pvUrl", previewUrlParams.pvUrl);
  const [previewUrlDraft, setPreviewUrlDraft] = useState({
    committedUrl: committedPreviewUrl,
    value: committedPreviewUrl,
  });
  const [localActiveUrlState, setLocalActiveUrl] = useState({
    committedUrl: committedPreviewUrl,
    value: committedPreviewUrl,
  });
  const previewUrl = previewUrlDraft.committedUrl === committedPreviewUrl
    ? previewUrlDraft.value
    : committedPreviewUrl;
  const localActiveUrl = localActiveUrlState.committedUrl === committedPreviewUrl
    ? localActiveUrlState.value
    : committedPreviewUrl;

  const setPreviewUrl = useCallback((nextUrl: string) => {
    setPreviewUrlDraft({ committedUrl: committedPreviewUrl, value: nextUrl });
  }, [committedPreviewUrl]);

  const setActivePreviewUrl = useCallback((nextUrl: string) => {
    setLocalActiveUrl({ committedUrl: nextUrl, value: nextUrl });
    void setCommittedPreviewUrl(nextUrl);
  }, [setCommittedPreviewUrl]);

  const handleDetectedUrl = useCallback((url: string) => {
    setPreviewUrlDraft({ committedUrl: url, value: url });
    setLocalActiveUrl({ committedUrl: url, value: url });
    void setCommittedPreviewUrl(url);
  }, [setCommittedPreviewUrl]);

  return (
    <PanelGroup
      direction="vertical"
      autoSaveId={`run-preview-layout-${workspaceId || 'default'}`}
      storage={storage}
      className="flex-col h-full w-full overflow-hidden"
    >
      {/* Top: Preview */}
      <Panel defaultSize={70} className="min-h-0">
        <Preview
          url={previewUrl}
          setUrl={setPreviewUrl}
          activeUrl={localActiveUrl}
          setActiveUrl={setActivePreviewUrl}
          isActive={isActive}
          workspaceId={workspaceId}
          projectId={projectId}
        />
      </Panel>

      <VerticalResizeHandle
        onCollapse={() => {
          if (isRunScriptCollapsed) {
            runScriptPanelRef.current?.expand();
          } else {
            runScriptPanelRef.current?.collapse();
          }
        }}
        isCollapsed={isRunScriptCollapsed}
        onDragging={setIsDragging}
      />

      {/* Bottom: Run Script */}
      <Panel
        ref={runScriptPanelRef}
        collapsible
        defaultSize={30}
        minSize={10}
        maxSize={50}
        collapsedSize={0}
        onCollapse={() => setIsRunScriptCollapsed(true)}
        onExpand={() => setIsRunScriptCollapsed(false)}
        className={cn(
          "min-h-0 flex flex-col",
          !isDragging && "transition-[flex-grow,flex-shrink,basis] duration-300 ease-in-out",
          isRunScriptCollapsed && "min-h-0!"
        )}
      >
        <RunScript
          workspaceId={workspaceId}
          projectId={projectId}
          isActive={isActive}
          projectName={projectName}
          workspaceName={workspaceName}
          onDetectedUrl={handleDetectedUrl}
        />
      </Panel>
    </PanelGroup>
  );
};

interface VerticalResizeHandleProps {
  onCollapse: () => void;
  isCollapsed: boolean;
  onDragging: (isDragging: boolean) => void;
  className?: string;
}

function VerticalResizeHandle({
  onCollapse,
  isCollapsed,
  onDragging,
  className,
}: VerticalResizeHandleProps) {
  return (
    <PanelResizeHandle
      onDragging={onDragging}
      className={cn(
        "relative flex h-px w-full items-center justify-center bg-border transition-colors duration-200 hover:bg-border/80 group touch-none",
        "before:absolute before:inset-x-0 before:-top-1 before:-bottom-1 before:z-10", // Expand hit area
        className
      )}
    >
      {/* Collapse Hint Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCollapse();
        }}
        title={isCollapsed ? "Expand" : "Collapse"}
        aria-label={isCollapsed ? "Expand panel" : "Collapse panel"}
        className={cn(
          "absolute z-50 flex size-5 items-center justify-center rounded-full bg-muted border border-border shadow-lg transition-all duration-200 hover:bg-muted/80 hover:scale-110 opacity-0 group-hover:opacity-100",
          // Center horizontally
          "left-1/2 -translate-x-1/2",
          isCollapsed && "hover:opacity-100! hover:bg-accent!"
        )}
      >
        {isCollapsed ? (
          <ChevronUp className="size-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-3 text-muted-foreground" />
        )}
      </button>
    </PanelResizeHandle>
  );
}
