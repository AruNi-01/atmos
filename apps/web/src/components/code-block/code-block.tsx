import { forwardRef, type ComponentProps } from "react";
import { cn } from "@workspace/ui";
import { FileIcon } from "@react-symbols/icons/utils";

const CodeBlock = ({
  children,
  className,
  ...props
}: ComponentProps<"div">) => {
  return (
    <div
      className={cn(
        "not-prose",
        "flex w-full flex-col overflow-clip rounded-lg shadow-xs",
        "bg-neutral-200/40 dark:bg-neutral-800/70",
        "border border-neutral-200 dark:border-neutral-800",
        "text-neutral-950 dark:text-neutral-50",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};

type CodeBlockHeaderProps = ComponentProps<"div">;

const CodeBlockHeader = ({
  children,
  className,
  ...props
}: CodeBlockHeaderProps) => {
  return (
    <div
      className={cn(
        "not-prose",
        "flex h-9 items-center justify-between px-2 py-1.5",
        "text-sm text-neutral-600 dark:text-neutral-400",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};

interface CodeBlockIconProps extends ComponentProps<"div"> {
  language?: string;
}

const CodeBlockIcon = ({ language, className }: CodeBlockIconProps) => {
  return (
    <FileIcon
      width={16}
      height={16}
      fileName={`.${language ?? ""}`}
      autoAssign={true}
      className={cn(className)}
    />
  );
};

type CodeBlockGroupProps = ComponentProps<"div">;

const CodeBlockGroup = ({
  children,
  className,
  ...props
}: CodeBlockGroupProps) => {
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        "text-sm text-neutral-600 dark:text-neutral-400",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};

interface CodeBlockContentProps extends ComponentProps<"div"> {
  expanded?: boolean;
}

const CodeBlockContent = forwardRef<HTMLDivElement, CodeBlockContentProps>(
  ({ className, children, expanded = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          expanded ? "overflow-y-auto" : "max-h-96 overflow-y-auto",
          "bg-background px-3",
          "rounded-lg font-mono text-sm leading-5 whitespace-pre",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
CodeBlockContent.displayName = "CodeBlockContent";

export {
  CodeBlock,
  CodeBlockHeader,
  CodeBlockIcon,
  CodeBlockGroup,
  CodeBlockContent,
};
