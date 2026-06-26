"use client";

import React from "react";
import { CheckCircle2, Circle, CircleSlash, Clock3, Loader2 } from "lucide-react";
import { Textarea, cn } from "@workspace/ui";

import { MarkdownRenderer } from "@/shared/components/markdown/MarkdownRenderer";
import { useWorkspaceContextStore, type TaskStatus } from "@/features/workspace/hooks/use-workspace-context";
import {
  getCanvasContextId,
  type CanvasWidgetSourceRef,
  type CanvasWidgetShape,
} from "@/features/canvas/lib/canvas-widget-shape";

type CanvasWorkspaceContextWidgetSource = Extract<CanvasWidgetSourceRef, { type: "workspace-context" }>;

function TaskIcon({ status }: { status: TaskStatus }) {
  if (status === "done") return <CheckCircle2 className="size-3.5 text-success" />;
  if (status === "progress") return <Clock3 className="size-3.5 text-info" />;
  if (status === "cancelled") return <CircleSlash className="size-3.5 text-muted-foreground" />;
  return <Circle className="size-3.5 text-muted-foreground" />;
}

export function CanvasWorkspaceContextWidget({ shape }: { shape: CanvasWidgetShape }) {
  const source = shape.props.source;
  if (source.type !== "workspace-context") {
    return null;
  }
  return <CanvasWorkspaceContextWidgetBody source={source} />;
}

function CanvasWorkspaceContextWidgetBody({
  source,
}: {
  source: CanvasWorkspaceContextWidgetSource;
}) {
  const { context } = source;
  const contextId = getCanvasContextId(context);
  const loadRequirement = useWorkspaceContextStore((state) => state.loadRequirement);
  const loadTasks = useWorkspaceContextStore((state) => state.loadTasks);
  const loadNote = useWorkspaceContextStore((state) => state.loadNote);
  const saveNote = useWorkspaceContextStore((state) => state.saveNote);
  const requirement = useWorkspaceContextStore((state) =>
    contextId ? state.getRequirement(contextId) : null,
  );
  const tasks = useWorkspaceContextStore((state) =>
    contextId ? state.getTasks(contextId) : [],
  );
  const note = useWorkspaceContextStore((state) =>
    contextId ? state.getNote(contextId) : null,
  );
  const isLoading = useWorkspaceContextStore(
    (state) => state.requirementLoading || state.tasksLoading || state.noteLoading,
  );
  const [draftNote, setDraftNote] = React.useState(note ?? "");

  React.useEffect(() => {
    if (!contextId || !context.localPath) {
      return;
    }
    void loadRequirement(contextId, context.localPath);
    void loadTasks(contextId, context.localPath);
    void loadNote(contextId, context.localPath);
  }, [context.localPath, contextId, loadNote, loadRequirement, loadTasks]);

  React.useEffect(() => {
    setDraftNote(note ?? "");
  }, [note]);

  if (!contextId || !context.localPath) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Missing workspace context.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-3">
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Loading context
        </div>
      ) : null}

      <section className="space-y-2 pb-4">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Note</div>
        <Textarea
          value={draftNote}
          onChange={(event) => setDraftNote(event.target.value)}
          onBlur={() => {
            if (draftNote !== (note ?? "")) {
              void saveNote(contextId, context.localPath, draftNote);
            }
          }}
          placeholder="No note yet."
          className="min-h-28 resize-none rounded-md border-border bg-muted/30 text-sm"
        />
      </section>

      <section className="space-y-2 border-t border-border py-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Tasks</div>
          <div className="text-xs text-muted-foreground">{tasks.length}</div>
        </div>
        {tasks.length > 0 ? (
          <div className="space-y-2">
            {tasks.slice(0, 8).map((task, index) => (
              <div key={`${task.rawLine}:${index}`} className="flex items-start gap-2 text-sm">
                <TaskIcon status={task.status} />
                <span
                  className={cn(
                    "min-w-0 flex-1 text-foreground",
                    task.status === "done" && "text-muted-foreground line-through",
                  )}
                >
                  {task.content}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No tasks.</p>
        )}
      </section>

      <section className="space-y-2 border-t border-border pt-4">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Requirement</div>
        {requirement ? (
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
            <MarkdownRenderer>{requirement}</MarkdownRenderer>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No requirement content.</p>
        )}
      </section>
    </div>
  );
}
