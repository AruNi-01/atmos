"use client";

import { useTranslations } from "next-intl";
import {
  cn,
  EmptyAction,
  EmptyState,
  IconCategory,
  IconFolder,
  IconPlus,
  type EmptyStateProps,
} from "@workspace/ui";

/** Compact Spectrum empty for left-sidebar lists. Title + one CTA, no description. */
export function SidebarEmptyState({
  className,
  backdrop = "stack",
  medallionSize = "sm",
  density = "compact",
  ...props
}: EmptyStateProps) {
  return (
    <EmptyState
      className={cn("max-w-[200px]", className)}
      backdrop={backdrop}
      medallionSize={medallionSize}
      density={density}
      {...props}
    />
  );
}

export function SidebarEmptyWorkspaces({
  className,
  onAdd,
}: {
  className?: string;
  onAdd: () => void;
}) {
  const t = useTranslations("AppShell.chrome");
  return (
    <div className={cn("flex h-full min-h-full w-full flex-col items-center justify-center px-2", className)}>
      <SidebarEmptyState
        icon={<IconFolder />}
        title={t("leftSidebarControls.emptyWorkspaces.title")}
        actions={
          <EmptyAction
            size="sm"
            className="whitespace-nowrap"
            icon={<IconPlus />}
            onClick={(event) => {
              event.stopPropagation();
              onAdd();
            }}
          >
            {t("leftSidebarControls.emptyWorkspaces.cta")}
          </EmptyAction>
        }
      />
    </div>
  );
}

export function SidebarEmptyProjects({
  className,
  onAdd,
}: {
  className?: string;
  onAdd: () => void;
}) {
  const t = useTranslations("AppShell.chrome");
  return (
    <div className={cn("flex h-full min-h-full w-full flex-col items-center justify-center px-2", className)}>
      <SidebarEmptyState
        icon={<IconCategory />}
        title={t("leftSidebarControls.emptyProjects.title")}
        actions={
          <EmptyAction
            size="sm"
            className="whitespace-nowrap"
            icon={<IconPlus />}
            onClick={(event) => {
              event.stopPropagation();
              onAdd();
            }}
          >
            {t("leftSidebarControls.emptyProjects.cta")}
          </EmptyAction>
        }
      />
    </div>
  );
}
