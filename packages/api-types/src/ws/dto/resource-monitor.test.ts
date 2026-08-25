import { describe, expect, test } from "bun:test";
import type { WsEmpty } from "./common";
import type { WsOutput } from "../contract";
import type { WsEventPayload } from "../event-contract";
import type {
  ResourceDiskMetrics,
  ResourceHostCpuCore,
  ResourceHostMemoryMetrics,
  ResourceHostMetrics,
  ResourceMemoryAccounting,
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
type _LeakedIsBoolean = AssertTrue<Same<ResourceProcessMetrics["leaked"], boolean>>;
type _KillLeakedOutput = AssertTrue<
  Same<WsOutput<"resource_monitor_kill_leaked">, { killed_count: number }>
>;
type _HostCoresMemoryRequired = AssertNever<
  Extract<OptionalKeys<ResourceHostMetrics>, "cores" | "memory">
>;
type _CoreFieldsRequired = AssertNever<OptionalKeys<ResourceHostCpuCore>>;
type _MemoryFieldsRequired = AssertNever<OptionalKeys<ResourceHostMemoryMetrics>>;
type _CachedNullable = AssertTrue<
  Same<ResourceHostMemoryMetrics["cached_bytes"], number | null>
>;
type _AccountingUnion = AssertTrue<
  Same<
    ResourceMemoryAccounting,
    | "btop_mach"
    | "linux_memavailable"
    | "windows_avail_phys"
    | "fallback_total_minus_available"
  >
>;
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
type _DiskFieldsRequired = AssertNever<OptionalKeys<ResourceDiskMetrics>>;
type _SnapshotDisksRequired = AssertNever<
  Extract<OptionalKeys<ResourceMonitorSnapshot>, "disks">
>;
type _DisksAreArray = AssertTrue<
  Same<ResourceMonitorSnapshot["disks"], ResourceDiskMetrics[]>
>;

const usage = { cpu_percent: 1.5, memory_rss_bytes: 20, process_count: 2 };

function processMetrics(): ResourceProcessMetrics {
  return {
    name: "node",
    usage,
    ports: [3000, 4173],
    leaked: false,
  };
}

function hostMemory(
  overrides: Partial<ResourceHostMemoryMetrics> = {},
): ResourceHostMemoryMetrics {
  return {
    total_bytes: 3,
    used_bytes: 2,
    available_bytes: 1,
    free_bytes: 1,
    cached_bytes: null,
    swap_total_bytes: 4,
    swap_used_bytes: 1,
    swap_free_bytes: 3,
    accounting: "linux_memavailable",
    ...overrides,
  };
}

function diskMetrics(
  overrides: Partial<ResourceDiskMetrics> = {},
): ResourceDiskMetrics {
  return {
    name: "root",
    mount_point: "/",
    total_bytes: 100,
    used_bytes: 40,
    available_bytes: 60,
    usage_percent: 40,
    removable: false,
    ...overrides,
  };
}

function hostMetrics(
  overrides: Partial<ResourceHostMetrics> = {},
): ResourceHostMetrics {
  const memory = overrides.memory ?? hostMemory();
  return {
    cpu_percent: 1.5,
    memory_used_bytes: memory.used_bytes,
    memory_total_bytes: memory.total_bytes,
    logical_cpu_count: 1,
    cores: [{ index: 0, cpu_percent: 1.5 }],
    memory,
    ...overrides,
  };
}

describe("@atmos/api-types resource-monitor dto", () => {
  test("process metrics expose name, usage, and ports number[]", () => {
    const process = processMetrics();
    expect(Object.keys(process).sort()).toEqual(["leaked", "name", "ports", "usage"]);
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
      disks: [diskMetrics()],
      host: hostMetrics({
        cpu_percent: 0,
        memory_used_bytes: 0,
        memory_total_bytes: 0,
        logical_cpu_count: 1,
        cores: [{ index: 0, cpu_percent: 0 }],
        memory: hostMemory({
          total_bytes: 0,
          used_bytes: 0,
          available_bytes: 0,
          free_bytes: 0,
          cached_bytes: null,
          swap_total_bytes: 0,
          swap_used_bytes: 0,
          swap_free_bytes: 0,
          accounting: "fallback_total_minus_available",
        }),
      }),
      server: usage,
      shared_runtime: usage,
      desktop_use: usage,
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
    expect(snapshot.host.cores).toHaveLength(1);
    expect(snapshot.host.memory.cached_bytes).toBeNull();
    expect(snapshot.host.memory.accounting).toBe(
      "fallback_total_minus_available",
    );
  });

  test("host cores, nullable cached, and accounting stay snake_case", () => {
    const cores: ResourceHostCpuCore[] = [
      { index: 0, cpu_percent: 10 },
      { index: 1, cpu_percent: 15 },
    ];
    const accountingValues: ResourceMemoryAccounting[] = [
      "btop_mach",
      "linux_memavailable",
      "windows_avail_phys",
      "fallback_total_minus_available",
    ];
    const host = hostMetrics({
      logical_cpu_count: 2,
      cores,
      memory: hostMemory({
        total_bytes: 100,
        used_bytes: 40,
        available_bytes: 60,
        free_bytes: 20,
        cached_bytes: null,
        swap_total_bytes: 50,
        swap_used_bytes: 10,
        swap_free_bytes: 40,
        accounting: "btop_mach",
      }),
    });

    expect(Object.keys(host).sort()).toEqual([
      "cores",
      "cpu_percent",
      "logical_cpu_count",
      "memory",
      "memory_total_bytes",
      "memory_used_bytes",
    ]);
    expect(Object.keys(host.cores[0] ?? {}).sort()).toEqual([
      "cpu_percent",
      "index",
    ]);
    expect(Object.keys(host.memory).sort()).toEqual([
      "accounting",
      "available_bytes",
      "cached_bytes",
      "free_bytes",
      "swap_free_bytes",
      "swap_total_bytes",
      "swap_used_bytes",
      "total_bytes",
      "used_bytes",
    ]);
    expect(host.cores).toEqual(cores);
    expect(host.cores).toHaveLength(host.logical_cpu_count);
    expect(host.memory_used_bytes).toBe(host.memory.used_bytes);
    expect(host.memory_total_bytes).toBe(host.memory.total_bytes);
    expect(host.memory.cached_bytes).toBeNull();
    expect(host.memory.accounting).toBe("btop_mach");
    expect(accountingValues).toContain(host.memory.accounting);
  });

  test("disk metrics require capacity fields and hide device/fs/uuid/io", () => {
    const disk = diskMetrics({
      name: "Macintosh HD",
      mount_point: "/",
      total_bytes: 100,
      used_bytes: 40,
      available_bytes: 60,
      usage_percent: 40,
      removable: false,
    });
    const snapshot: ResourceMonitorSnapshot = {
      collected_at_ms: 1,
      host: hostMetrics(),
      disks: [disk],
      server: usage,
      shared_runtime: usage,
      desktop_use: usage,
      projects: [],
      unattributed: usage,
      attribution_status: "complete",
    };
    const allowedKeys = [
      "available_bytes",
      "mount_point",
      "name",
      "removable",
      "total_bytes",
      "usage_percent",
      "used_bytes",
    ];
    const forbiddenKeys = [
      "device",
      "file_system",
      "filesystem",
      "fs",
      "io",
      "kind",
      "serial",
      "uuid",
    ];

    expect(Object.keys(disk).sort()).toEqual(allowedKeys);
    expect(snapshot.disks).toHaveLength(1);
    expect(disk.used_bytes + disk.available_bytes).toBe(disk.total_bytes);
    expect(disk.used_bytes + disk.available_bytes).toBe(100);
    for (const key of forbiddenKeys) {
      expect(Object.hasOwn(disk, key)).toBe(false);
    }
  });
});
