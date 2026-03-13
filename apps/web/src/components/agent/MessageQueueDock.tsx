"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  ConfirmationAction,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  SortableContext,
  closestCenter,
  CSS,
  KeyboardSensor,
  PointerSensor,
  restrictToVerticalAxis,
  sortableKeyboardCoordinates,
  useSensor,
  useSensors,
  useSortable,
  verticalListSortingStrategy,
} from "@workspace/ui";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import type { QueuedAgentPrompt } from "@/hooks/use-dialog-store";

function HoverScrollableText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const textRef = useRef<HTMLSpanElement>(null);
  const animRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopScroll = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (animRef.current) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    const el = textRef.current;
    if (el) el.scrollLeft = 0;
  }, []);

  const startScroll = useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    const overflow = el.scrollWidth - el.clientWidth;
    if (overflow <= 0) return;

    el.scrollLeft = 0;
    timeoutRef.current = setTimeout(() => {
      const duration = overflow * 40;
      const startTime = performance.now();

      const step = (now: number) => {
        const progress = Math.min((now - startTime) / duration, 1);
        el.scrollLeft = overflow * progress;
        if (progress < 1) {
          animRef.current = requestAnimationFrame(step);
        }
      };

      animRef.current = requestAnimationFrame(step);
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <span
      ref={textRef}
      className={className}
      onMouseEnter={startScroll}
      onMouseLeave={stopScroll}
      title={text}
    >
      {text}
    </span>
  );
}

export function PermissionActionButton({
  label,
  variant,
  onClick,
}: {
  label: string;
  variant?: React.ComponentProps<typeof ConfirmationAction>["variant"];
  onClick: () => void;
}) {
  return (
    <ConfirmationAction
      variant={variant}
      onClick={onClick}
      className="min-w-0 max-w-[22rem] flex-1 basis-0 justify-start overflow-hidden px-3"
    >
      <HoverScrollableText
        text={label}
        className="block w-full overflow-hidden whitespace-nowrap"
      />
    </ConfirmationAction>
  );
}

const NOOP_QUEUE_ACTION = () => { };

function QueueCard({
  item,
  isDragging = false,
  dragHandleProps,
  isEditing = false,
  editValue,
  onEditValueChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
}: {
  item: QueuedAgentPrompt;
  isDragging?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  isEditing?: boolean;
  editValue?: string;
  onEditValueChange?: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onRemove: () => void;
}) {
  const trimmedValue = (editValue ?? "").trim();

  return (
    <motion.div
      layout
      className={`group/queue transition-colors ${
        isDragging
          ? "bg-background/95 shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="flex items-center gap-1 px-1.5 py-1">
        <button
          type="button"
          aria-label="Reorder queued prompt"
          className={`flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors ${
            isEditing
              ? "cursor-not-allowed opacity-40"
              : "cursor-grab hover:bg-muted hover:text-foreground active:cursor-grabbing"
          }`}
          disabled={isEditing}
          {...dragHandleProps}
        >
          <GripVertical className="size-3" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-foreground">
            {item.displayPrompt ?? item.prompt}
          </p>
        </div>
        <div className={`flex shrink-0 items-center gap-0 transition-opacity ${isEditing ? "opacity-100" : "opacity-0 group-hover/queue:opacity-100"}`}>
          <Popover open={isEditing} onOpenChange={(open) => {
            if (open) {
              onStartEdit();
            } else {
              onCancelEdit();
            }
          }}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant={isEditing ? "secondary" : "ghost"}
                size="icon-sm"
                className="size-6 text-muted-foreground hover:text-foreground"
                aria-label="Edit queued prompt"
              >
                <Pencil className="size-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              side="top"
              className="w-[min(420px,calc(100vw-64px))] border-border/80 p-3"
            >
              <div className="space-y-3">
                <textarea
                  autoFocus
                  value={editValue}
                  onChange={(e) => onEditValueChange?.(e.target.value)}
                  className="min-h-28 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring"
                />
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={onCancelEdit}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={onSaveEdit}
                    disabled={!trimmedValue}
                  >
                    Save
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            className="size-6 text-muted-foreground hover:text-destructive"
            aria-label="Delete queued prompt"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function SortableQueueCard({
  item,
  editingPromptId,
  editingPromptValue,
  onEditingPromptValueChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
}: {
  item: QueuedAgentPrompt;
  editingPromptId: string | null;
  editingPromptValue: string;
  onEditingPromptValueChange: (value: string) => void;
  onStartEdit: (item: QueuedAgentPrompt) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const isEditing = editingPromptId === item.id;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: isEditing,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <QueueCard
        item={item}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
        isEditing={isEditing}
        editValue={isEditing ? editingPromptValue : item.prompt}
        onEditValueChange={onEditingPromptValueChange}
        onStartEdit={() => onStartEdit(item)}
        onCancelEdit={onCancelEdit}
        onSaveEdit={() => onSaveEdit(item.id)}
        onRemove={() => onRemove(item.id)}
      />
    </div>
  );
}

export function MessageQueueDock({
  items,
  onRemove,
  onUpdatePrompt,
  onMove,
}: {
  items: QueuedAgentPrompt[];
  onRemove: (id: string) => void;
  onUpdatePrompt: (id: string, prompt: string) => void;
  onMove: (id: string, toIndex: number) => void;
}) {
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editingPromptValue, setEditingPromptValue] = useState("");
  const [draggingPromptId, setDraggingPromptId] = useState<string | null>(null);

  const draggingPrompt = draggingPromptId
    ? items.find((item) => item.id === draggingPromptId) ?? null
    : null;
  const activeEditingPromptId = editingPromptId && items.some((item) => item.id === editingPromptId)
    ? editingPromptId
    : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleStartEdit = useCallback((item: QueuedAgentPrompt) => {
    setEditingPromptId(item.id);
    setEditingPromptValue(item.displayPrompt ?? item.prompt);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingPromptId(null);
    setEditingPromptValue("");
  }, []);

  const handleSaveEdit = useCallback((id: string) => {
    const trimmed = editingPromptValue.trim();
    if (!trimmed) return;
    onUpdatePrompt(id, trimmed);
    setEditingPromptId(null);
    setEditingPromptValue("");
  }, [editingPromptValue, onUpdatePrompt]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggingPromptId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setDraggingPromptId(null);
    if (!over || active.id === over.id) return;
    const fromIndex = items.findIndex((item) => item.id === String(active.id));
    const toIndex = items.findIndex((item) => item.id === String(over.id));
    if (fromIndex < 0 || toIndex < 0) return;
    onMove(String(active.id), toIndex);
  }, [items, onMove]);

  if (items.length === 0) return null;

  return (
    <div className="bg-muted/20">
      <div className="flex items-center justify-between border-b border-border/70 px-3 py-1.5">
        <div className="text-xs font-medium text-foreground/90">Message Queue</div>
        <div className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
          {items.length}
        </div>
      </div>
      <div className="px-2 py-0.5">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="divide-y divide-border/60">
              <AnimatePresence initial={false}>
                {items.map((item) => (
                  <SortableQueueCard
                    key={item.id}
                    item={item}
                    editingPromptId={activeEditingPromptId}
                    editingPromptValue={editingPromptValue}
                    onEditingPromptValueChange={setEditingPromptValue}
                    onStartEdit={handleStartEdit}
                    onCancelEdit={handleCancelEdit}
                    onSaveEdit={handleSaveEdit}
                    onRemove={(id) => {
                      onRemove(id);
                      if (activeEditingPromptId === id) {
                        handleCancelEdit();
                      }
                    }}
                  />
                ))}
              </AnimatePresence>
            </div>
          </SortableContext>
          <DragOverlay>
            {draggingPrompt ? (
              <div className="w-[min(560px,calc(100vw-96px))]">
                <QueueCard
                  item={draggingPrompt}
                  isDragging
                  onStartEdit={NOOP_QUEUE_ACTION}
                  onCancelEdit={NOOP_QUEUE_ACTION}
                  onSaveEdit={NOOP_QUEUE_ACTION}
                  onRemove={NOOP_QUEUE_ACTION}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
