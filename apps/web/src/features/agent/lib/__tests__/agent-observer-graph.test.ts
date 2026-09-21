// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";

import type { AgentActivity } from "@atmos/api-types/ws/dto/events";
import type { AgentStatusRecord } from "@/features/agent/store/agent-status-store";
import type { Project } from "@/shared/types/domain";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildObserverGraph,
  sessionFromActivity,
  toolLineText,
} from "../agent-observer-graph";
import {
  canNavigateToAgentStatusSession,
  resolveAgentStatusNavigationTarget,
} from "../agent-status-navigation";
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

function session(partial: Partial<AgentStatusRecord>): AgentStatusRecord {
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

  it("keeps live subagents visible while turn rows stay folded until expand", () => {
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
    expect(collapsed.nodes.some((n) => n.id === "child:lead:c1")).toBe(true);
    expect(collapsed.nodes.find((n) => n.id === "agent:lead")?.visibleTurns).toEqual([]);
    expect(collapsed.nodes.find((n) => n.id === "agent:lead")?.childCount).toBe(1);

    const expanded = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1" })],
      activity: [record],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(["agent:lead"]),
    });
    expect(expanded.nodes.some((n) => n.id === "child:lead:c1")).toBe(true);
    const child = expanded.nodes.find((n) => n.id === "child:lead:c1");
    expect(child?.occupancy).toBe("running");
    expect(child?.label).toBe("Explore");
    expect(child?.session?.session_id).toBe("lead");
    expect(child?.child?.child_id).toBe("c1");
    expect(expanded.edges.some((e) => e.source === "agent:lead" && e.target === "child:lead:c1" && e.kind === "spawn")).toBe(
      true,
    );
    expect(expanded.nodes.find((n) => n.id === "agent:lead")?.visibleTurns[0]?.prompt).toBe(
      "one",
    );
    expect(child?.currentToolLine).toBeUndefined();
  });

  it("shows the child live tool on the subagent card", () => {
    const record = activity({
      session_id: "lead",
      context_id: "w1",
      last_state: "running",
      turns: [
        {
          turn_id: 1,
          prompt: "explore",
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
          current_tool: {
            name: "read_file",
            detail: "lib.rs",
            state: "pending",
            started_at: "t",
            repeat: 1,
          },
          recent_tools: [],
          started_at: "t",
          last_event_at: "t",
        },
      ],
    });
    const graph = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1", state: "running" })],
      activity: [record],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    expect(graph.nodes.find((n) => n.id === "child:lead:c1")?.currentToolLine).toBe(
      "read_file lib.rs",
    );
    expect(graph.nodes.find((n) => n.id === "agent:lead")?.currentToolLine).toBeUndefined();
  });

  it("uses the pending turn tool as the live step when current_tool is empty", () => {
    const record = activity({
      session_id: "lead",
      last_state: "running",
      turns: [
        {
          turn_id: 1,
          prompt: "fix overlay",
          started_at: "t",
          tools: [
            {
              name: "Read",
              detail: "observer-flow.tsx",
              state: "pending",
              started_at: "t",
              repeat: 1,
            },
          ],
          todos: [],
          spawned_child_ids: [],
        },
      ],
    });
    expect(toolLineText(record)).toBe("Read observer-flow.tsx");
    const graph = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1", state: "running" })],
      activity: [record],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    expect(graph.nodes.find((n) => n.id === "agent:lead")?.currentToolLine).toBe(
      "Read observer-flow.tsx",
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
    expect(graph.nodes.find((n) => n.id === "workspace:w1")?.descendantCount).toBe(1);
  });

  it("counts nested descendant cards and hides them when an agent is folded", () => {
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
    const open = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1" })],
      activity: [record],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    expect(open.nodes.find((n) => n.id === "workspace:w1")?.descendantCount).toBe(2);
    expect(open.nodes.find((n) => n.id === "agent:lead")?.descendantCount).toBe(1);
    expect(open.nodes.find((n) => n.id === "project:p1")?.descendantCount).toBe(3);

    const folded = buildObserverGraph({
      projects,
      sessions: [session({ session_id: "lead", context_id: "w1" })],
      activity: [record],
      collapsedIds: new Set(["agent:lead"]),
      expandedAgentIds: new Set(),
    });
    expect(folded.nodes.some((n) => n.id === "child:lead:c1")).toBe(false);
    expect(folded.nodes.find((n) => n.id === "agent:lead")?.descendantCount).toBe(1);
    expect(folded.edges.some((e) => e.target === "child:lead:c1")).toBe(false);
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
    expect(canNavigateToAgentStatusSession(asSession)).toBe(true);
    expect(resolveAgentStatusNavigationTarget(asSession)).toEqual(
      resolveAgentStatusNavigationTarget(liveSession),
    );
    expect(resolveAgentStatusNavigationTarget(asSession)).toEqual({
      contextId: "w1",
      spaceId: DEFAULT_CENTER_SPACE_ID,
      surface: "terminal",
      chatId: null,
      isSideChat: true,
      sideChatId: "side-1",
      tmuxWindowName: "3",
    });
  });

  it("keeps Agent Chat nodes jumpable after the occupancy row is gone", () => {
    const record = activity({
      session_id: "chat:abc",
      context_id: "w1",
      pane_id: "chat:abc",
      surface: "chat",
      surface_id: "abc",
      space_id: "main",
      last_state: "idle",
      turns: [
        {
          turn_id: 1,
          prompt: "fix footer",
          started_at: "t",
          tools: [],
          todos: [],
          spawned_child_ids: [],
        },
      ],
    });
    const graph = buildObserverGraph({
      projects,
      sessions: [],
      activity: [record],
      collapsedIds: new Set(),
      expandedAgentIds: new Set(),
    });
    const node = graph.nodes.find((n) => n.id === "agent:chat:abc");
    expect(node?.chat).toBe(true);
    const asSession = sessionFromActivity(record);
    expect(resolveAgentStatusNavigationTarget(asSession)).toEqual({
      contextId: "w1",
      spaceId: "main",
      surface: "chat",
      chatId: "abc",
      isSideChat: false,
      sideChatId: null,
      tmuxWindowName: null,
    });
  });

  it("wires Open pane on the Observer view to the shipped pane navigator", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../components/observer/AgentObserverView.tsx"),
      "utf8",
    );
    expect(source).toContain(
      'import { navigateToAgentStatusSession } from "@/features/agent/lib/agent-status-navigation"',
    );
    expect(source).toContain("navigateToAgentStatusSession(session, router, projects)");
    expect(source).toContain("OBSERVER_NODE_TYPES");
    expect(source).toContain("ObserverDrawer");
    expect(source).toContain("ControlButton");
    expect(source).toContain("resetLayout");
    expect(source).toContain("dragHandle");
    expect(source).toContain("ProjectEmpty");
    expect(source).toContain('variant="Minimal"');
    expect(source).toContain("IconActivity");
    expect(source).toContain("installAll");
    expect(source).toContain("getStatus");
    expect(source).toContain("ObserverInstallHooksButton");
    expect(source).toContain("ObserverNewChatPicker");
    expect(source).toContain("docsAction=");
    expect(source).toContain("createAction=");
    expect(source).not.toContain("setAgentChatOpen");
    expect(source).not.toContain("useAgentChatUrl");
    expect(source).not.toContain("panelTitle");
    expect(source).not.toContain("<aside");
    expect(source).not.toContain("relayout");
    const install = readFileSync(
      join(import.meta.dir, "../../components/observer/ObserverInstallHooksButton.tsx"),
      "utf8",
    );
    expect(install).toContain("summarizeAgentHookInstall");
    expect(install).toContain("TooltipTrigger");
    expect(install).toContain("installHooksMissing");
    expect(install).toContain("hooksInstalled");
  });

  it("swaps the header glyph for a drag handle and shows folded descendant counts", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../components/observer/observer-flow.tsx"),
      "utf8",
    );
    expect(source).toContain("observer-drag-handle");
    expect(source).toContain("GripVertical");
    expect(source).toContain("descendantCount");
    expect(source).toContain("is-exiting");
    expect(source).toContain("pathLength={1}");
  });
});

describe("product name", () => {
  it("uses Agent Observer as the user-visible label", async () => {
    const en = await import("../../../../../messages/en.json");
    expect(en.AgentObserver.title).toBe("Agent Observer");
    expect(en.AgentObserver.empty).toBe(
      "Agents appear here when a terminal agent hook fires or an Agent Chat turn runs.",
    );
    expect(en.AgentObserver.installHooks).toBe("Install {count} hooks");
    expect(en.AgentObserver.hooksInstalled).toBe("{count} hooks installed");
    expect(en.AgentObserver.recentWorkspacesHint).toBe("Recent 5 workspaces");
    expect(en.AgentObserver.resetLayout).toBe("Reset layout");
    expect(en.settings.layoutSection.launchpad.items.agentObserver.title).toBe(
      "Agent Observer",
    );
    expect(LAUNCHPAD_ITEM_IDS).toContain("agent-observer");
  });
});
