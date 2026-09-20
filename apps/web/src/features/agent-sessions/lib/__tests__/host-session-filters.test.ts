import { describe, expect, test } from "bun:test";
import type { HostSessionListItem } from "@atmos/api-types/ws/dto/host-session";
import {
  EMPTY_HOST_SESSION_FILTERS,
  filterHostSessions,
  formatHostSessionBytes,
  hasAtmosChatTag,
  hostSessionDateBounds,
  hostSessionFilterCount,
  hostSessionHighlightParts,
  hostSessionHref,
  hostSessionMessageIndex,
  hostSessionQuickRangeBounds,
  hostSessionSearchTerms,
  matchHostSessionQuickRange,
  uniqueProjectValues,
  uniqueProviderIds,
} from "@/features/agent-sessions/lib/host-session-filters";
import { formatHostSessionTuiCommand } from "@/features/agent-sessions/lib/host-session-command";

function item(
  patch: Partial<HostSessionListItem> & Pick<HostSessionListItem, "key" | "provider_id">,
): HostSessionListItem {
  return {
    native_id: patch.native_id ?? patch.key,
    title: patch.title ?? patch.key,
    cwd: patch.cwd ?? "/tmp",
    project_name: patch.project_name ?? "",
    started_at: patch.started_at ?? "2026-01-01T00:00:00Z",
    updated_at: patch.updated_at ?? "2026-01-01T00:00:00Z",
    message_count: patch.message_count ?? 1,
    byte_size: patch.byte_size ?? null,
    model: patch.model ?? null,
    tags: patch.tags ?? [],
    atmos_chat_id: patch.atmos_chat_id ?? null,
    resume_chat: patch.resume_chat ?? "supported",
    resume_tui: patch.resume_tui ?? "supported",
    ...patch,
  };
}

describe("host session filters", () => {
  const sessions = [
    item({
      key: "claude:a",
      provider_id: "claude",
      project_name: "atmos",
      cwd: "/src/atmos",
      tags: ["atmos_chat"],
    }),
    item({
      key: "codex:b",
      provider_id: "codex",
      project_name: "atmos",
      cwd: "/src/atmos",
    }),
    item({
      key: "claude:c",
      provider_id: "claude",
      project_name: "notes",
      cwd: "/src/notes",
    }),
  ];

  test("filters compose by provider and project and clear restores the full list", () => {
    expect(filterHostSessions(sessions, EMPTY_HOST_SESSION_FILTERS)).toHaveLength(3);
    expect(
      filterHostSessions(sessions, { ...EMPTY_HOST_SESSION_FILTERS, providerId: "claude" }).map(
        (row) => row.key,
      ),
    ).toEqual(["claude:a", "claude:c"]);
    expect(
      filterHostSessions(sessions, { ...EMPTY_HOST_SESSION_FILTERS, project: "atmos" }).map(
        (row) => row.key,
      ),
    ).toEqual(["claude:a", "codex:b"]);
    expect(
      filterHostSessions(sessions, {
        ...EMPTY_HOST_SESSION_FILTERS,
        providerId: "claude",
        project: "atmos",
      }).map((row) => row.key),
    ).toEqual(["claude:a"]);
    expect(
      hostSessionFilterCount({
        ...EMPTY_HOST_SESSION_FILTERS,
        providerId: "claude",
        project: "atmos",
      }),
    ).toBe(2);
    expect(
      hostSessionFilterCount({
        ...EMPTY_HOST_SESSION_FILTERS,
        dateFrom: "2026-09-01",
        dateTo: "2026-09-18",
      }),
    ).toBe(1);
    expect(hostSessionFilterCount(EMPTY_HOST_SESSION_FILTERS)).toBe(0);
  });

  test("collects filter options and Atmos Chat tags", () => {
    expect(uniqueProviderIds(sessions)).toEqual(["claude", "codex"]);
    expect(uniqueProjectValues(sessions)).toEqual(["atmos", "notes"]);
    expect(hasAtmosChatTag(sessions[0]!)).toBe(true);
    expect(hasAtmosChatTag(sessions[1]!)).toBe(false);
    expect(hostSessionHref("claude:a")).toBe("/agent-sessions?key=claude%3Aa");
    expect(hostSessionHref("claude:a", { messageId: "u1", seq: 0 })).toBe(
      "/agent-sessions?key=claude%3Aa&mid=u1&seq=0",
    );
    expect(hostSessionHref("claude:a", { seq: -1 })).toBe("/agent-sessions?key=claude%3Aa");
    expect(hostSessionHref(null)).toBe("/agent-sessions");
    expect(
      hostSessionMessageIndex(
        [{ id: "a" }, { id: "u1" }, { id: "b" }],
        { messageId: "u1", seq: 0 },
      ),
    ).toBe(1);
    expect(
      hostSessionMessageIndex([{ id: "a" }, { id: "b" }], { messageId: "missing", seq: 1 }),
    ).toBe(1);
  });

  test("highlights the full query then leftover tokens", () => {
    expect(hostSessionSearchTerms("  IMAGE PROTOCOL PROBE  ")).toEqual([
      "IMAGE PROTOCOL PROBE",
      "PROTOCOL",
      "IMAGE",
      "PROBE",
    ]);
    expect(hostSessionHighlightParts("IMAGE PROTOCOL PROBE.", "IMAGE PROTOCOL PROBE")).toEqual([
      { text: "IMAGE PROTOCOL PROBE", match: true },
      { text: ".", match: false },
    ]);
    expect(hostSessionHighlightParts("hello IMAGE world", "image")).toEqual([
      { text: "hello ", match: false },
      { text: "IMAGE", match: true },
      { text: " world", match: false },
    ]);
    expect(hostSessionHighlightParts("搜索标题和消息", "标题")).toEqual([
      { text: "搜索", match: false },
      { text: "标题", match: true },
      { text: "和消息", match: false },
    ]);
    expect(hostSessionHighlightParts("a (b)", "(b)")).toEqual([
      { text: "a ", match: false },
      { text: "(b)", match: true },
    ]);
    expect(hostSessionHighlightParts("nope", "  ")).toEqual([{ text: "nope", match: false }]);
  });

  test("formats TUI resume argv", () => {
    expect(formatHostSessionTuiCommand({ bin: "codex", args: ["resume", "abc"] })).toBe(
      "codex resume abc",
    );
  });

  test("formats storage size and date range bounds", () => {
    expect(formatHostSessionBytes(null)).toBeNull();
    expect(formatHostSessionBytes(0)).toBe("0 B");
    expect(formatHostSessionBytes(512)).toBe("512 B");
    expect(formatHostSessionBytes(1536)).toBe("1.5 KB");
    expect(formatHostSessionBytes(10 * 1024)).toBe("10 KB");
    expect(formatHostSessionBytes(2 * 1024 * 1024)).toBe("2.0 MB");

    const now = new Date(2026, 8, 18, 15, 30, 0);
    expect(hostSessionQuickRangeBounds("today", now)).toEqual({
      from: "2026-09-18",
      to: "2026-09-18",
    });
    expect(hostSessionQuickRangeBounds("yesterday", now)).toEqual({
      from: "2026-09-17",
      to: "2026-09-17",
    });
    expect(hostSessionQuickRangeBounds("lastWeek", now)).toEqual({
      from: "2026-09-11",
      to: "2026-09-17",
    });
    expect(hostSessionQuickRangeBounds("thisMonth", now)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(hostSessionQuickRangeBounds("lastMonth", now)).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(hostSessionQuickRangeBounds("thisYear", now)).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(hostSessionQuickRangeBounds("lastYear", now)).toEqual({
      from: "2025-01-01",
      to: "2025-12-31",
    });
    expect(
      matchHostSessionQuickRange(
        { ...EMPTY_HOST_SESSION_FILTERS, dateFrom: "2026-09-11", dateTo: "2026-09-17" },
        now,
      ),
    ).toBe("lastWeek");

    const bounds = hostSessionDateBounds({
      ...EMPTY_HOST_SESSION_FILTERS,
      dateFrom: "2026-09-18",
      dateTo: "2026-09-18",
    });
    expect(bounds.updatedAfter).toBe(new Date(2026, 8, 18).toISOString());
    expect(bounds.updatedBefore).toBe(new Date(2026, 8, 19).toISOString());
  });
});
