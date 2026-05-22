"use client";

import React from "react";
import { Button, cn, Skeleton } from "@workspace/ui";
import type { RegistryAgent, CustomAgent } from "@/api/ws-api";
import {
  Github,
  Loader2,
  Search,
  Trash2,
  ArrowDownToLine,
  CircleFadingArrowUp,
  Terminal,
  Pencil,
} from "lucide-react";
import { AgentIcon } from "./AgentIcon";
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
  onInstall: (registryId: string, forceOverwrite?: boolean) => void;
  onRemoveRequest: (info: { registryId: string; name: string }) => void;
}

export const AgentCard = React.memo<AgentCardProps>(function AgentCard({
  item,
  index,
  installingRegistryIds,
  removingRegistryId,
  onInstall,
  onRemoveRequest,
}) {
  const isInstalling = installingRegistryIds.has(item.id);

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
          <div className="size-10 rounded-xl border border-border/50 bg-muted/20 flex items-center justify-center overflow-hidden shrink-0 group-hover:bg-primary/5 transition-colors">
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
              {item.installed &&
                item.installed_version &&
                needsUpdate(item.installed_version, item.version) && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                    (v{item.installed_version} installed)
                  </span>
                )}
            </div>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors",
            !item.installed
              ? "border-primary/20 bg-primary/10 text-primary"
              : item.installed_version &&
                  needsUpdate(item.installed_version, item.version)
                ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          )}
        >
          {!item.installed
            ? "Available"
            : item.installed_version &&
                needsUpdate(item.installed_version, item.version)
              ? "Update Available"
              : "Installed"}
        </span>
      </div>

      <p className="mt-4 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground text-pretty">
        {item.description}
      </p>

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
                className="inline-flex size-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer transition-colors"
                title="Open Git repository"
                aria-label={`Open ${item.name} repository`}
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
                  Installing
                </>
              ) : (
                <>
                  <ArrowDownToLine className="mr-1 size-3.5" />
                  Install
                </>
              )}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              {item.installed_version &&
                needsUpdate(item.installed_version, item.version) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void onInstall(item.id, true)}
                    disabled={isInstalling}
                    className="h-8 rounded-lg px-3 text-xs bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/50 transition-all"
                  >
                    {isInstalling ? (
                      <>
                        <Loader2 className="mr-1 size-3 animate-spin" />
                        Updating
                      </>
                    ) : (
                      <>
                        <CircleFadingArrowUp className="mr-1 size-3" />
                        Upgrade
                      </>
                    )}
                  </Button>
                )}
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  onRemoveRequest({ registryId: item.id, name: item.name })
                }
                disabled={removingRegistryId === item.id}
                className="h-8 rounded-lg px-4 text-xs bg-muted/50 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 border-transparent transition-all"
              >
                {removingRegistryId === item.id ? (
                  <>
                    <Loader2 className="mr-1 size-3 animate-spin" />
                    Removing
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-1 size-3.5" />
                    Remove
                  </>
                )}
              </Button>
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
  onEdit: (agent: CustomAgent) => void;
  onRemoveRequest: (info: { name: string }) => void;
}

export const CustomAgentCard = React.memo<CustomAgentCardProps>(
  function CustomAgentCard({
    agent,
    index,
    removingCustomName,
    onEdit,
    onRemoveRequest,
  }) {
    return (
      <motion.div
        key={`custom-${agent.name}`}
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2, delay: index * 0.03, ease: "easeOut" }}
        className="group relative flex min-h-[188px] flex-col rounded-xl border border-border/60 bg-transparent p-5 transition-all duration-200 hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex items-center gap-3">
            <div className="size-10 rounded-xl border border-border/50 bg-muted/20 flex items-center justify-center overflow-hidden shrink-0 group-hover:bg-primary/5 transition-colors">
              <Terminal className="size-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-foreground tracking-tight">
                {agent.name}
              </h3>
              <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                {agent.command} {agent.args.join(" ")}
              </p>
            </div>
          </div>
          <span className="rounded-full border border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400 px-2.5 py-0.5 text-[10px] font-medium">
            Custom
          </span>
        </div>

        <p className="mt-4 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground text-pretty">
          {agent.command} {agent.args.join(" ")}
        </p>

        {Object.keys(agent.env).length > 0 && (
          <div className="mt-3 flex max-h-12 flex-wrap gap-1.5 overflow-hidden">
            {Object.entries(agent.env).map(([key, value]) => (
              <span
                key={key}
                className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground font-mono"
              >
                {key}={value}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto">
          <div className="h-px bg-border/40 mt-4" />
          <div className="flex items-center justify-end gap-2 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(agent)}
              disabled={removingCustomName === agent.name}
              className="h-8 rounded-lg px-4 text-xs border-border/60 bg-background opacity-0 pointer-events-none translate-x-1 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:translate-x-0 focus-visible:opacity-100 focus-visible:pointer-events-auto focus-visible:translate-x-0 hover:bg-muted/50 transition-all"
            >
              <Pencil className="mr-1 size-3.5" />
              Edit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onRemoveRequest({ name: agent.name })}
              disabled={removingCustomName === agent.name}
              className="h-8 rounded-lg px-4 text-xs bg-muted/50 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 border-transparent transition-all"
            >
              {removingCustomName === agent.name ? (
                <>
                  <Loader2 className="mr-1 size-3 animate-spin" />
                  Removing
                </>
              ) : (
                <>
                  <Trash2 className="mr-1 size-3.5" />
                  Remove
                </>
              )}
            </Button>
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
}) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="flex flex-col items-center justify-center py-24 text-center"
  >
    <div className="size-16 rounded-3xl bg-muted/20 flex items-center justify-center mb-4">
      <Search className="size-8 text-muted-foreground/30" />
    </div>
    <h3 className="text-base font-medium text-foreground">No agents found</h3>
    <p className="mt-1 text-sm text-muted-foreground max-w-[280px] text-pretty">
      {message}
    </p>
    {query && (
      <Button variant="link" onClick={onClearSearch} className="mt-4">
        Clear search filter
      </Button>
    )}
  </motion.div>
);

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
