// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import type { AgentActivity } from "@atmos/api-types/ws/dto/events";
import type { AgentHookSession } from "@/features/agent/store/agent-hooks-store";
import type { Project } from "@/shared/types/domain";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildObserverGraph,
  sessionFromActivity,
} from "../agent-observer-graph";
import {
  canNavigateToAgentHookSession,
  resolveAgentHookNavigationTarget,
} from "../agent-hook-navigation";
import { DEFAULT_CENTER_SPACE_ID } from "@/app-shell/center-space/center-space";
import { LAUNCHPAD_ITEM_IDS } from "@/features/settings/lib/launchpad-items";

function project(id: string, name: string, workspaces: Array<{ id: string; name: string }>): Project {
  return {
    id,
    name,
    isOpen: true,
    workspaces: workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      branch: w.name,
    })) as Project["workspaces"],
    mainFilePath: `/tmp/${name}`,
    sidebarOrder: 0,
    borderColor: null,
    logoPath: null,
  };
}

function session(partial: Partial<AgentHookSession>): AgentHookSession {
  return {
    session_id: "s1",
    tool: "claude-code",
    state: "running",
    timestamp: "2026-08-27T00:00:00Z",
    ...partial,
  };
}

function activity(partial: Partial<AgentActivity> & { session_id: string }): AgentActivity {
  return {
    tool: "claude-code",
    last_state: "idle",
    todos: [],
    children: [],
    turns: [],
    turns_omitted: 0,
    started_at: "2026-08-27T00:00:00Z",
    last_event_at: "2026-08-27T00:00:00Z",
    ...partial,
  };
}

const projects = [
  project("p1", "App", [
    { id: "w1", name: "feat" },
    { id: "w2", name: "main" },
  ]),
];

describe("buildObserverGraph", () => {
  it("places two agents under one workspace as siblings", () => {
    const graph = buildObserverGraph({
      projects,
      sessions: [
        session({ session_id: "a", context_id: "w1" }),
        session({ session_id: "b", context_id: "w1", tool: "codex" }),
      ],
      activity: [],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    const ids = graph.nodes.map((n) => n.id);
    expect(ids).toContain("atmos");
    expect(ids).toContain("project:p1");
    expect(ids).toContain("workspace:w1");
    expect(ids).toContain("agent:a");
    expect(ids).toContain("agent:b");
    const agentParents = graph.nodes
      .filter((n) => n.kind === "agent")
      .map((n) => n.parentId);
    expect(agentParents).toEqual(["workspace:w1", "workspace:w1"]);
  });

  it("falls back to Unassigned when bind is unknown", () => {
    const graph = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "x", context_id: "missing", project_path: "/nope" })],
      activity: [],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    expect(graph.nodes.some((n) => n.id === "project:unassigned")).toBe(true);
    expect(graph.nodes.find((n) => n.id === "agent:x")?.parentId).toBe("project:unassigned");
  });

  it("keeps activity-with-turns when the session row is gone", () => {
    const graph = buildObserverGraph({
      projects,
      sessions: [],
      activity: [
        activity({
          session_id: "kept",
          context_id: "w1",
          last_state: "idle",
          turns: [
            {
              turn_id: 1,
              prompt: "fix footer",
              started_at: "2026-08-27T00:00:00Z",
              tools: [],
              todos: [],
              spawned_child_ids: [],
            },
          ],
        }),
      ],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    const agent = graph.nodes.find((n) => n.id === "agent:kept");
    expect(agent).toBeTruthy();
    expect(agent?.session?.state).toBe("idle");
    expect(agent?.latestPrompt).toBe("fix footer");
    expect(agent?.parentId).toBe("workspace:w1");
  });

  it("hides subagents and turn rows until the agent is expanded", () => {
    const record = activity({
      session_id: "lead",
      context_id: "w1",
      last_state: "running",
      turns: [
        {
          turn_id: 1,
          prompt: "one",
          started_at: "t",
          tools: [],
          todos: [],
          spawned_child_ids: ["c1"],
        },
      ],
      children: [
        {
          child_id: "c1",
          name: "Explore",
          state: "running",
          recent_tools: [],
          started_at: "t",
          last_event_at: "t",
        },
      ],
    });
    const collapsed = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1" })],
      activity: [record],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    expect(collapsed.nodes.some((n) => n.kind === "subagent")).toBe(false);
    expect(collapsed.nodes.find((n) => n.id === "agent:lead")?.visibleTurns).toEqual([]);

    const expanded = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1" })],
      activity: [record],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(["agent:lead"]),
    });
    expect(expanded.nodes.some((n) => n.id === "child:lead:c1")).toBe(true);
    expect(expanded.nodes.find((n) => n.id === "agent:lead")?.visibleTurns[0]?.prompt).toBe(
      "one",
    );
  });

  it("omits agents when a workspace is collapsed", () => {
    const graph = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "a", context_id: "w1" })],
      activity: [],
      collapsedIds: new Set(["workspace:w1"]),
      expandedAgentIds: new Set(),
    });
    expect(graph.nodes.some((n) => n.id === "agent:a")).toBe(false);
  });
});

describe("Observer pane jump", () => {
  it("uses the same navigation target as hook-session pane jump, including side chat", () => {
    const record = activity({
      session_id: "side",
      context_id: "w1",
      pane_id: "w1:side-1",
      source_pane_id: "w1:3",
      side_chat_id: "side-1",
      terminal_kind: "side_chat",
      last_state: "idle",
      turns: [
        {
          turn_id: 1,
          prompt: "ask",
          started_at: "t",
          tools: [],
          todos: [],
          spawned_child_ids: [],
        },
      ],
    });
    const asSession = sessionFromActivity(record);
    const liveSession = session({
      session_id: "side",
      context_id: "w1",
      pane_id: "w1:side-1",
      source_pane_id: "w1:3",
      side_chat_id: "side-1",
      terminal_kind: "side_chat",
    });
    expect(canNavigateToAgentHookSession(asSession)).toBe(true);
    expect(resolveAgentHookNavigationTarget(asSession)).toEqual(
      resolveAgentHookNavigationTarget(liveSession),
    );
    expect(resolveAgentHookNavigationTarget(asSession)).toEqual({
      contextId: "w1",
      spaceId: DEFAULT_CENTER_SPACE_ID,
      isSideChat: true,
      sideChatId: "side-1",
      tmuxWindowName: "3",
    });
  });

  it("wires Open pane on the Observer view to the shipped pane navigator", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../components/observer/AgentObserverView.tsx"),
      "utf8",
    );
    expect(source).toContain(
      'import { navigateToAgentHookSessionPane } from "@/features/agent/lib/agent-hook-navigation"',
    );
    expect(source).toContain("navigateToAgentHookSessionPane(session, router, projects)");
  });
});

describe("product name", () => {
  it("uses Agent Observer as the user-visible label", async () => {
    const en = await import("../../../../../messages/en.json");
    expect(en.AgentObserver.title).toBe("Agent Observer");
    expect(en.settings.layoutSection.launchpad.items.agentObserver.title).toBe(
      "Agent Observer",
    );
    expect(LAUNCHPAD_ITEM_IDS).toContain("agent-observer");
  });
});
