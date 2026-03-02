"use client";

import type { ComponentProps, ReactElement, ReactNode } from "react";
import { isValidElement } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";
import {
  ChevronDown,
  Loader2,
  CheckCircle2,
  XCircle,
  Wrench,
  Sparkles,
} from "lucide-react";

/** Tool state for display - maps to ai-sdk ToolUIPart states */
export type ToolState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error"
  | "output-denied"
  | "approval-requested"
  | "approval-responded";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, defaultOpen = false, ...props }: ToolProps) => (
  <Collapsible
    className={cn("not-prose w-full rounded-lg border border-border bg-muted/30", className)}
    defaultOpen={defaultOpen}
    {...props}
  />
);

export type ToolHeaderProps = Omit<ComponentProps<typeof CollapsibleTrigger>, 'type'> & {
  /** Tool type/name */
  type?: string;
  /** Display state */
  state?: ToolState;
  /** Custom title override */
  title?: string;
  /** Tool name for dynamic tools */
  toolName?: string;
  /** "skill" uses Sparkles icon and skill styling */
  variant?: "tool" | "skill";
  /** Custom icon (overrides variant default) */
  icon?: ReactNode;
  className?: string;
};

const stateConfig: Record<
  ToolState,
  { label: string; icon: typeof Loader2; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  "input-streaming": {
    label: "Pending",
    icon: Loader2,
    variant: "secondary",
  },
  "input-available": {
    label: "Running",
    icon: Loader2,
    variant: "secondary",
  },
  "output-available": {
    label: "Completed",
    icon: CheckCircle2,
    variant: "default",
  },
  "output-error": {
    label: "Error",
    icon: XCircle,
    variant: "destructive",
  },
  "output-denied": {
    label: "Denied",
    icon: XCircle,
    variant: "outline",
  },
  "approval-requested": {
    label: "Awaiting Approval",
    icon: Wrench,
    variant: "secondary",
  },
  "approval-responded": {
    label: "Responded",
    icon: CheckCircle2,
    variant: "outline",
  },
};

export const ToolHeader = ({
  type = "tool",
  state = "output-available",
  title,
  toolName,
  variant = "tool",
  icon,
  className,
  children,
  ...props
}: ToolHeaderProps) => {
  const config = stateConfig[state];
  const Icon = config.icon;
  const displayName = title ?? toolName ?? type?.replace(/^tool-/, "") ?? (variant === "skill" ? "Skill" : "Tool");
  const isRunning = state === "input-available" || state === "input-streaming";
  const IconComponent = variant === "skill" ? Sparkles : Wrench;

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 [&[data-state=open]>svg:last-child]:rotate-180",
        className
      )}
      {...props}
    >
      {children ?? (
        <>
          {icon !== undefined ? (
            <span className="size-4 shrink-0 [&>svg]:size-4 text-muted-foreground">{icon}</span>
          ) : (
            <IconComponent className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate font-medium">
            {displayName}
          </span>
          <Badge variant={config.variant} className="gap-1 font-normal shrink-0">
            {isRunning ? (
              <Icon className="size-3 animate-spin" />
            ) : (
              <Icon className="size-3" />
            )}
            {config.label}
          </Badge>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform" />
        </>
      )}
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "overflow-hidden",
      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1",
      "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input?: unknown;
  /** Section label (default: "Parameters") */
  label?: string;
};

export const ToolInput = ({ input, label = "Parameters", className, ...props }: ToolInputProps) => {
  const jsonStr =
    typeof input === "string"
      ? input
      : JSON.stringify(input ?? {}, null, 2);
  const isEmpty = !input || (typeof input === "object" && Object.keys(input as object).length === 0);

  if (isEmpty) return null;

  return (
    <div
      className={cn(
        "border-t border-border px-3 py-2 text-xs",
        "bg-background/50 dark:bg-background/20",
        className
      )}
      {...props}
    >
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <pre className="overflow-x-auto rounded-md bg-muted/50 p-2 font-mono text-muted-foreground">
        {jsonStr}
      </pre>
    </div>
  );
};

export type ToolOutputProps = ComponentProps<"div"> & {
  output?: ReactNode;
  errorText?: string | null;
};

export const ToolOutput = ({
  output,
  errorText,
  className,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }
  const label = errorText ? "Error" : "Result";
  const outputStr =
    typeof output === "object" && output !== null && !isValidElement(output as ReactElement)
      ? JSON.stringify(output, null, 2)
      : typeof output === "string"
        ? output
        : String(output ?? "");

  if (errorText) {
    return (
      <div
        className={cn(
          "border-t border-border px-3 py-2 text-xs",
          "bg-destructive/5 dark:bg-destructive/10",
          className
        )}
        {...props}
      >
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-destructive">
          {label}
        </p>
        <p className="text-destructive">{errorText}</p>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "border-t border-border px-3 py-2 text-sm",
        "bg-background/50 dark:bg-background/20",
        className
      )}
      {...props}
    >
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {typeof output === "object" && output !== null ? (
        <pre className="overflow-x-auto rounded-md bg-muted/50 p-2 font-mono text-muted-foreground text-xs">
          {outputStr}
        </pre>
      ) : (
        <p className="text-muted-foreground">{outputStr || output}</p>
      )}
    </div>
  );
};

/** Skill invocation - distinct from Tool, uses Sparkles icon and primary accent */
export const Skill = ({ className, defaultOpen = false, ...props }: ToolProps) => (
  <Collapsible
    className={cn(
      "not-prose w-full rounded-lg border border-primary/20 bg-primary/5",
      className
    )}
    defaultOpen={defaultOpen}
    {...props}
  />
);

/** Returns a Badge for the given tool state */
export function getStatusBadge(state: ToolState): ReactNode {
  const config = stateConfig[state];
  const Icon = config.icon;
  const isRunning =
    state === "input-available" || state === "input-streaming";

  return (
    <Badge variant={config.variant} className="gap-1 font-normal">
      {isRunning ? (
        <Icon className="size-3 animate-spin" />
      ) : (
        <Icon className="size-3" />
      )}
      {config.label}
    </Badge>
  );
}
