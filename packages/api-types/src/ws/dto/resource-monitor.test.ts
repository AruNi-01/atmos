import { describe, expect, test } from "bun:test";
import type { WsEmpty } from "./common";
import type { WsOutput } from "../contract";
import type { WsEventPayload } from "../event-contract";
import type {
  ResourceMonitorSnapshot,
  ResourceProcessMetrics,
  ResourceProjectMetrics,
  ResourceSessionMetrics,
  ResourceWorkspaceMetrics,
} from "./resource-monitor";

type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];
type AssertNever<T extends never> = T;
type Same<A, B> = A extends B ? (B extends A ? true : false) : false;
type AssertTrue<T extends true> = T;

type _ProcessRequired = AssertNever<OptionalKeys<ResourceProcessMetrics>>;
type _SessionProcessesRequired = AssertNever<
  Extract<OptionalKeys<ResourceSessionMetrics>, "processes">
>;
type _WorkspaceOtherRequired = AssertNever<
  Extract<OptionalKeys<ResourceWorkspaceMetrics>, "other_usage" | "other_processes">
>;
type _ProjectOtherRequired = AssertNever<
  Extract<OptionalKeys<ResourceProjectMetrics>, "other_usage" | "other_processes">
>;
type _PortsAreNumbers = AssertTrue<Same<ResourceProcessMetrics["ports"], number[]>>;
type _GetSnapshot = AssertTrue<
  Same<WsOutput<"resource_monitor_get">, ResourceMonitorSnapshot>
>;
type _SubscribeSnapshot = AssertTrue<
  Same<WsOutput<"resource_monitor_subscribe">, ResourceMonitorSnapshot>
>;
type _UnsubscribeEmpty = AssertTrue<
  Same<WsOutput<"resource_monitor_unsubscribe">, WsEmpty>
>;
type _UpdatedSnapshot = AssertTrue<
  Same<WsEventPayload<"resource_monitor_updated">, ResourceMonitorSnapshot>
>;

const usage = { cpu_percent: 1.5, memory_rss_bytes: 20, process_count: 2 };

function processMetrics(): ResourceProcessMetrics {
  return {
    name: "node",
    usage,
    ports: [3000, 4173],
  };
}

describe("@atmos/api-types resource-monitor dto", () => {
  test("process metrics expose name, usage, and ports number[]", () => {
    const process = processMetrics();
    expect(Object.keys(process).sort()).toEqual(["name", "ports", "usage"]);
    expect(process.name).toBe("node");
    expect(process.usage).toEqual(usage);
    expect(process.ports).toEqual([3000, 4173]);
    expect(process.ports.every((port) => typeof port === "number")).toBe(true);
  });

  test("session, workspace, and project require process fields", () => {
    const session: ResourceSessionMetrics = {
      session_id: "s1",
      name: null,
      terminal_kind: "simple",
      usage,
      processes: [processMetrics()],
    };
    const workspace: ResourceWorkspaceMetrics = {
      workspace_id: "w1",
      name: "Workspace",
      usage,
      sessions: [session],
      other_usage: usage,
      other_processes: [processMetrics()],
    };
    const project: ResourceProjectMetrics = {
      project_id: "p1",
      name: "Project",
      usage,
      direct_usage: usage,
      workspaces: [workspace],
      sessions: [session],
      other_usage: usage,
      other_processes: [processMetrics()],
    };
    const snapshot: ResourceMonitorSnapshot = {
      collected_at_ms: 1,
      host: {
        cpu_percent: 0,
        memory_used_bytes: 0,
        memory_total_bytes: 0,
        logical_cpu_count: 1,
      },
      server: usage,
      shared_runtime: usage,
      projects: [project],
      unattributed: usage,
      attribution_status: "complete",
    };

    expect(session.processes[0]?.ports).toEqual([3000, 4173]);
    expect(workspace.other_usage).toEqual(usage);
    expect(workspace.other_processes).toHaveLength(1);
    expect(project.other_usage).toEqual(usage);
    expect(project.other_processes[0]?.name).toBe("node");
    expect(snapshot.projects[0]?.sessions[0]?.processes).toHaveLength(1);
  });
});
