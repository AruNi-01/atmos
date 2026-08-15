"use client";

import { useTranslations } from "next-intl";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@workspace/ui";
import {
  Check,
  FolderOpen,
  Globe,
  Layers,
  Puzzle,
} from "lucide-react";

import { PageFilterButton } from "@/shared/components/PageFilterButton";
import type { ScopeFilter } from "@/shared/lib/nuqs/searchParams";

const SCOPE_OPTIONS: Array<{
  value: ScopeFilter;
  icon: typeof Puzzle;
  labelKey: "all" | "system" | "global" | "project";
}> = [
  { value: "all", icon: Layers, labelKey: "all" },
  { value: "system", icon: Puzzle, labelKey: "system" },
  { value: "global", icon: Globe, labelKey: "global" },
  { value: "project", icon: FolderOpen, labelKey: "project" },
];

export function SkillsFilterMenu({
  scopeFilter,
  selectedProjectIds,
  projects,
  onScopeChange,
  onProjectToggle,
  onClear,
}: {
  scopeFilter: ScopeFilter;
  selectedProjectIds: string[];
  projects: Array<{ id: string; name: string }>;
  onScopeChange: (filter: ScopeFilter) => void;
  onProjectToggle: (projectId: string) => void;
  onClear: () => void;
}) {
  const t = useTranslations("skills.view.filter");
  const activeCount =
    (scopeFilter === "all" ? 0 : 1) + selectedProjectIds.length;

  return (
    <PageFilterButton label={t("trigger")} activeCount={activeCount}>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Layers className="size-4" />
          <span className="min-w-0 flex-1 truncate">{t("scope")}</span>
          {scopeFilter !== "all" ? (
            <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
              1
            </span>
          ) : null}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-56">
          {SCOPE_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={(event) => {
                event.preventDefault();
                onScopeChange(option.value);
              }}
              className="cursor-pointer"
            >
              <option.icon className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {t(`scopes.${option.labelKey}`)}
              </span>
              {scopeFilter === option.value ? <Check className="size-4" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      {projects.length > 0 ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FolderOpen className="size-4" />
            <span className="min-w-0 flex-1 truncate">{t("projects")}</span>
            {selectedProjectIds.length > 0 ? (
              <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                {selectedProjectIds.length}
              </span>
            ) : null}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            {projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onSelect={(event) => {
                  event.preventDefault();
                  onProjectToggle(project.id);
                }}
                className="cursor-pointer"
              >
                <FolderOpen className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                {selectedProjectIds.includes(project.id) ? (
                  <Check className="size-4" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : null}

      {activeCount > 0 ? (
        <>
          <DropdownMenuSeparator className="mx-2" />
          <DropdownMenuItem
            onClick={onClear}
            className="text-xs font-medium text-muted-foreground"
          >
            {t("clearAll")}
          </DropdownMenuItem>
        </>
      ) : null}
    </PageFilterButton>
  );
}
