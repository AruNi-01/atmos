"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  cn,
  EmptyAction,
  IconDiscovery,
  IconPlus,
  IconSearch,
  Skeleton,
  Switch,
} from "@workspace/ui";
import type { RegistryAgent, CustomAgent, NativeChatAgent } from "@/api/ws-api";
import { Loader2, Trash2, ArrowDownToLine, CircleFadingArrowUp, Pencil } from "lucide-react";
import { Github } from "@workspace/ui/components/icons/lucide-brand-icons";
import { AgentIcon } from "./AgentIcon";
import {
  acpManagerCardShowsEnableSwitch,
  customAgentDisplayName,
  isSecretEnvKey,
  registryAgentEnabled,
} from "@/features/agent/lib/custom-agent-registry";
import { motion } from "motion/react";
import { PageEmptyState } from "@/shared/components/PageEmptyState";

export function needsUpdate(installedVersion: string, latestVersion: string): boolean {
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

  const [installedMajor, installedMinor, installedPatch] = parseVersion(installedVersion);
  const [latestMajor, latestMinor, latestPatch] = parseVersion(latestVersion);

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
  enablingPending?: boolean;
  onInstall: (registryId: string, forceOverwrite?: boolean) => void;
  onRemoveRequest: (info: { registryId: string; name: string }) => void;
  onEnabledChange?: (item: RegistryAgent, enabled: boolean) => void;
}

export const AgentCard = React.memo<AgentCardProps>(function AgentCard({
  item,
  index,
  installingRegistryIds,
  removingRegistryId,
  nativeSibling = null,
  enablingPending = false,
  onInstall,
  onRemoveRequest,
  onEnabledChange,
}) {
  const t = useTranslations("Agent.components");
  const isInstalling = installingRegistryIds.has(item.id);
  const preferNativeHint = Boolean(nativeSibling);
  const showEnableSwitch = Boolean(onEnabledChange) && acpManagerCardShowsEnableSwitch(item);
  const enabled = registryAgentEnabled(item);
  const canRemove = item.installed && item.can_remove !== false;
  const canUpgrade =
    canRemove &&
    Boolean(item.installed_version) &&
    needsUpdate(item.installed_version!, item.version);

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
        item.installed ? "border-border/60 bg-transparent" : "border-border/60 bg-background",
        item.installed && !enabled && "opacity-80",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-muted/20 group-hover:bg-primary/5">
            <AgentIcon
              registryId={item.id}
              name={item.name}
              isCustom={item.install_method === "custom"}
              registryIcon={item.icon}
            />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <h3 className="min-w-0 truncate text-sm font-semibold tracking-tight text-foreground">
                {item.name}
              </h3>
              {item.repository ? (
                <button
                  type="button"
                  onClick={() => window.open(item.repository!, "_blank", "noopener,noreferrer")}
                  className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  title={t("managerCards.repositoryTitle")}
                  aria-label={t("managerCards.repositoryAria", { name: item.name })}
                >
                  <Github className="size-3.5" />
                </button>
              ) : null}
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="text-xs text-muted-foreground/70 tabular-nums">v{item.version}</p>
              {item.can_remove !== false &&
                item.installed &&
                item.installed_version &&
                needsUpdate(item.installed_version, item.version) && (
                  <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
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

      <p className="mt-4 line-clamp-2 text-[13px] leading-relaxed text-pretty text-muted-foreground">
        {item.description}
      </p>

      {preferNativeHint ? (
        <p className="mt-2 text-xs leading-relaxed text-pretty text-sky-700 dark:text-sky-400">
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
        <div className="mt-4 h-px bg-border/40" />
        <div className="flex items-center justify-between gap-3 pt-3">
          <div className="flex items-center gap-2">
            {canRemove ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onRemoveRequest({ registryId: item.id, name: item.name })}
                disabled={removingRegistryId === item.id}
                className="h-8 rounded-lg border-transparent bg-muted/50 px-4 text-xs hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
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
            {canUpgrade ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void onInstall(item.id, true)}
                disabled={isInstalling}
                className="h-8 rounded-lg border-blue-500/30 bg-blue-500/10 px-3 text-xs text-blue-600 hover:border-blue-500/50 hover:bg-blue-500/20 dark:text-blue-400"
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
            ) : null}
          </div>

          <div className="flex min-w-0 items-center justify-end gap-2">
            {showEnableSwitch ? (
              <>
                {isInstalling ? (
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="size-3 shrink-0 animate-spin" />
                    <span className="truncate">{t("managerCards.actions.installing")}</span>
                  </span>
                ) : null}
                <Switch
                  checked={enabled}
                  disabled={enablingPending || isInstalling}
                  onCheckedChange={(checked) => onEnabledChange?.(item, !!checked)}
                  aria-label={t("managerCards.actions.enable")}
                />
              </>
            ) : !item.installed ? (
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
            ) : null}
          </div>
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

export const CustomAgentCard = React.memo<CustomAgentCardProps>(function CustomAgentCard({
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
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-muted/20 group-hover:bg-primary/5">
            <AgentIcon
              registryId={agent.name}
              name={customAgentDisplayName(agent)}
              isCustom={!agent.builtin}
            />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">
              {customAgentDisplayName(agent)}
            </h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground/70">
              {agent.command} {agent.args.join(" ")}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400">
          {agent.builtin ? t("managerCards.status.builtin") : t("managerCards.status.custom")}
        </span>
      </div>

      <p className="mt-4 line-clamp-2 text-[13px] leading-relaxed text-pretty text-muted-foreground">
        {agent.description?.trim() || `${agent.command} ${agent.args.join(" ")}`}
      </p>

      {Object.keys(agent.env).length > 0 && (
        <div className="mt-3 flex max-h-12 flex-wrap gap-1.5 overflow-hidden">
          {Object.entries(agent.env).map(([key, value]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
            >
              {key}={isSecretEnvKey(key) ? "••••" : value}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto">
        <div className="mt-4 h-px bg-border/40" />
        <div className="flex items-center justify-between gap-3 pt-3">
          <div className="flex items-center gap-2">
            {!agent.builtin || agent.has_overlay ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onRemoveRequest({ name: agent.name })}
                disabled={removingCustomName === agent.name}
                className="h-8 rounded-lg border-transparent bg-muted/50 px-4 text-xs hover:border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(agent)}
              disabled={removingCustomName === agent.name}
              className="pointer-events-none h-8 translate-x-1 rounded-lg border-border/60 bg-background px-4 text-xs opacity-0 transition-[opacity,transform] group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100 hover:bg-muted/50 focus-visible:pointer-events-auto focus-visible:translate-x-0 focus-visible:opacity-100"
            >
              <Pencil className="mr-1 size-3.5" />
              {t("common.edit")}
            </Button>
          </div>
          {agent.builtin && onEnabledChange ? (
            <div className="flex min-w-0 items-center justify-end gap-2">
              {preloading ? (
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 shrink-0 animate-spin" />
                  <span className="truncate">{t("managerCards.actions.preloading")}</span>
                </span>
              ) : null}
              <Switch
                checked={agent.enabled === true}
                disabled={enablingPending || removingCustomName === agent.name}
                onCheckedChange={(checked) => onEnabledChange(agent, !!checked)}
                aria-label={t("managerCards.actions.enable")}
              />
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
});

/* ------------------------------------------------------------------ */

export interface NativeAgentCardProps {
  agent: NativeChatAgent;
  index: number;
  enablingPending?: boolean;
  onEnabledChange: (agent: NativeChatAgent, enabled: boolean) => void;
}

function nativeDescriptionKey(
  id: string,
):
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

export const NativeAgentCard = React.memo<NativeAgentCardProps>(function NativeAgentCard({
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
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-muted/20 group-hover:bg-primary/5">
            <AgentIcon registryId={agent.id} name={agent.name} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold tracking-tight text-foreground">
              {agent.name}
            </h3>
            <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground/70">
              {agent.executable}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-400">
          {t("managerCards.status.native")}
        </span>
      </div>

      <p className="mt-4 line-clamp-2 text-[13px] leading-relaxed text-pretty text-muted-foreground">
        {descriptionKey ? t(descriptionKey) : agent.description}
      </p>
      {!agent.cli_present && agent.enabled ? (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          {t("managerCards.native.cliMissing")}
        </p>
      ) : null}

      <div className="mt-auto">
        <div className="mt-4 h-px bg-border/40" />
        <div className="flex items-center justify-end gap-2 pt-3">
          <Switch
            checked={agent.enabled}
            disabled={enablingPending}
            onCheckedChange={(checked) => onEnabledChange(agent, !!checked)}
            aria-label={t("managerCards.actions.enable")}
          />
        </div>
      </div>
    </motion.div>
  );
});

/* ------------------------------------------------------------------ */

export interface AgentEmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  query?: string;
  onClearSearch?: () => void;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export const AgentEmptyState: React.FC<AgentEmptyStateProps> = ({
  title,
  description,
  icon,
  query,
  onClearSearch,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}) => {
  const t = useTranslations("Agent.components");
  const hasQuery = Boolean(query?.trim());
  const clearAction =
    hasQuery && onClearSearch ? (
      <EmptyAction emphasis="quiet" onClick={onClearSearch}>
        {t("managerCards.emptyState.clearSearch")}
      </EmptyAction>
    ) : null;
  const startActions =
    !hasQuery && (onPrimary || onSecondary) ? (
      <>
        {onPrimary && primaryLabel ? (
          <EmptyAction icon={<IconPlus />} onClick={onPrimary}>
            {primaryLabel}
          </EmptyAction>
        ) : null}
        {onSecondary && secondaryLabel ? (
          <EmptyAction emphasis="quiet" onClick={onSecondary}>
            {secondaryLabel}
          </EmptyAction>
        ) : null}
      </>
    ) : null;

  return (
    <PageEmptyState
      icon={hasQuery ? <IconSearch /> : (icon ?? <IconDiscovery />)}
      title={title}
      description={description}
      actions={clearAction ?? startActions}
    />
  );
};

/* ------------------------------------------------------------------ */

export const AgentSkeletonGrid: React.FC = () => (
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
    {[...Array(6)].map((_, i) => (
      <div key={i} className="space-y-4 rounded-xl border border-border bg-transparent p-5">
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
          <div className="mt-4 h-px bg-border/40" />
          <div className="flex items-center justify-between pt-3">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
        </div>
      </div>
    ))}
  </div>
);
