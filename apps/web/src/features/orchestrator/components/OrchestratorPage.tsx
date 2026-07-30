"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  GitBranch,
  Loader2,
  Play,
  Square,
  Workflow,
} from "lucide-react";
import { Button } from "@workspace/ui/components/ui/button";
import { cn } from "@workspace/ui/lib/utils";

import {
  composeRoleHeader,
  roleAccentClass,
  type OrchRole,
  type RoleActivity,
} from "../lib/role-chrome";

type RunRow = {
  id: string;
  goal: string;
  status: string;
  mode?: string | null;
  requested_mode?: string;
  mode_reason?: string | null;
  stop_reason?: string | null;
  home_cwd?: string;
  locked_spec_version?: number | null;
  iterations_used?: number;
};

type LayoutIntent = "setup" | "run_loop" | "run_graph" | "hitl" | "review";

function intentFor(run: RunRow | null): LayoutIntent {
  if (!run) return "setup";
  if (run.status === "blocked_human" || run.status === "awaiting_spec_confirm") {
    return "hitl";
  }
  if (
    run.status === "completed" ||
    run.status === "failed" ||
    run.status === "cancelled" ||
    run.status === "interrupted"
  ) {
    return "review";
  }
  if (run.status === "running" && run.mode === "graph") return "run_graph";
  if (run.status === "running" || run.status === "spec_ready") return "run_loop";
  return "setup";
}

/**
 * Orchestrator management surface (APP-048).
 * Emil craft: short ease-out transitions, hierarchy, reduced-motion friendly.
 */
export function OrchestratorPage() {
  const t = useTranslations("Orchestrator");
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const [mode, setMode] = useState<"auto" | "loop" | "graph">("loop");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<RunRow | null>(null);
  const [skillHint, setSkillHint] = useState<string | null>(null);
  const [specJson, setSpecJson] = useState(() =>
    JSON.stringify(
      {
        goal_summary: "",
        risk_tier: "low",
        acceptance: [
          {
            id: "c1",
            description: "true sensor",
            kind: "sensor",
            required: true,
            sensor: {
              argv: ["true"],
              pass_exit_codes: [0],
              timeout_ms: 5000,
            },
            immutable_paths: [],
            sole_source: "sensor",
          },
        ],
        rejection: [],
        judgment_order: ["sensor", "llm_judge", "human"],
      },
      null,
      2,
    ),
  );
  const [rolesLive, setRolesLive] = useState<
    Array<{ role: OrchRole; instance?: string; activity: RoleActivity }>
  >([
    { role: "orchestrator", activity: "queued" },
    { role: "criteria", activity: "queued" },
    { role: "maker", instance: "iter 0", activity: "queued" },
    { role: "verify", activity: "queued" },
  ]);

  const intent = intentFor(selected);

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
      if (selected) {
        const fresh = list.find((r) => r.id === selected.id);
        if (fresh) setSelected(fresh);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selected) return;
    if (selected.status === "running") {
      setRolesLive([
        { role: "maker", instance: `iter ${selected.iterations_used ?? 0}`, activity: "active" },
        { role: "verify", activity: "active" },
      ]);
    } else if (selected.status === "blocked_human" || selected.status === "awaiting_spec_confirm") {
      setRolesLive([{ role: "criteria", activity: "waiting_user" }]);
    } else if (selected.status === "completed") {
      setRolesLive([
        { role: "maker", activity: "succeeded" },
        { role: "verify", activity: "succeeded" },
      ]);
    }
  }, [selected]);

  const api = async (path: string, init?: RequestInit) => {
    const res = await fetch(path, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      ...init,
    });
    const text = await res.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    if (!res.ok) {
      throw new Error(typeof body === "string" ? body : JSON.stringify(body));
    }
    return body as { data?: unknown };
  };

  const copyAgentInstructions = async () => {
    try {
      const body = await api("/api/orchestrator/v1/skill-dir");
      const data = (body?.data ?? body) as { prompt?: string; skill_dir?: string };
      const text =
        data?.prompt ??
        `Read the Atmos Orchestrator skill.\n${data?.skill_dir ?? ""}`;
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
      const body = await api("/api/orchestrator/v1/runs", {
        method: "POST",
        body: JSON.stringify({
          goal: goal.trim(),
          requested_mode: mode,
          target_kind: "standalone",
        }),
      });
      const run = (body?.data ?? body) as RunRow;
      setGoal("");
      setSelected(run);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const draftSpec = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = JSON.parse(specJson) as Record<string, unknown>;
      if (!parsed.goal_summary) parsed.goal_summary = selected.goal;
      await api(`/api/orchestrator/v1/runs/${selected.id}/spec/draft`, {
        method: "POST",
        body: JSON.stringify(parsed),
      });
      await load();
      setRolesLive([{ role: "criteria", activity: "succeeded" }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmSpec = async () => {
    if (!selected?.locked_spec_version && selected?.locked_spec_version !== 0) {
      // after draft, version is 1 typically — fetch run
    }
    if (!selected) return;
    setBusy(true);
    try {
      const version = selected.locked_spec_version ?? 1;
      await api(`/api/orchestrator/v1/runs/${selected.id}/spec/confirm`, {
        method: "POST",
        body: JSON.stringify({ version }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const startRun = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const body = await api(`/api/orchestrator/v1/runs/${selected.id}/start`, {
        method: "POST",
        body: "{}",
      });
      const run = (body?.data ?? body) as RunRow;
      setSelected(run);
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
      await api(`/api/orchestrator/v1/runs/${id}/cancel`, {
        method: "POST",
        body: "{}",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runStrip = useMemo(() => {
    if (!selected) return [] as Array<{ id: string; label: string; state: string }>;
    if (selected.mode === "graph") {
      return [
        { id: "1", label: "Maker A", state: selected.status === "completed" ? "done" : "pending" },
        { id: "2", label: "Join", state: selected.status === "failed" ? "failed" : "pending" },
        { id: "3", label: "Verify", state: selected.status === "completed" ? "done" : "pending" },
        { id: "4", label: "Spec", state: selected.stop_reason === "spec_met" ? "done" : "pending" },
      ];
    }
    return [
      {
        id: "i",
        label: `Loop iter ${selected.iterations_used ?? 0}`,
        state: selected.status === "running" ? "active" : selected.status,
      },
      {
        id: "s",
        label: `Spec v${selected.locked_spec_version ?? "—"}`,
        state: selected.locked_spec_version ? "done" : "pending",
      },
    ];
  }, [selected]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-opacity duration-200 ease-out">
            <Workflow className="size-4" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">{t("title")}</h1>
            <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {skillHint ? (
            <span className="text-xs text-muted-foreground transition-opacity duration-200 ease-out">
              {skillHint}
            </span>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={() => void copyAgentInstructions()}>
            {t("copyAgentInstructions")}
          </Button>
        </div>
      </header>

      {/* HITL strip (M22) */}
      {intent === "hitl" && selected ? (
        <div
          className="flex items-center justify-between border-b border-amber-500/40 bg-amber-500/10 px-6 py-3 transition-colors duration-200 ease-out"
          role="status"
        >
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            {t("hitlTitle")} · {selected.status}
          </p>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void confirmSpec()}>
              {t("confirmSpec")}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Run strip */}
      {selected && (intent === "run_loop" || intent === "run_graph" || intent === "review") ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-2">
          {runStrip.map((step) => (
            <span
              key={step.id}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors duration-150 ease-out",
                step.state === "done" || step.state === "completed"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                  : step.state === "failed"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : step.state === "active" || step.state === "running"
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          ))}
          {selected.mode_reason ? (
            <span className="text-[11px] text-muted-foreground truncate max-w-[40%]">
              {selected.mode_reason}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main className="min-h-0 overflow-y-auto p-6 space-y-6">
          {/* Setup */}
          <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-medium">{t("newRun")}</h2>
            <textarea
              className="mb-3 min-h-[72px] w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-[box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-ring"
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
            <Button type="button" size="sm" disabled={busy || !goal.trim()} onClick={() => void createRun()}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
              <span className="ml-1.5">{t("create")}</span>
            </Button>
          </section>

          {/* Spec editor for selected run */}
          {selected ? (
            <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-medium">{t("specTitle")}</h2>
              <p className="mb-2 font-mono text-[10px] text-muted-foreground">{selected.id}</p>
              <textarea
                className="mb-3 min-h-[140px] w-full resize-y rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs outline-none transition-[box-shadow] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-ring"
                value={specJson}
                onChange={(e) => setSpecJson(e.target.value)}
                spellCheck={false}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void draftSpec()}>
                  {t("draftSpec")}
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void confirmSpec()}>
                  {t("confirmSpec")}
                </Button>
                <Button type="button" size="sm" disabled={busy} onClick={() => void startRun()}>
                  <Play className="size-3.5" />
                  <span className="ml-1.5">{t("startRun")}</span>
                </Button>
                {selected.status === "running" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => void cancelRun(selected.id)}
                  >
                    <Square className="size-3.5" />
                    <span className="ml-1.5">{t("cancel")}</span>
                  </Button>
                ) : null}
              </div>
              {selected.stop_reason ? (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-3.5" />
                  {selected.status} · {selected.stop_reason}
                </p>
              ) : null}
            </section>
          ) : null}

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
                <p className="mt-1 text-xs text-muted-foreground">{t("emptyBody")}</p>
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
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </main>

        <aside className="hidden min-h-0 border-l border-border bg-muted/20 p-4 lg:block">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("roleChromePreview")}
          </h2>
          <ul className="space-y-2">
            {rolesLive.map((r) => (
              <li
                key={`${r.role}-${r.instance ?? ""}`}
                className={cn(
                  "rounded-lg border border-border border-l-4 px-3 py-2 text-xs transition-opacity duration-200 ease-out",
                  roleAccentClass(r.role),
                )}
                data-orch-role={r.role}
                data-orch-activity={r.activity}
              >
                <span className="font-medium">
                  {composeRoleHeader({
                    role: r.role,
                    agentDisplay: "Codex",
                    instance: r.instance,
                    activity: r.activity,
                  })}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">{t("roleChromeHint")}</p>
        </aside>
      </div>
    </div>
  );
}
