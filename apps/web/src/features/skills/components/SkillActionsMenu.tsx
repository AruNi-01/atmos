"use client";

import React, { useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  ChevronDown,
  cn,
  Eye,
  EyeOff,
  Folder,
  Loader2,
  Link2,
  MoreHorizontal,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Trash2,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toastManager,
} from "@workspace/ui";
import { skillsApi, type SkillInfo, type SkillPlacement } from "@/api/ws-api";

type SkillAction = "enable" | "disable" | "delete";
type PlacementGroup = {
  key: string;
  placements: SkillPlacement[];
  agents: string[];
  entryKind: string;
  symlinkTarget: string | null;
  resolvedPath: string | null;
};

interface SkillActionsMenuProps {
  skill: SkillInfo;
  onUpdated?: (skill: SkillInfo) => void | Promise<void>;
  onDeleted?: (skillId: string) => void | Promise<void>;
  className?: string;
}

function buildDeleteMessage(
  selectedPlacements: SkillPlacement[],
  selectedCount: number,
  totalCount: number,
) {
  const hasSymlink = selectedPlacements.some(
    (placement) => placement.entry_kind === "symlink",
  );
  const scopeText =
    selectedCount === totalCount
      ? "this skill from all selected managed locations"
      : `these ${selectedCount} selected skill locations`;

  if (hasSymlink) {
    return `Delete ${scopeText}? Symlink entries are removed as links only. Their target files stay untouched.`;
  }

  return `Delete ${scopeText}? This removes the installed files from the selected locations.`;
}

function buildConfirmCopy(
  action: SkillAction,
  selectedCount: number,
  totalCount: number,
  selectedPlacements: SkillPlacement[],
) {
  const scopeText =
    selectedCount === totalCount
      ? "all selected locations"
      : `${selectedCount} selected location${selectedCount === 1 ? "" : "s"}`;

  switch (action) {
    case "enable":
      return {
        title: "Enable this skill?",
        description: `This will restore the skill to ${scopeText}.`,
        confirmLabel: "Enable",
        confirmVariant: "default" as const,
      };
    case "disable":
      return {
        title: "Disable this skill?",
        description: `This will move the skill out of agent-visible directories for ${scopeText}, without deleting its files.`,
        confirmLabel: "Disable",
        confirmVariant: "secondary" as const,
      };
    case "delete":
      return {
        title: "Delete this skill?",
        description: buildDeleteMessage(selectedPlacements, selectedCount, totalCount),
        confirmLabel: "Delete",
        confirmVariant: "destructive" as const,
      };
  }
}

function getActionablePlacements(skill: SkillInfo, action: SkillAction) {
  switch (action) {
    case "enable":
      return skill.placements.filter(
        (placement) => placement.can_toggle && placement.status !== "enabled",
      );
    case "disable":
      return skill.placements.filter(
        (placement) => placement.can_toggle && placement.status !== "disabled",
      );
    case "delete":
      return skill.placements.filter((placement) => placement.can_delete);
  }
}

function formatAgentTitle(agent: string) {
  return agent === "unified"
    ? "Unified"
    : agent.charAt(0).toUpperCase() + agent.slice(1);
}

function formatPlacementPath(placement: SkillPlacement, action: SkillAction) {
  if (action === "enable") {
    return placement.original_path;
  }
  return placement.path;
}

function formatPlacementMeta(placement: SkillPlacement, action: SkillAction) {
  if (action === "enable") {
    return `Currently disabled at ${placement.path}`;
  }
  if (placement.status === "disabled") {
    return `Currently in disabled storage`;
  }
  return `Currently active`;
}

function groupPlacementsByPath(
  placements: SkillPlacement[],
  action: SkillAction,
): PlacementGroup[] {
  const groups = new Map<string, PlacementGroup>();

  for (const placement of placements) {
    const key = placement.original_path;
    const existing = groups.get(key);
    if (existing) {
      if (!existing.agents.includes(placement.agent)) {
        existing.agents.push(placement.agent);
      }
      existing.placements.push(placement);
      if (!existing.symlinkTarget && placement.symlink_target) {
        existing.symlinkTarget = placement.symlink_target;
      }
      continue;
    }

    groups.set(key, {
      key,
      placements: [placement],
      agents: [placement.agent],
      entryKind: placement.entry_kind,
      symlinkTarget: placement.symlink_target,
      resolvedPath: placement.resolved_path,
    });
  }

  return Array.from(groups.values()).sort((a, b) => {
    const pathA = formatPlacementPath(a.placements[0], action);
    const pathB = formatPlacementPath(b.placements[0], action);
    return pathA.localeCompare(pathB);
  });
}

function flattenGroupPlacementIds(groups: PlacementGroup[], selectedKeys: string[]) {
  const selectedKeySet = new Set(selectedKeys);
  return groups
    .filter((group) => selectedKeySet.has(group.key))
    .flatMap((group) => group.placements.map((placement) => placement.id));
}

function deriveLinkedSelection(
  groups: PlacementGroup[],
  explicitKeys: string[],
): {
  autoSelectedKeys: string[];
  effectiveKeys: string[];
} {
  const byKey = new Map(groups.map((group) => [group.key, group]));
  const autoSelectedKeys = new Set<string>();

  for (const key of explicitKeys) {
    const sourceGroup = byKey.get(key);
    if (!sourceGroup || sourceGroup.entryKind === "symlink" || !sourceGroup.resolvedPath) {
      continue;
    }

    for (const candidate of groups) {
      if (
        candidate.key !== sourceGroup.key &&
        candidate.entryKind === "symlink" &&
        candidate.resolvedPath === sourceGroup.resolvedPath
      ) {
        autoSelectedKeys.add(candidate.key);
      }
    }
  }

  return {
    autoSelectedKeys: Array.from(autoSelectedKeys),
    effectiveKeys: Array.from(new Set([...explicitKeys, ...autoSelectedKeys])),
  };
}

function formatGroupTitle(group: PlacementGroup) {
  return group.agents.map(formatAgentTitle).join(", ");
}

function formatGroupMeta(group: PlacementGroup, action: SkillAction) {
  const base = formatPlacementMeta(group.placements[0], action);
  if (group.agents.length <= 1) {
    return base;
  }
  return `${base} · Shared by ${group.agents.length} agents`;
}

function isUnifiedGroup(group: PlacementGroup, action: SkillAction) {
  const path = formatPlacementPath(group.placements[0], action);
  return path.includes("/.agents/skills/") || path.includes("\\.agents\\skills\\");
}

function entryKindIcon(entryKind: string) {
  return entryKind === "symlink" ? Link2 : Folder;
}

function TruncatedPath({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <p className={cn("truncate font-mono", className)}>{value}</p>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-md break-all text-xs">
          {value}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function SkillActionsMenu({
  skill,
  onUpdated,
  onDeleted,
  className,
}: SkillActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<SkillAction | null>(null);
  const [applyToAll, setApplyToAll] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [explicitLocationKeys, setExplicitLocationKeys] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<SkillAction | null>(null);
  const enableGroupCount = groupPlacementsByPath(getActionablePlacements(skill, "enable"), "enable").length;
  const disableGroupCount = groupPlacementsByPath(getActionablePlacements(skill, "disable"), "disable").length;
  const isMenuDisabled = !skill.manageable;
  const disabledReason =
    skill.scope === "inside_project"
      ? "InsideTheProject skills are read-only and cannot be managed here."
      : "This skill is read-only and cannot be managed.";

  const actionablePlacements = confirmAction ? getActionablePlacements(skill, confirmAction) : [];
  const actionableGroups = confirmAction
    ? groupPlacementsByPath(actionablePlacements, confirmAction)
    : [];
  const linkedSelection = deriveLinkedSelection(actionableGroups, explicitLocationKeys);
  const selectedLocationKeys = applyToAll
    ? actionableGroups.map((group) => group.key)
    : linkedSelection.effectiveKeys;
  const autoSelectedLocationKeys = applyToAll
    ? []
    : linkedSelection.autoSelectedKeys.filter(
        (key) => !explicitLocationKeys.includes(key),
      );
  const selectedCount = selectedLocationKeys.length;
  const selectedPlacementIds = applyToAll
    ? actionableGroups.flatMap((group) =>
        group.placements.map((placement) => placement.id),
      )
    : flattenGroupPlacementIds(actionableGroups, selectedLocationKeys);
  const selectedPlacementIdSet = new Set(selectedPlacementIds);
  const selectedActionablePlacements = actionablePlacements.filter((placement) =>
    selectedPlacementIdSet.has(placement.id),
  );
  const canConfirm = selectedCount > 0;
  const confirmCopy = confirmAction
    ? buildConfirmCopy(
        confirmAction,
        selectedCount,
        actionableGroups.length,
        selectedActionablePlacements,
      )
    : null;
  const isBusy = pendingAction !== null;

  useEffect(() => {
    if (!confirmAction) {
      return;
    }
    const nextKeys = groupPlacementsByPath(
      getActionablePlacements(skill, confirmAction),
      confirmAction,
    ).map(
      (group) => group.key,
    );
    setApplyToAll(nextKeys.length > 1);
    setDetailsOpen(nextKeys.length <= 1);
    setExplicitLocationKeys(nextKeys.length > 1 ? [] : nextKeys);
  }, [confirmAction, skill]);

  const resetPopover = () => {
    setOpen(false);
    setConfirmAction(null);
    setApplyToAll(true);
    setDetailsOpen(false);
    setExplicitLocationKeys([]);
  };

  const refreshSkill = async () => {
    const next = await skillsApi.get(skill.scope, skill.id);
    await onUpdated?.(next);
  };

  const toggleLocation = (locationKey: string, checked: boolean) => {
    setExplicitLocationKeys((current) => {
      if (checked) {
        if (current.includes(locationKey)) {
          return current;
        }
        return [...current, locationKey];
      }
      return current.filter((key) => key !== locationKey);
    });
  };

  const handleSetEnabled = async (enabled: boolean, placementIds?: string[]) => {
    const action = enabled ? "enable" : "disable";
    setPendingAction(action);
    try {
      await skillsApi.setEnabled(skill.id, enabled, placementIds);
      await refreshSkill();
      resetPopover();
      toastManager.add({
        title: enabled ? "Skill enabled" : "Skill disabled",
        description: skill.title || skill.name,
        type: "success",
      });
    } catch (error) {
      toastManager.add({
        title: enabled ? "Enable failed" : "Disable failed",
        description: error instanceof Error ? error.message : "Please try again.",
        type: "error",
      });
    } finally {
      setPendingAction(null);
    }
  };

  const handleDelete = async (placementIds: string[] | undefined, deletingAll: boolean) => {
    setPendingAction("delete");
    try {
      await skillsApi.delete(skill.id, placementIds);
      resetPopover();

      if (deletingAll) {
        await onDeleted?.(skill.id);
      } else {
        try {
          await refreshSkill();
        } catch {
          await onDeleted?.(skill.id);
        }
      }

      toastManager.add({
        title: "Skill deleted",
        description: skill.title || skill.name,
        type: "success",
      });
    } catch (error) {
      toastManager.add({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Please try again.",
        type: "error",
      });
    } finally {
      setPendingAction(null);
    }
  };

  const handleConfirm = async () => {
    if (!confirmAction || !canConfirm) {
      return;
    }

    const placementIds =
      selectedCount === actionableGroups.length ? undefined : selectedPlacementIds;
    const allLocationsSelected = selectedCount === actionableGroups.length;

    if (confirmAction === "enable") {
      await handleSetEnabled(true, placementIds);
      return;
    }
    if (confirmAction === "disable") {
      await handleSetEnabled(false, placementIds);
      return;
    }
    await handleDelete(placementIds, allLocationsSelected);
  };

  const popoverWidthClass = !confirmAction
    ? "w-44"
    : actionableGroups.length > 1
      ? detailsOpen
        ? "w-[32rem]"
        : "w-72"
      : "w-80";
  const triggerButton = (
    <Button
      variant="ghost"
      size="icon"
      onClick={(event) => event.stopPropagation()}
      className={cn("size-8 cursor-pointer rounded-lg", className)}
      disabled={isBusy || isMenuDisabled}
      title="Manage skill"
    >
      {isBusy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <MoreHorizontal className="size-4" />
      )}
    </Button>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (isBusy) {
          return;
        }
        setOpen(nextOpen);
        if (!nextOpen) {
          resetPopover();
        }
      }}
    >
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              {isMenuDisabled ? (
                triggerButton
              ) : (
                <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
              )}
            </span>
          </TooltipTrigger>
          {isMenuDisabled ? (
            <TooltipContent side="top">
              <p className="text-xs">{disabledReason}</p>
            </TooltipContent>
          ) : null}
        </Tooltip>
      </TooltipProvider>
      <PopoverContent
        align="end"
        className={cn(
          "overflow-hidden p-3 transition-[width] duration-200 ease-out",
          popoverWidthClass,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {confirmCopy ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{confirmCopy.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {confirmCopy.description}
              </p>
            </div>

            {actionableGroups.length > 1 ? (
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={applyToAll}
                    disabled={isBusy}
                    onCheckedChange={(checked) => {
                      const nextChecked = checked === true;
                      setApplyToAll(nextChecked);
                      if (!nextChecked) {
                        setDetailsOpen(true);
                      }
                    }}
                  />
                  <span className="text-sm font-medium text-foreground">
                    Apply to all locations ({actionableGroups.length})
                  </span>
                </label>

                <div className="overflow-hidden rounded-xl border border-border bg-background">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "w-full cursor-pointer justify-between rounded-none bg-transparent px-3",
                      detailsOpen ? "border-b border-border" : "",
                    )}
                    onClick={() => setDetailsOpen((current) => !current)}
                  >
                    <span className="text-sm text-foreground">
                      {applyToAll
                        ? `Review locations (${actionableGroups.length})`
                        : `Choose locations (${selectedCount}/${actionableGroups.length})`}
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-4 text-muted-foreground transition-transform duration-200",
                        detailsOpen ? "rotate-180" : "",
                      )}
                    />
                  </Button>

                  <div
                    className={cn(
                      "overflow-hidden transition-[max-height,opacity] duration-200 ease-out",
                      detailsOpen ? "max-h-80 opacity-100" : "max-h-0 opacity-0",
                    )}
                  >
                    {!applyToAll ? (
                      <div className="max-h-56 space-y-2 overflow-y-auto p-2">
                      {actionableGroups.map((group) => (
                        <label
                          key={group.key}
                          className={cn(
                            "flex items-start gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2",
                            autoSelectedLocationKeys.includes(group.key)
                              ? "cursor-not-allowed"
                              : "cursor-pointer",
                          )}
                        >
                          <Checkbox
                            checked={selectedLocationKeys.includes(group.key)}
                            disabled={isBusy || autoSelectedLocationKeys.includes(group.key)}
                            onCheckedChange={(checked) =>
                              toggleLocation(group.key, checked === true)
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {formatGroupTitle(group)}
                              </span>
                                {isUnifiedGroup(group, confirmAction!) ? (
                                <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-blue-600 dark:text-blue-400">
                                  Unified
                                </span>
                              ) : null}
                              {(() => {
                                const EntryKindIcon = entryKindIcon(group.entryKind);
                                return (
                                  <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                    <EntryKindIcon className="size-3" />
                                    {group.entryKind}
                                  </span>
                                );
                              })()}
                            </div>
                            <TruncatedPath
                              value={formatPlacementPath(group.placements[0], confirmAction!)}
                              className="mt-1 text-[11px] text-foreground"
                            />
                              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                {formatGroupMeta(group, confirmAction!)}
                              </p>
                              {group.symlinkTarget ? (
                              <TruncatedPath
                                value={`Target: ${group.symlinkTarget}`}
                                className="mt-1 text-[11px] text-muted-foreground"
                              />
                            ) : null}
                            {autoSelectedLocationKeys.includes(group.key) ? (
                              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                                Included automatically because its target is selected.
                              </p>
                            ) : null}
                          </div>
                        </label>
                      ))}
                      </div>
                    ) : (
                      <div className="max-h-40 space-y-2 overflow-y-auto p-2">
                      {actionableGroups.map((group) => (
                        <div
                          key={group.key}
                          className="rounded-lg border border-border bg-muted/20 px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {formatGroupTitle(group)}
                            </span>
                              {isUnifiedGroup(group, confirmAction!) ? (
                                <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-blue-600 dark:text-blue-400">
                                  Unified
                                </span>
                              ) : null}
                            {(() => {
                              const EntryKindIcon = entryKindIcon(group.entryKind);
                              return (
                                <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                  <EntryKindIcon className="size-3" />
                                  {group.entryKind}
                                </span>
                              );
                            })()}
                          </div>
                          <TruncatedPath
                            value={formatPlacementPath(group.placements[0], confirmAction!)}
                            className="mt-1 text-[11px] text-foreground"
                          />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : actionableGroups[0] ? (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {formatGroupTitle(actionableGroups[0])}
                  </p>
                  {isUnifiedGroup(actionableGroups[0], confirmAction!) ? (
                    <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-blue-600 dark:text-blue-400">
                      Unified
                    </span>
                  ) : null}
                  {(() => {
                    const EntryKindIcon = entryKindIcon(actionableGroups[0].entryKind);
                    return (
                      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <EntryKindIcon className="size-3" />
                        {actionableGroups[0].entryKind}
                      </span>
                    );
                  })()}
                </div>
                <TruncatedPath
                  value={formatPlacementPath(actionableGroups[0].placements[0], confirmAction!)}
                  className="mt-1 text-[11px] text-foreground"
                />
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {formatGroupMeta(actionableGroups[0], confirmAction!)}
                </p>
                {actionableGroups[0].symlinkTarget ? (
                  <TruncatedPath
                    value={`Target: ${actionableGroups[0].symlinkTarget}`}
                    className="mt-1 text-[11px] text-muted-foreground"
                  />
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                No skill locations are available for this action.
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="cursor-pointer"
                disabled={isBusy}
                onClick={() => setConfirmAction(null)}
              >
                Back
              </Button>
              <Button
                variant={confirmCopy.confirmVariant}
                size="sm"
                className="cursor-pointer"
                disabled={isBusy || !canConfirm}
                onClick={() => void handleConfirm()}
              >
                {isBusy ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
                {confirmCopy.confirmLabel}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {skill.can_toggle && enableGroupCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-full cursor-pointer justify-start text-foreground hover:bg-accent hover:text-foreground"
                onClick={() => setConfirmAction("enable")}
              >
                <Eye className="size-4" />
                Enable ({enableGroupCount})
              </Button>
            ) : null}
            {skill.can_toggle && disableGroupCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-full cursor-pointer justify-start text-foreground hover:bg-accent hover:text-foreground"
                onClick={() => setConfirmAction("disable")}
              >
                <EyeOff className="size-4" />
                Disable ({disableGroupCount})
              </Button>
            ) : null}
            {skill.can_delete ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-full cursor-pointer justify-start text-foreground hover:bg-accent hover:text-destructive"
                onClick={() => setConfirmAction("delete")}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : null}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
