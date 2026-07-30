"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { GitBranch, Loader2, Play, Square, Workflow } from "lucide-react";
import { Button } from "@workspace/ui/components/ui/button";
import { cn } from "@workspace/ui/lib/utils";

import {
  composeRoleHeader,
  roleAccentClass,
  type OrchRole,
} from "../lib/role-chrome";

type RunRow = {
  id: string;
  goal: string;
  status: string;
  mode?: string | null;
  requested_mode?: string;
  stop_reason?: string | null;
  home_cwd?: string;
  locked_spec_version?: number | null;
};

/**
 * Orchestrator management surface (APP-048).
 * Emil craft: restrained motion (transform/opacity, ease-out, reduced-motion safe),
 * clear hierarchy, no decorative ease-in bounce.
 */
export function OrchestratorPage() {
  const t = useTranslations("Orchestrator");
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Stringish>(null);
  const [goal, setGoal] = useState("");
  const [mode, setMode] = useState<"auto" | "loop" | "graph">("loop");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<RunRow | null>(null);
  const [skillHint, setSkillHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/orchestrator/v1/runs?limit=30", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const list = (body?.data?.runs ?? body?.runs ?? []) as RunRow[];
      setRuns(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copyAgentInstructions = async () => {
    try {
      const res = await fetch("/api/orchestrator/v1/skill-dir", {
        credentials: "include",
      });
      const body = await res.json();
      const data = body?.data ?? body;
      const text =
        data?.prompt ??
        `Read the Atmos Orchestrator skill and use atmos orchestrator CLI.\n${data?.skill_dir ?? ""}`;
      await navigator.clipboard.writeText(text);
      setSkillHint(t("copiedSkill"));
      window.setTimeout(() => setSkillHint(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const createRun = async () => {
    if (!goal.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/orchestrator/v1/runs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: goal.trim(),
          requested_mode: mode,
          target_kind: "standalone",
          home_cwd: undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      setGoal("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const cancelRun = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/orchestrator/v1/runs/${id}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const demoRoles = useMemo(
    () =>
      (
        [
          ["orchestrator", "Codex", null],
          ["criteria", "Codex", null],
          ["maker", "Codex", "iter 1"],
          ["verify", "Codex", null],
        ] as const
      ).map(([role, agent, instance]) => ({
        role: role as OrchRole,
        header: composeRoleHeader({
          role: role as OrchRole,
          agentDisplay: agent,
          instance,
          activity: role === "criteria" ? "waiting_user" : "active",
        }),
      })),
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-opacity duration-200 ease-out">
            <Workflow className="size-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              {t("title")}
            </h1>
            <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {skillHint ? (
            <span className="text-xs text-muted-foreground transition-opacity duration-200 ease-out">
              {skillHint}
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copyAgentInstructions()}
          >
            {t("copyAgentInstructions")}
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-h-0 overflow-y-auto p-6">
          <section className="mb-8 rounded-xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-medium">{t("newRun")}</h2>
            <textarea
              className="mb-3 min-h-[88px] w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background transition-[box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={t("goalPlaceholder")}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
            />
            <div className="mb-3 flex flex-wrap gap-2">
              {(["loop", "graph", "auto"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150 ease-out",
                    mode === m
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t(`mode.${m}`)}
                </button>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              disabled={busy || !goal.trim()}
              onClick={() => void createRun()}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              <span className="ml-1.5">{t("create")}</span>
            </Button>
            {error ? (
              <p className="mt-3 text-xs text-destructive" role="alert">
                {String(error)}
              </p>
            ) : null}
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium">{t("history")}</h2>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t("loading")}
              </div>
            ) : runs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
                <GitBranch className="mx-auto mb-3 size-8 text-muted-foreground/60" />
                <p className="text-sm font-medium">{t("emptyTitle")}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("emptyBody")}
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {runs.map((run) => (
                  <li key={run.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(run)}
                      className={cn(
                        "flex w-full items-start justify-between rounded-xl border border-border bg-card px-4 py-3 text-left transition-[background-color,border-color] duration-150 ease-out hover:bg-muted/40",
                        selected?.id === run.id && "border-primary/40 bg-muted/30",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{run.goal}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {run.mode ?? run.requested_mode} · {run.status}
                          {run.stop_reason ? ` · ${run.stop_reason}` : ""}
                        </p>
                        {run.home_cwd ? (
                          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/80">
                            {run.home_cwd}
                          </p>
                        ) : null}
                      </div>
                      {run.status === "running" ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            void cancelRun(run.id);
                          }}
                          aria-label={t("cancel")}
                        >
                          <Square className="size-3.5" />
                        </Button>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>

        <aside className="hidden min-h-0 border-l border-border bg-muted/20 p-4 lg:block">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("roleChromePreview")}
          </h2>
          <ul className="space-y-2">
            {demoRoles.map((r) => (
              <li
                key={r.role}
                className={cn(
                  "rounded-lg border border-border border-l-4 px-3 py-2 text-xs transition-opacity duration-200 ease-out",
                  roleAccentClass(r.role),
                )}
              >
                <span className="font-medium">{r.header}</span>
              </li>
            ))}
          </ul>
          {selected ? (
            <div className="mt-6 rounded-lg border border-border bg-card p-3 text-xs">
              <p className="font-medium">{t("selectedRun")}</p>
              <p className="mt-1 break-all text-muted-foreground">{selected.id}</p>
              <p className="mt-2 text-muted-foreground">
                Spec v{selected.locked_spec_version ?? "—"}
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

type Stringish = string | null;
