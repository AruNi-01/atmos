"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  cn,
  toastManager,
} from "@workspace/ui";
import { Loader2, Puzzle } from "lucide-react";
import {
  forceRefreshSkillsList,
  useInvalidateSkillsList,
} from "@/features/skills/hooks/use-skills-query";
import {
  skillsApi,
  type SkillInfo,
  type SkillScopeRoot,
} from "@/api/ws/skills-api";

export type ComposerSkillsContext = {
  mode: "project" | "workspace";
  id: string;
  name: string;
  path: string;
};

function sortSkills(skills: SkillInfo[]) {
  return [...skills].sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === "enabled") return -1;
      if (b.status === "enabled") return 1;
    }
    return a.name.localeCompare(b.name);
  });
}

function scopeLabel(
  skill: SkillInfo,
  t: ReturnType<typeof useTranslations>,
) {
  switch (skill.scope) {
    case "global":
      return t("scope.global");
    case "workspace":
      return t("scope.workspace");
    case "project":
      return t("scope.project");
    default:
      return skill.scope;
  }
}

export function ComposerSkillsControl({
  context,
  align = "end",
  className,
  triggerClassName,
}: {
  context: ComposerSkillsContext | null;
  align?: "start" | "center" | "end";
  className?: string;
  triggerClassName?: string;
}) {
  const t = useTranslations("skills.composerDisable");
  const invalidateSkillsList = useInvalidateSkillsList();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [skills, setSkills] = React.useState<SkillInfo[]>([]);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const scopeRoot = React.useMemo<SkillScopeRoot | undefined>(() => {
    if (!context) return undefined;
    return {
      scope: context.mode,
      id: context.id,
      name: context.name,
      path: context.path,
    };
  }, [context]);

  const loadSkills = React.useCallback(async () => {
    if (!context) {
      setSkills([]);
      return;
    }
    setLoading(true);
    try {
      if (context.mode === "workspace") {
        const [rootResult, listResult] = await Promise.all([
          skillsApi.scanRoot({
            scope: "workspace",
            id: context.id,
            name: context.name,
            path: context.path,
          }),
          skillsApi.list({ forceRefresh: true }),
        ]);
        const workplace = rootResult.skills.filter((skill) => skill.can_toggle);
        const globals = listResult.skills.filter(
          (skill) => skill.can_toggle && skill.scope === "global",
        );
        const byId = new Map<string, SkillInfo>();
        for (const skill of [...workplace, ...globals]) {
          byId.set(skill.id, skill);
        }
        setSkills(sortSkills([...byId.values()]));
      } else {
        const listResult = await skillsApi.list({ forceRefresh: true });
        setSkills(
          sortSkills(
            listResult.skills.filter(
              (skill) =>
                skill.can_toggle &&
                (skill.scope === "global" ||
                  (skill.scope === "project" && skill.project_id === context.id)),
            ),
          ),
        );
      }
    } catch (error) {
      console.error("Failed to load composer skills:", error);
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, [context]);

  React.useEffect(() => {
    if (!open) return;
    void loadSkills();
  }, [loadSkills, open]);

  const handleToggle = React.useCallback(
    async (skill: SkillInfo, enabled: boolean) => {
      setPendingId(skill.id);
      try {
        const root =
          skill.scope === "workspace" ||
          (context?.mode === "workspace" && skill.scope !== "global")
            ? scopeRoot
            : undefined;
        await skillsApi.setEnabled(skill.id, enabled, undefined, root);
        setSkills((current) =>
          sortSkills(
            current.map((item) =>
              item.id === skill.id
                ? {
                    ...item,
                    status: enabled ? "enabled" : "disabled",
                    placements: item.placements.map((placement) => ({
                      ...placement,
                      status: enabled ? "enabled" : "disabled",
                    })),
                  }
                : item,
            ),
          ),
        );
        invalidateSkillsList();
        if (skill.scope !== "workspace") {
          void forceRefreshSkillsList().catch(() => {});
        }
      } catch (error) {
        toastManager.add({
          title: enabled ? t("toasts.enableFailed") : t("toasts.disableFailed"),
          description: error instanceof Error ? error.message : t("toasts.tryAgain"),
          type: "error",
        });
        void loadSkills();
      } finally {
        setPendingId(null);
      }
    },
    [context?.mode, invalidateSkillsList, loadSkills, scopeRoot, t],
  );

  if (!context?.path) {
    return null;
  }

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground",
              triggerClassName,
            )}
            aria-label={t("triggerLabel")}
            title={t("triggerLabel")}
          >
            <Puzzle className="size-3.5" />
            <span className="hidden text-xs font-medium sm:inline">{t("triggerShort")}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align={align} className="w-[min(92vw,360px)] p-0" sideOffset={8}>
          <div className="border-b border-border/70 px-3 py-2.5">
            <p className="text-sm font-medium text-foreground">{t("title")}</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{t("sessionTip")}</p>
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5">
            {loading ? (
              <div className="flex items-center gap-2 px-2.5 py-3 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {t("loading")}
              </div>
            ) : skills.length === 0 ? (
              <div className="px-2.5 py-3 text-xs text-muted-foreground">{t("empty")}</div>
            ) : (
              skills.map((skill) => {
                const enabled = skill.status !== "disabled";
                const busy = pendingId === skill.id;
                return (
                  <div
                    key={skill.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm",
                          enabled ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        {skill.title || skill.name}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {scopeLabel(skill, t)}
                      </p>
                    </div>
                    <Switch
                      checked={enabled}
                      disabled={busy}
                      onCheckedChange={(checked) => {
                        void handleToggle(skill, checked);
                      }}
                      aria-label={
                        enabled
                          ? t("disableSkill", { name: skill.name })
                          : t("enableSkill", { name: skill.name })
                      }
                    />
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
