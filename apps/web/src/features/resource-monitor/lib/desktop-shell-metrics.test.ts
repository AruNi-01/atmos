import { beforeEach, describe, expect, mock, test } from "bun:test";

const invokeMock = mock(async () => ({
  supported: true,
  collected_at_ms: 10,
  logical_cpu_count: 8,
  total: { cpu_percent: 1, memory_rss_bytes: 2, process_count: 3 },
  groups: [],
}));

let electron = false;

mock.module("@/shared/lib/desktop-bridge", () => ({
  desktopInvoke: invokeMock,
  isElectronShell: () => electron,
}));

import { useAtmosComputerStore } from "@/features/connection/lib/atmos-computer-store";
import {
  canFetchDesktopShellMetrics,
  fetchDesktopShellMetrics,
  parseDesktopShellMetricsSnapshot,
} from "@/features/resource-monitor/lib/desktop-shell-metrics";

const validSnapshot = {
  supported: true,
  collected_at_ms: 1_700,
  logical_cpu_count: 8,
  total: { cpu_percent: 2.5, memory_rss_bytes: 4096, process_count: 4 },
  groups: [
    {
      kind: "main",
      usage: { cpu_percent: 1, memory_rss_bytes: 1024, process_count: 1 },
    },
  ],
};

describe("desktop-shell-metrics", () => {
  beforeEach(() => {
    electron = false;
    invokeMock.mockClear();
    useAtmosComputerStore.setState({ connectionMode: "local" });
  });

  test("gates fetch to Electron + local only", () => {
    expect(canFetchDesktopShellMetrics(true, "local")).toBe(true);
    expect(canFetchDesktopShellMetrics(true, "relay")).toBe(false);
    expect(canFetchDesktopShellMetrics(false, "local")).toBe(false);
    expect(canFetchDesktopShellMetrics(false, "relay")).toBe(false);
  });

  test("hosted and relay never invoke desktop IPC", async () => {
    electron = false;
    useAtmosComputerStore.setState({ connectionMode: "local" });
    const hosted = await fetchDesktopShellMetrics();
    expect(hosted.supported).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();

    electron = true;
    useAtmosComputerStore.setState({ connectionMode: "relay" });
    const relay = await fetchDesktopShellMetrics();
    expect(relay.supported).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  test("local Electron invokes the shell metrics command", async () => {
    electron = true;
    useAtmosComputerStore.setState({ connectionMode: "local" });
    invokeMock.mockResolvedValueOnce(validSnapshot);

    const snapshot = await fetchDesktopShellMetrics();
    expect(invokeMock).toHaveBeenCalledWith("get_desktop_shell_metrics");
    expect(snapshot).toEqual(validSnapshot);
  });

  test("unsupported or invalid payloads do not throw", async () => {
    electron = true;
    useAtmosComputerStore.setState({ connectionMode: "local" });
    invokeMock.mockResolvedValueOnce({ supported: false });
    const unsupported = await fetchDesktopShellMetrics();
    expect(unsupported.supported).toBe(false);

    invokeMock.mockResolvedValueOnce({ not: "a snapshot" });
    const invalid = await fetchDesktopShellMetrics();
    expect(invalid.supported).toBe(false);

    invokeMock.mockRejectedValueOnce(new Error("missing command"));
    const failed = await fetchDesktopShellMetrics();
    expect(failed.supported).toBe(false);
  });

  test("parseDesktopShellMetricsSnapshot accepts a valid payload and rejects junk", () => {
    expect(parseDesktopShellMetricsSnapshot(validSnapshot)).toEqual(validSnapshot);
    expect(parseDesktopShellMetricsSnapshot(null)).toBeNull();
    expect(parseDesktopShellMetricsSnapshot({ supported: true })).toBeNull();
    expect(
      parseDesktopShellMetricsSnapshot({
        ...validSnapshot,
        groups: [{ kind: "browser", usage: validSnapshot.total }],
      }),
    ).toBeNull();
  });
});
