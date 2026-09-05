"use client";

import React, { useCallback, useRef, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import {
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
  cn,
} from "@workspace/ui";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import type { QueuedAgentPrompt } from "@/app-shell/state/use-dialog-store";
import { queuedPromptEditText } from "@/features/agent/lib/agent-composer-attachment";

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
  disabled,
}: {
  label: string;
  variant?: React.ComponentProps<typeof ConfirmationAction>["variant"];
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <ConfirmationAction
      variant={variant}
      onClick={onClick}
      disabled={disabled}
      className="min-w-0 max-w-[22rem] flex-1 basis-0 justify-start overflow-hidden rounded-full px-3"
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
  onToggleEdit,
  onRemove,
  t,
}: {
  item: QueuedAgentPrompt;
  isDragging?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  isEditing?: boolean;
  onToggleEdit: () => void;
  onRemove: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const showActions = isEditing || isHovered;
  const text = queuedPromptEditText(item);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group/queue ${
        isDragging
          ? "bg-background/95 shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="flex items-center gap-1 px-1.5 py-1">
        <button
          type="button"
          aria-label={t("messageQueue.reorderAria")}
          className={`flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground ${
            isEditing
              ? "cursor-not-allowed opacity-40"
              : "cursor-grab hover:bg-muted hover:text-foreground active:cursor-grabbing"
          }`}
          disabled={isEditing}
          {...dragHandleProps}
        >
          <GripVertical className="size-3" />
        </button>
        <div className={cn("min-w-0 flex-1", isEditing && "px-1.5")}>
          <p
            data-queue-item-editing={isEditing ? "true" : undefined}
            className={cn(
              "truncate text-xs text-foreground",
              isEditing &&
                "rounded-lg border border-dashed border-info px-2 py-0.5",
            )}
          >
            {text}
          </p>
        </div>
        <div
          className={`flex shrink-0 items-center gap-0 transition-opacity duration-150 ${
            showActions ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <Button
            type="button"
            variant={isEditing ? "secondary" : "ghost"}
            size="icon-sm"
            className="size-6 rounded-full text-muted-foreground hover:text-foreground"
            aria-label={t("messageQueue.editAria")}
            aria-pressed={isEditing}
            onClick={onToggleEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            className="size-6 rounded-full text-muted-foreground hover:text-destructive"
            aria-label={t("messageQueue.deleteAria")}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

type SortableQueueCardProps = {
  item: QueuedAgentPrompt;
  isEditing: boolean;
  onToggleEdit: (item: QueuedAgentPrompt) => void;
  onRemove: (id: string) => void;
  t: ReturnType<typeof useTranslations>;
};

const SortableQueueCard = React.forwardRef<HTMLDivElement, SortableQueueCardProps>(function SortableQueueCard({
  item,
  isEditing,
  onToggleEdit,
  onRemove,
  t,
}, forwardedRef) {
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
  const setRefs = React.useCallback((node: HTMLDivElement | null) => {
    setNodeRef(node);
    if (typeof forwardedRef === "function") {
      forwardedRef(node);
    } else if (forwardedRef) {
      forwardedRef.current = node;
    }
  }, [forwardedRef, setNodeRef]);

  return (
    <motion.div
      ref={setRefs}
      layout="position"
      initial={{ opacity: 1, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        y: 12,
        transition: {
          duration: 0.16,
          ease: "easeOut",
        },
      }}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      transition={{
        layout: {
          duration: 0.16,
          ease: "easeOut",
        },
      }}
    >
      <QueueCard
        item={item}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
        isEditing={isEditing}
        onToggleEdit={() => onToggleEdit(item)}
        onRemove={() => onRemove(item.id)}
        t={t}
      />
    </motion.div>
  );
});
SortableQueueCard.displayName = "SortableQueueCard";

export function MessageQueueDock({
  items,
  editingPromptId,
  onToggleEdit,
  onRemove,
  onMove,
}: {
  items: QueuedAgentPrompt[];
  editingPromptId: string | null;
  onToggleEdit: (item: QueuedAgentPrompt) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, toIndex: number) => void;
}) {
  const t = useTranslations("Agent.components");
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
        <div className="text-xs font-medium text-foreground/90">{t("messageQueue.title")}</div>
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
              <AnimatePresence initial={false} mode="popLayout">
                {items.map((item) => (
                  <SortableQueueCard
                    key={item.id}
                    item={item}
                    isEditing={activeEditingPromptId === item.id}
                    onToggleEdit={onToggleEdit}
                    t={t}
                    onRemove={onRemove}
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
                  onToggleEdit={NOOP_QUEUE_ACTION}
                  onRemove={NOOP_QUEUE_ACTION}
                  t={t}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
