"use client";

import type { ComponentProps } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowDownIcon, DownloadIcon } from "lucide-react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

import { Button } from "../ui/button";
import { SPRING_LAYOUT } from "../../lib/ease";
import { spring } from "../../lib/springs";
import { cn } from "../../lib/utils";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn("relative flex-1 overflow-y-hidden", className)}
    initial="smooth"
    resize="smooth"
    role="log"
    {...props}
  />
);

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps) => (
  <StickToBottom.Content
    className={cn("flex flex-col gap-8 p-4", className)}
    {...props}
  />
);

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
};

export const ConversationEmptyState = ({
  className,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      "flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
      className
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="font-medium text-sm">{title}</h3>
          {description && (
            <p className="text-muted-foreground text-sm">{description}</p>
          )}
        </div>
      </>
    )}
  </div>
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button> & {
  /** Render into a host (e.g. above-composer overlay) so chrome cannot cover the control. */
  host?: HTMLElement | null;
};

/** Icon-only pill is a 32px circle (`h-8`); expansions spring from this width. */
const SCROLL_BUTTON_ICON_SIZE = 32;

function ConversationScrollButtonControl({
  className,
  children,
  reduceMotion,
  ...props
}: Omit<ConversationScrollButtonProps, "host"> & { reduceMotion: boolean | null }) {
  const measureRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [width, setWidth] = useState(SCROLL_BUTTON_ICON_SIZE);

  useEffect(() => {
    const content = measureRef.current;
    const button = buttonRef.current;
    if (!content || !button) return;

    const measure = () => {
      const extra = button.offsetWidth - button.clientWidth;
      const next = Math.max(
        SCROLL_BUTTON_ICON_SIZE,
        Math.ceil(content.scrollWidth + extra),
      );
      setWidth((current) => (current === next ? current : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [children]);

  return (
    <Button
      render={
        <motion.button
          ref={buttonRef}
          initial={false}
          animate={{ width }}
          transition={reduceMotion ? { duration: 0 } : SPRING_LAYOUT}
        />
      }
      className={cn(
        "h-8 min-h-8 min-w-8 max-h-8 justify-center gap-0 overflow-hidden rounded-full border-border px-0 shadow-sm before:rounded-full sm:h-8 [&_svg]:mx-0!",
        "has-[[data-agent-chat-scroll-below]]:justify-start",
        className,
      )}
      size="sm"
      type="button"
      variant="secondary"
      {...props}
    >
      <span
        ref={measureRef}
        className="inline-flex h-8 w-max shrink-0 items-center gap-1.5 has-[[data-agent-chat-scroll-below]]:pl-2 has-[[data-agent-chat-scroll-below]]:pr-2.5"
      >
        {children ?? <ArrowDownIcon className="size-4" />}
      </span>
    </Button>
  );
}

export const ConversationScrollButton = ({
  className,
  children,
  host,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  const reduceMotion = useReducedMotion();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  const button = (
    <AnimatePresence initial={false}>
      {!isAtBottom ? (
        <motion.div
          key="conversation-scroll-to-bottom"
          className="pointer-events-auto flex justify-center"
          data-agent-chat-scroll-to-bottom=""
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          exit={
            reduceMotion
              ? { opacity: 0, transition: { duration: 0 } }
              : { opacity: 0, y: 36, transition: spring.moderate.exit }
          }
          transition={reduceMotion ? { duration: 0 } : spring.moderate}
        >
          <ConversationScrollButtonControl
            className={className}
            reduceMotion={reduceMotion}
            onClick={handleScrollToBottom}
            {...props}
          >
            {children}
          </ConversationScrollButtonControl>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  if (host) {
    const slot = host.querySelector<HTMLElement>("[data-agent-chat-scroll-button-host]");
    return createPortal(button, slot ?? host);
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center overflow-hidden pb-2">
      {button}
    </div>
  );
};

export interface ConversationMessage {
  role: "user" | "assistant" | "system" | "data" | "tool";
  content: string;
}

export type ConversationDownloadProps = Omit<
  ComponentProps<typeof Button>,
  "onClick"
> & {
  messages: ConversationMessage[];
  filename?: string;
  formatMessage?: (message: ConversationMessage, index: number) => string;
};

const defaultFormatMessage = (message: ConversationMessage): string => {
  const roleLabel =
    message.role.charAt(0).toUpperCase() + message.role.slice(1);
  return `**${roleLabel}:** ${message.content}`;
};

export const messagesToMarkdown = (
  messages: ConversationMessage[],
  formatMessage: (
    message: ConversationMessage,
    index: number
  ) => string = defaultFormatMessage
): string => messages.map((msg, i) => formatMessage(msg, i)).join("\n\n");

export const ConversationDownload = ({
  messages,
  filename = "conversation.md",
  formatMessage = defaultFormatMessage,
  className,
  children,
  ...props
}: ConversationDownloadProps) => {
  const handleDownload = useCallback(() => {
    const markdown = messagesToMarkdown(messages, formatMessage);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [messages, filename, formatMessage]);

  return (
    <Button
      className={cn(
        "absolute top-4 right-4 rounded-full dark:bg-background dark:hover:bg-muted",
        className
      )}
      onClick={handleDownload}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      {children ?? <DownloadIcon className="size-4" />}
    </Button>
  );
};
