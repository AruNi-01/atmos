"use client";

import React, { useCallback, useRef, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "motion/react";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
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
import { ChevronDown, GripVertical, ListOrdered, Pencil, Trash2 } from "lucide-react";
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
}: {
  label: string;
  variant?: React.ComponentProps<typeof ConfirmationAction>["variant"];
  onClick: () => void;
}) {
  return (
    <ConfirmationAction
      variant={variant}
      onClick={onClick}
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
        <div className="min-w-0 flex-1">
          <p
            data-queue-item-editing={isEditing ? "true" : undefined}
            className="truncate text-xs text-foreground"
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
  const [isOpen, setIsOpen] = useState(true);
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
    <div className="bg-background">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <div className="group flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted/10">
            <span className="relative inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground group-hover:text-foreground">
              <ListOrdered
                className="absolute size-4 transition-opacity duration-150 motion-reduce:transition-none group-hover:opacity-0 group-focus-visible:opacity-0"
                aria-hidden
              />
              <ChevronDown
                className={cn(
                  "absolute size-4 opacity-0 transition-[opacity,transform] duration-150 motion-reduce:transition-none",
                  "group-hover:opacity-100 group-focus-visible:opacity-100",
                  "group-data-[state=closed]:-rotate-90",
                )}
                aria-hidden
              />
            </span>
            <span className="text-sm font-medium text-foreground/90">
              {t("messageQueue.title")}
            </span>
            <div className="flex-1" />
            <span className="mr-1 text-sm text-muted-foreground">{items.length}</span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none">
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
                <div>
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
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
