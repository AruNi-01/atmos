import { describe, expect, test } from "bun:test";
import { queryKeys } from "@/api/query/query-keys";
import type { ComputerQueryScope } from "@/api/query/query-scope";
import type { ResourceMonitorSnapshot } from "@atmos/api-types/ws/dto/resource-monitor";
import {
  applyResourceMonitorUpdated,
  isResourceDiskMetrics,
  isResourceHostMetrics,
  isResourceMemoryAccounting,
  isResourceMonitorSnapshot,
  isSafeProcessName,
} from "@/features/resource-monitor/lib/resource-monitor-query-events";
import {
  TEST_ACCOUNTING,
  testDiskMetrics,
  testHostMemory,
  testHostMetrics,
  testSnapshot,
} from "@/features/resource-monitor/lib/resource-monitor-test-host";
import { createAtmosWebQueryClient } from "@/providers/app/query-client";

const scope: ComputerQueryScope = {
  activeInstanceId: "local",
  connectionEpoch: 1,
  relaySessionRevision: 0,
};

function makeSnapshot(collectedAtMs = 1_700_000_000): ResourceMonitorSnapshot {
  return testSnapshot({ collected_at_ms: collectedAtMs });
}

describe("applyResourceMonitorUpdated", () => {
  test("replaces the scoped snapshot without invalidating or refetching", () => {
    const client = createAtmosWebQueryClient();
    const key = queryKeys.computer.resourceMonitorSnapshot(scope);
    const snapshot = makeSnapshot(42);

    const applied = applyResourceMonitorUpdated(client, scope, snapshot);

    expect(applied).toBe(true);
    expect(client.getQueryData(key)).toEqual(snapshot);
    expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    expect(client.getQueryState(key)?.fetchStatus).toBe("idle");
    expect(client.getQueryState(key)?.dataUpdatedAt).toBeGreaterThan(0);
  });

  test("does not reuse data under a different instance, epoch, or revision", () => {
    const client = createAtmosWebQueryClient();
    const snapshot = makeSnapshot(99);
    applyResourceMonitorUpdated(client, scope, snapshot);

    expect(
      client.getQueryData(
        queryKeys.computer.resourceMonitorSnapshot({
          ...scope,
          activeInstanceId: "relay:other",
        }),
      ),
    ).toBeUndefined();
    expect(
      client.getQueryData(
        queryKeys.computer.resourceMonitorSnapshot({
          ...scope,
          connectionEpoch: 9,
        }),
      ),
    ).toBeUndefined();
    expect(
      client.getQueryData(
        queryKeys.computer.resourceMonitorSnapshot({
          ...scope,
          relaySessionRevision: 4,
        }),
      ),
    ).toBeUndefined();
    expect(client.getQueryData(queryKeys.computer.resourceMonitorSnapshot(scope))).toEqual(
      snapshot,
    );
  });

  test("rejects partial payloads and leaves the cache unchanged", () => {
    const client = createAtmosWebQueryClient();
    const key = queryKeys.computer.resourceMonitorSnapshot(scope);
    const seed = makeSnapshot(1);
    client.setQueryData(key, seed);

    expect(
      applyResourceMonitorUpdated(client, scope, {
        collected_at_ms: 2,
        host: { cpu_percent: 1 },
      }),
    ).toBe(false);
    expect(client.getQueryData(key)).toEqual(seed);
  });

  test("rejects a null project entry and leaves the cache unchanged", () => {
    const client = createAtmosWebQueryClient();
    const key = queryKeys.computer.resourceMonitorSnapshot(scope);
    const seed = makeSnapshot(1);
    client.setQueryData(key, seed);
    const invalid = { ...makeSnapshot(2), projects: [null] };

    expect(isResourceMonitorSnapshot(invalid)).toBe(false);
    expect(applyResourceMonitorUpdated(client, scope, invalid)).toBe(false);
    expect(client.getQueryData(key)).toEqual(seed);
  });
});

describe("isResourceMonitorSnapshot", () => {
  const usage = { cpu_percent: 1.5, memory_rss_bytes: 1024, process_count: 1 };

  function nestedSnapshot(): ResourceMonitorSnapshot {
    return {
      ...makeSnapshot(),
      projects: [
        {
          project_id: "p1",
          name: "Atmos",
          usage,
          direct_usage: usage,
          sessions: [
            {
              session_id: "s0",
              name: null,
              terminal_kind: "simple",
              usage,
              processes: [],
            },
          ],
          other_usage: { cpu_percent: 0, memory_rss_bytes: 0, process_count: 0 },
          other_processes: [],
          workspaces: [
            {
              workspace_id: "w1",
              name: "Main",
              usage,
              sessions: [
                {
                  session_id: "s1",
                  name: "pty",
                  terminal_kind: "simple",
                  usage,
                  processes: [],
                },
              ],
              other_usage: { cpu_percent: 0, memory_rss_bytes: 0, process_count: 0 },
              other_processes: [],
            },
          ],
        },
      ],
    };
  }

  test("accepts a nested snapshot with a nullable session name", () => {
    expect(isResourceMonitorSnapshot(nestedSnapshot())).toBe(true);
  });

  test("rejects missing required hierarchy fields and non-array children", () => {
    const valid = nestedSnapshot();
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [{ ...valid.projects[0], project_id: undefined }],
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [{ ...valid.projects[0], workspaces: null }],
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [
          {
            ...valid.projects[0],
            sessions: [{ session_id: "s", terminal_kind: "simple", usage }],
          },
        ],
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [
          {
            ...valid.projects[0],
            workspaces: [{ ...valid.projects[0].workspaces[0], sessions: [null] }],
          },
        ],
      }),
    ).toBe(false);
  });

  test("rejects non-finite or negative usage and host fields", () => {
    const valid = nestedSnapshot();
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        server: { ...usage, cpu_percent: Number.NaN },
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        host: { ...valid.host, memory_used_bytes: Number.POSITIVE_INFINITY },
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [
          {
            ...valid.projects[0],
            usage: { ...usage, memory_rss_bytes: -1 },
          },
        ],
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        collected_at_ms: Number.NaN,
      }),
    ).toBe(false);
  });

  test("requires processes, other_usage, and other_processes recursively", () => {
    const valid = nestedSnapshot();
    const project = valid.projects[0];
    expect(project).toBeDefined();
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [{ ...project, sessions: [{ ...project.sessions[0], processes: undefined }] }],
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [{ ...project, other_usage: undefined, other_processes: [] }],
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [{ ...project, other_usage: usage, other_processes: undefined }],
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [
          {
            ...project,
            workspaces: [{ ...project.workspaces[0], other_processes: undefined }],
          },
        ],
      }),
    ).toBe(false);
  });

  test("rejects unknown process fields, path names, and invalid ports", () => {
    const valid = nestedSnapshot();
    const project = valid.projects[0];
    const process = {
      name: "node",
      usage,
      ports: [3030],
    };
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [
          {
            ...project,
            other_usage: usage,
            other_processes: [process],
          },
        ],
      }),
    ).toBe(true);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [
          {
            ...project,
            other_usage: usage,
            other_processes: [{ ...process, name: "   " }],
          },
        ],
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [
          {
            ...project,
            other_usage: usage,
            other_processes: [{ ...process, pid: 12 }],
          },
        ],
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [
          {
            ...project,
            other_usage: usage,
            other_processes: [{ ...process, cwd: "/Users/demo", command: "node server" }],
          },
        ],
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [
          {
            ...project,
            other_usage: usage,
            other_processes: [{ ...process, ports: [65536] }],
          },
        ],
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [
          {
            ...project,
            other_usage: usage,
            other_processes: [{ ...process, ports: [-1] }],
          },
        ],
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [
          {
            ...project,
            other_usage: usage,
            other_processes: [{ ...process, ports: [3030.5] }],
          },
        ],
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [
          {
            ...project,
            sessions: [
              {
                ...project.sessions[0],
                processes: [{ ...process, ports: [0, 65535] }],
              },
            ],
          },
        ],
      }),
    ).toBe(true);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [
          {
            ...project,
            other_usage: usage,
            other_processes: [{ ...process, extra: true }],
          },
        ],
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [
          {
            ...project,
            other_usage: usage,
            other_processes: [{ name: process.name, usage: process.usage }],
          },
        ],
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [
          {
            ...project,
            other_usage: usage,
            other_processes: [{ ...process, name: "/usr/bin/node" }],
          },
        ],
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [
          {
            ...project,
            other_usage: usage,
            other_processes: [{ ...process, name: "C:\\Windows\\node.exe" }],
          },
        ],
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [
          {
            ...project,
            other_usage: usage,
            other_processes: [{ ...process, name: "bin/node" }],
          },
        ],
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        projects: [
          {
            ...project,
            other_usage: usage,
            other_processes: [{ ...process, name: ".." }],
          },
        ],
      }),
    ).toBe(false);
  });

  test("accepts basename-only process names and rejects path-like names", () => {
    expect(isSafeProcessName("node")).toBe(true);
    expect(isSafeProcessName("python3")).toBe(true);
    expect(isSafeProcessName("node.exe")).toBe(true);
    expect(isSafeProcessName("   ")).toBe(false);
    expect(isSafeProcessName("/usr/bin/node")).toBe(false);
    expect(isSafeProcessName("C:\\Program Files\\node.exe")).toBe(false);
    expect(isSafeProcessName("C:\\\\Program Files\\\\node.exe")).toBe(false);
    expect(isSafeProcessName("bin/node")).toBe(false);
    expect(isSafeProcessName("bin\\\\node")).toBe(false);
    expect(isSafeProcessName("..")).toBe(false);
    expect(isSafeProcessName("../node")).toBe(false);
  });
});

describe("isResourceHostMetrics", () => {
  test("accepts empty cores or a unique stably ordered 0–100 core list", () => {
    expect(
      isResourceHostMetrics(
        testHostMetrics({ logical_cpu_count: 8, cores: [] }),
      ),
    ).toBe(true);
    expect(isResourceHostMetrics(testHostMetrics({ logical_cpu_count: 2 }))).toBe(
      true,
    );
    expect(isResourceMemoryAccounting("btop_mach")).toBe(true);
    expect(TEST_ACCOUNTING).toHaveLength(4);
  });

  test("rejects core length, index, range, and order violations", () => {
    const host = testHostMetrics({ logical_cpu_count: 2 });
    expect(
      isResourceHostMetrics({
        ...host,
        cores: [{ index: 0, cpu_percent: 1 }],
      }),
    ).toBe(false);
    expect(
      isResourceHostMetrics({
        ...host,
        cores: [
          { index: 0, cpu_percent: 1 },
          { index: 0, cpu_percent: 2 },
        ],
      }),
    ).toBe(false);
    expect(
      isResourceHostMetrics({
        ...host,
        cores: [
          { index: 1, cpu_percent: 1 },
          { index: 0, cpu_percent: 2 },
        ],
      }),
    ).toBe(false);
    expect(
      isResourceHostMetrics({
        ...host,
        cores: [
          { index: 0, cpu_percent: -1 },
          { index: 1, cpu_percent: 2 },
        ],
      }),
    ).toBe(false);
    expect(
      isResourceHostMetrics({
        ...host,
        cores: [
          { index: 0, cpu_percent: 101 },
          { index: 1, cpu_percent: 2 },
        ],
      }),
    ).toBe(false);
  });

  test("requires headline used/total to match nested memory and platform invariants", () => {
    const memory = testHostMemory({
      total_bytes: 100,
      used_bytes: 40,
      available_bytes: 60,
      cached_bytes: null,
      swap_total_bytes: 50,
      swap_used_bytes: 10,
      swap_free_bytes: 40,
      accounting: "windows_avail_phys",
    });
    const host = testHostMetrics({
      logical_cpu_count: 0,
      cores: [],
      memory_used_bytes: 40,
      memory_total_bytes: 100,
      memory,
    });
    expect(isResourceHostMetrics(host)).toBe(true);
    expect(
      isResourceHostMetrics({
        ...host,
        memory_used_bytes: 41,
      }),
    ).toBe(false);
    expect(
      isResourceHostMetrics({
        ...host,
        memory: { ...memory, available_bytes: 59 },
      }),
    ).toBe(false);
    expect(
      isResourceHostMetrics({
        ...host,
        memory: { ...memory, swap_free_bytes: 39 },
      }),
    ).toBe(false);
    expect(
      isResourceHostMetrics({
        ...host,
        memory: { ...memory, cached_bytes: -1 },
      }),
    ).toBe(false);
    expect(
      isResourceHostMetrics({
        ...host,
        memory: { ...memory, accounting: "unknown" },
      }),
    ).toBe(false);
    expect(
      isResourceMonitorSnapshot({
        ...makeSnapshot(),
        host: { ...host, memory: { ...memory, cached_bytes: 12 } },
      }),
    ).toBe(true);
  });
});

describe("isResourceDiskMetrics", () => {
  test("requires snapshot.disks and accepts empty or valid volumes", () => {
    const valid = makeSnapshot();
    expect(isResourceMonitorSnapshot(valid)).toBe(true);
    expect(isResourceMonitorSnapshot({ ...valid, disks: [] })).toBe(true);
    expect(
      isResourceMonitorSnapshot({
        ...valid,
        disks: [testDiskMetrics({ mount_point: "/System/Volumes/Data" })],
      }),
    ).toBe(true);
    const missing = { ...valid } as Record<string, unknown>;
    delete missing.disks;
    expect(isResourceMonitorSnapshot(missing)).toBe(false);
    expect(isResourceMonitorSnapshot({ ...valid, disks: null })).toBe(false);
    expect(isResourceMonitorSnapshot({ ...valid, disks: undefined })).toBe(false);
  });

  test("rejects extra fields, bad name/mount/bytes/percent, and used+available mismatch", () => {
    const disk = testDiskMetrics();
    expect(isResourceDiskMetrics(disk)).toBe(true);
    expect(isResourceDiskMetrics({ ...disk, name: "   " })).toBe(false);
    expect(isResourceDiskMetrics({ ...disk, mount_point: 12 })).toBe(false);
    expect(isResourceDiskMetrics({ ...disk, mount_point: "" })).toBe(false);
    expect(isResourceDiskMetrics({ ...disk, removable: "false" })).toBe(false);
    expect(isResourceDiskMetrics({ ...disk, usage_percent: 101 })).toBe(false);
    expect(isResourceDiskMetrics({ ...disk, usage_percent: -1 })).toBe(false);
    expect(
      isResourceDiskMetrics({
        ...disk,
        used_bytes: disk.used_bytes + 1,
      }),
    ).toBe(false);
    expect(isResourceDiskMetrics({ ...disk, io_bytes: 8 })).toBe(false);
    expect(isResourceDiskMetrics({ ...disk, device: "/dev/disk0" })).toBe(false);
    const missingField = { ...disk } as Record<string, unknown>;
    delete missingField.removable;
    expect(isResourceDiskMetrics(missingField)).toBe(false);
  });

  test("rejects more than 16 volumes", () => {
    const valid = makeSnapshot();
    const disks = Array.from({ length: 17 }, (_, index) =>
      testDiskMetrics({
        name: `vol-${index}`,
        mount_point: `/${index}`,
      }),
    );
    expect(isResourceMonitorSnapshot({ ...valid, disks })).toBe(false);
    expect(
      isResourceMonitorSnapshot({ ...valid, disks: disks.slice(0, 16) }),
    ).toBe(true);
  });
});
