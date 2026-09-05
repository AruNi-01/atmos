"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, cn, Skeleton, Switch } from "@workspace/ui";
import type { RegistryAgent, CustomAgent, NativeChatAgent } from "@/api/ws-api";
import {
  Loader2,
  Search,
  Trash2,
  ArrowDownToLine,
  CircleFadingArrowUp,
  Pencil,
} from "lucide-react";
import { Github } from "@workspace/ui/components/icons/lucide-brand-icons";
import { AgentIcon } from "./AgentIcon";
import { customAgentDisplayName, isSecretEnvKey } from "@/features/agent/lib/custom-agent-registry";
import { motion } from "motion/react";

export function needsUpdate(
  installedVersion: string,
  latestVersion: string,
): boolean {
  const parseVersion = (v: string): number[] => {
    const clean = v.replace(/^v/i, "");
    const parts = clean.split(".").map((p) => {
      const num = parseInt(p, 10);
      return isNaN(num) ? 0 : num;
    });
    while (parts.length < 3) {
      parts.push(0);
    }
    return parts;
  };

  const [installedMajor, installedMinor, installedPatch] =
    parseVersion(installedVersion);
  const [latestMajor, latestMinor, latestPatch] =
    parseVersion(latestVersion);

  if (installedMajor !== latestMajor) return installedMajor < latestMajor;
  if (installedMinor !== latestMinor) return installedMinor < latestMinor;
  return installedPatch < latestPatch;
}

/* ------------------------------------------------------------------ */

export interface AgentCardProps {
  item: RegistryAgent;
  index: number;
  installingRegistryIds: Set<string>;
  removingRegistryId: string | null;
  /** When this ACP row shares a family with a Native Chat host. */
  nativeSibling?: NativeChatAgent | null;
  onInstall: (registryId: string, forceOverwrite?: boolean) => void;
  onRemoveRequest: (info: { registryId: string; name: string }) => void;
}

export const AgentCard = React.memo<AgentCardProps>(function AgentCard({
  item,
  index,
  installingRegistryIds,
  removingRegistryId,
  nativeSibling = null,
  onInstall,
  onRemoveRequest,
}) {
  const t = useTranslations("Agent.components");
  const isInstalling = installingRegistryIds.has(item.id);
  const preferNativeHint = Boolean(nativeSibling);

  return (
    <motion.div
      key={item.id}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2, delay: index * 0.03, ease: "easeOut" }}
      className={cn(
        "group relative flex min-h-[188px] flex-col rounded-xl border p-5 transition-all duration-200 hover:shadow-md",
        item.installed
          ? "bg-transparent border-border/60"
          : "bg-background border-border/60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          <div className="size-10 rounded-xl border border-border/50 bg-muted/20 flex items-center justify-center overflow-hidden shrink-0 group-hover:bg-primary/5">
            <AgentIcon
              registryId={item.id}
              name={item.name}
              isCustom={item.install_method === "custom"}
              registryIcon={item.icon}
            />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground tracking-tight">
              {item.name}
            </h3>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-xs text-muted-foreground/70 tabular-nums">
                v{item.version}
              </p>
              {item.can_remove !== false &&
                item.installed &&
                item.installed_version &&
                needsUpdate(item.installed_version, item.version) && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                    {t("managerCards.installedVersion", { version: item.installed_version })}
                  </span>
                )}
            </div>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-[10px] font-medium",
            !item.installed
              ? "border-primary/20 bg-primary/10 text-primary"
              : item.can_remove !== false &&
                  item.installed_version &&
                  needsUpdate(item.installed_version, item.version)
                ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          )}
        >
          {!item.installed
            ? t("managerCards.status.available")
            : item.can_remove !== false &&
                item.installed_version &&
                needsUpdate(item.installed_version, item.version)
              ? t("managerCards.status.updateAvailable")
              : item.provision_kind === "native" && item.can_remove === false
                ? t("managerCards.status.usingInstalledCli")
                : t("managerCards.status.installed")}
        </span>
      </div>

      <p className="mt-4 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground text-pretty">
        {item.description}
      </p>

      {preferNativeHint ? (
        <p className="mt-2 text-xs leading-relaxed text-sky-700 dark:text-sky-400 text-pretty">
          {nativeSibling?.enabled
            ? t("managerCards.preferNative.alreadyEnabled", {
                name: nativeSibling.name,
              })
            : t("managerCards.preferNative.recommend", {
                name: nativeSibling?.name ?? item.name,
              })}
        </p>
      ) : null}

      <div className="mt-auto">
        <div className="h-px bg-border/40 mt-4" />
        <div className="flex items-center justify-between gap-3 pt-3">
          <div className="flex items-center gap-2">
            {item.repository ? (
              <button
                onClick={() =>
                  window.open(
                    item.repository!,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
                className="inline-flex size-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer"
                title={t("managerCards.repositoryTitle")}
                aria-label={t("managerCards.repositoryAria", { name: item.name })}
              >
                <Github className="size-4" />
              </button>
            ) : (
              <div className="size-8" />
            )}
          </div>

          {!item.installed ? (
            <Button
              size="sm"
              onClick={() => void onInstall(item.id)}
              disabled={isInstalling}
              className="h-8 rounded-lg px-4"
            >
              {isInstalling ? (
                <>
                  <Loader2 className="mr-1 size-3 animate-spin" />
                  {t("managerCards.actions.installing")}
                </>
              ) : (
                <>
                  <ArrowDownToLine className="mr-1 size-3.5" />
                  {t("managerCards.actions.install")}
                </>
              )}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              {item.can_remove !== false &&
                item.installed_version &&
                needsUpdate(item.installed_version, item.version) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void onInstall(item.id, true)}
                    disabled={isInstalling}
                    className="h-8 rounded-lg px-3 text-xs bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/50"
                  >
                    {isInstalling ? (
                      <>
                        <Loader2 className="mr-1 size-3 animate-spin" />
                        {t("managerCards.actions.updating")}
                      </>
                    ) : (
                      <>
                        <CircleFadingArrowUp className="mr-1 size-3" />
                        {t("managerCards.actions.upgrade")}
                      </>
                    )}
                  </Button>
                )}
              {item.can_remove !== false ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    onRemoveRequest({ registryId: item.id, name: item.name })
                  }
                  disabled={removingRegistryId === item.id}
                  className="h-8 rounded-lg px-4 text-xs bg-muted/50 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 border-transparent"
                >
                  {removingRegistryId === item.id ? (
                    <>
                      <Loader2 className="mr-1 size-3 animate-spin" />
                      {t("managerCards.actions.removing")}
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-1 size-3.5" />
                      {t("common.remove")}
                    </>
                  )}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
});

/* ------------------------------------------------------------------ */

export interface CustomAgentCardProps {
  agent: CustomAgent;
  index: number;
  removingCustomName: string | null;
  preloading?: boolean;
  enablingPending?: boolean;
  onEdit: (agent: CustomAgent) => void;
  onRemoveRequest: (info: { name: string }) => void;
  onEnabledChange?: (agent: CustomAgent, enabled: boolean) => void;
}

export const CustomAgentCard = React.memo<CustomAgentCardProps>(
  function CustomAgentCard({
    agent,
    index,
    removingCustomName,
    preloading = false,
    enablingPending = false,
    onEdit,
    onRemoveRequest,
    onEnabledChange,
  }) {
    const t = useTranslations("Agent.components");
    return (
      <motion.div
        key={`custom-${agent.name}`}
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2, delay: index * 0.03, ease: "easeOut" }}
        className={cn(
          "group relative flex min-h-[188px] flex-col rounded-xl border border-border/60 bg-transparent p-5 transition-all duration-200 hover:shadow-md",
          agent.builtin && !agent.enabled && "opacity-80",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex items-center gap-3">
            <div className="size-10 rounded-xl border border-border/50 bg-muted/20 flex items-center justify-center overflow-hidden shrink-0 group-hover:bg-primary/5">
              <AgentIcon
                registryId={agent.name}
                name={customAgentDisplayName(agent)}
                isCustom={!agent.builtin}
              />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-foreground tracking-tight">
                {customAgentDisplayName(agent)}
              </h3>
              <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                {agent.command} {agent.args.join(" ")}
              </p>
            </div>
          </div>
          <span className="rounded-full border border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400 px-2.5 py-0.5 text-[10px] font-medium">
            {agent.builtin ? t("managerCards.status.builtin") : t("managerCards.status.custom")}
          </span>
        </div>

        <p className="mt-4 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          {agent.description?.trim() || `${agent.command} ${agent.args.join(" ")}`}
        </p>

        {Object.keys(agent.env).length > 0 && (
          <div className="mt-3 flex max-h-12 flex-wrap gap-1.5 overflow-hidden">
            {Object.entries(agent.env).map(([key, value]) => (
              <span
                key={key}
                className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground font-mono"
              >
                {key}={isSecretEnvKey(key) ? "••••" : value}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto">
          <div className="h-px bg-border/40 mt-4" />
          <div className="flex items-center justify-end gap-2 pt-3">
            {agent.builtin && onEnabledChange ? (
              <div className="mr-auto flex min-w-0 items-center gap-2">
                <Switch
                  checked={agent.enabled === true}
                  disabled={enablingPending || removingCustomName === agent.name}
                  onCheckedChange={(checked) => onEnabledChange(agent, !!checked)}
                  aria-label={t("managerCards.actions.enable")}
                />
                {preloading ? (
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3 shrink-0 animate-spin" />
                    <span className="truncate">{t("managerCards.actions.preloading")}</span>
                  </span>
                ) : null}
              </div>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(agent)}
              disabled={removingCustomName === agent.name}
              className="h-8 rounded-lg px-4 text-xs border-border/60 bg-background opacity-0 pointer-events-none translate-x-1 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:translate-x-0 focus-visible:opacity-100 focus-visible:pointer-events-auto focus-visible:translate-x-0 hover:bg-muted/50 transition-[opacity,transform]"
            >
              <Pencil className="mr-1 size-3.5" />
              {t("common.edit")}
            </Button>
            {(!agent.builtin || agent.has_overlay) ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onRemoveRequest({ name: agent.name })}
              disabled={removingCustomName === agent.name}
              className="h-8 rounded-lg px-4 text-xs bg-muted/50 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 border-transparent"
            >
              {removingCustomName === agent.name ? (
                <>
                  <Loader2 className="mr-1 size-3 animate-spin" />
                  {t("managerCards.actions.removing")}
                </>
              ) : (
                <>
                  <Trash2 className="mr-1 size-3.5" />
                  {t("common.remove")}
                </>
              )}
            </Button>
            ) : null}
          </div>
        </div>
      </motion.div>
    );
  },
);

/* ------------------------------------------------------------------ */

export interface NativeAgentCardProps {
  agent: NativeChatAgent;
  index: number;
  enablingPending?: boolean;
  onEnabledChange: (agent: NativeChatAgent, enabled: boolean) => void;
}

function nativeDescriptionKey(id: string):
  | "managerCards.native.description.claude"
  | "managerCards.native.description.codex"
  | "managerCards.native.description.opencode"
  | "managerCards.native.description.pi"
  | "managerCards.native.description.grok"
  | null {
  switch (id) {
    case "claude":
      return "managerCards.native.description.claude";
    case "codex":
      return "managerCards.native.description.codex";
    case "opencode":
      return "managerCards.native.description.opencode";
    case "pi":
      return "managerCards.native.description.pi";
    case "grok":
      return "managerCards.native.description.grok";
    default:
      return null;
  }
}

export const NativeAgentCard = React.memo<NativeAgentCardProps>(
  function NativeAgentCard({
    agent,
    index,
    enablingPending = false,
    onEnabledChange,
  }) {
    const t = useTranslations("Agent.components");
    const descriptionKey = nativeDescriptionKey(agent.id);
    return (
      <motion.div
        key={`native-${agent.id}`}
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2, delay: index * 0.03, ease: "easeOut" }}
        className={cn(
          "group relative flex min-h-[188px] flex-col rounded-xl border border-border/60 bg-transparent p-5 transition-all duration-200 hover:shadow-md",
          !agent.enabled && "opacity-80",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex items-center gap-3">
            <div className="size-10 rounded-xl border border-border/50 bg-muted/20 flex items-center justify-center overflow-hidden shrink-0 group-hover:bg-primary/5">
              <AgentIcon registryId={agent.id} name={agent.name} />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-foreground tracking-tight">
                {agent.name}
              </h3>
              <p className="text-xs text-muted-foreground/70 truncate mt-0.5 font-mono">
                {agent.executable}
              </p>
            </div>
          </div>
          <span className="rounded-full border border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400 px-2.5 py-0.5 text-[10px] font-medium">
            {t("managerCards.status.native")}
          </span>
        </div>

        <p className="mt-4 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          {descriptionKey ? t(descriptionKey) : agent.description}
        </p>
        <p className={cn(
          "mt-2 text-xs",
          agent.cli_present ? "text-muted-foreground/80" : "text-amber-600 dark:text-amber-400",
        )}>
          {agent.cli_present
            ? t("managerCards.native.cliFound")
            : t("managerCards.native.cliMissing")}
        </p>

        <div className="mt-auto">
          <div className="h-px bg-border/40 mt-4" />
          <div className="flex items-center justify-end gap-2 pt-3">
            <div className="mr-auto flex min-w-0 items-center gap-2">
              <Switch
                checked={agent.enabled}
                disabled={enablingPending}
                onCheckedChange={(checked) => onEnabledChange(agent, !!checked)}
                aria-label={t("managerCards.actions.enable")}
              />
            </div>
          </div>
        </div>
      </motion.div>
    );
  },
);

/* ------------------------------------------------------------------ */

export interface AgentEmptyStateProps {
  message: string;
  query: string;
  onClearSearch: () => void;
}

export const AgentEmptyState: React.FC<AgentEmptyStateProps> = ({
  message,
  query,
  onClearSearch,
}) => {
  const t = useTranslations("Agent.components");

  return (
    <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="flex flex-col items-center justify-center py-24 text-center"
  >
    <div className="size-16 rounded-3xl bg-muted/20 flex items-center justify-center mb-4">
      <Search className="size-8 text-muted-foreground/30" />
    </div>
    <h3 className="text-base font-medium text-foreground">{t("managerCards.emptyState.title")}</h3>
    <p className="mt-1 text-sm text-muted-foreground max-w-[280px] text-pretty">
      {message}
    </p>
    {query && (
      <Button variant="link" onClick={onClearSearch} className="mt-4">
        {t("managerCards.emptyState.clearSearch")}
      </Button>
    )}
  </motion.div>
  );
};

/* ------------------------------------------------------------------ */

export const AgentSkeletonGrid: React.FC = () => (
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
    {[...Array(6)].map((_, i) => (
      <div
        key={i}
        className="rounded-xl border border-border bg-transparent p-5 space-y-4"
      >
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
        <div className="mt-auto">
          <div className="h-px bg-border/40 mt-4" />
          <div className="flex items-center justify-between pt-3">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
        </div>
      </div>
    ))}
  </div>
);
