// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { AGENT_SESSION_STATUS_PAGE_SIZE } from "@/api/session-status-page";
import { CHAT_LIST_PAGE_SIZE } from "@/features/agent-chat/chat-list-page";
import {
  advanceFilteredList,
  beginFilteredListFetch,
  FILTERED_LIST_PAGE_SIZE,
  filteredListFirstFrame,
  filteredListShouldFetch,
  filteredListStatus,
  reduceFilteredListWindow,
  releaseFilteredListFetch,
  retryFilteredListFetch,
  syncFilteredListFilter,
  visibleCountAfterServerPage,
} from "./filtered-list-page";
import { sessionInboxLoadsEnrichment, sessionInboxRefreshesOnFocus } from "./session-inbox-surface";

const here = dirname(fileURLToPath(import.meta.url));

describe("session inbox surface", () => {
  test("only the home screen refreshes on focus and loads enrichment", () => {
    expect(sessionInboxLoadsEnrichment("home")).toBe(true);
    expect(sessionInboxRefreshesOnFocus("home")).toBe(true);
    expect(sessionInboxLoadsEnrichment("bucket")).toBe(false);
    expect(sessionInboxRefreshesOnFocus("bucket")).toBe(false);
  });
});

describe("filtered list first frame", () => {
  test("shows a skeleton while the first rows are still outstanding", () => {
    expect(
      filteredListFirstFrame({
        fetchFailed: false,
        hasNextServerPage: true,
        pending: true,
        rows: [],
        visibleCount: FILTERED_LIST_PAGE_SIZE,
      }),
    ).toEqual({ mode: "skeleton", rows: [] });
  });

  test("a failed empty page is not a skeleton", () => {
    expect(
      filteredListFirstFrame({
        fetchFailed: true,
        hasNextServerPage: true,
        pending: false,
        rows: [],
        visibleCount: FILTERED_LIST_PAGE_SIZE,
      }),
    ).toEqual({ mode: "empty", rows: [] });
  });

  test("a warm cache paints at most one UI page", () => {
    const rows = Array.from({ length: 500 }, (_, index) => index);
    const frame = filteredListFirstFrame({
      fetchFailed: false,
      hasNextServerPage: true,
      pending: false,
      rows,
      visibleCount: FILTERED_LIST_PAGE_SIZE,
    });
    expect(frame.mode).toBe("rows");
    expect(frame.rows).toHaveLength(20);
    expect(frame.rows[0]).toBe(0);
    expect(frame.rows[19]).toBe(19);
  });
});

describe("filtered list auto-fill", () => {
  test("fetches only until the first UI page is full", () => {
    const base = {
      fetchFailed: false,
      fetching: false,
      hasNextServerPage: true,
      visibleCount: FILTERED_LIST_PAGE_SIZE,
    };
    expect(filteredListShouldFetch({ ...base, loadedCount: 0 })).toBe(true);
    expect(filteredListShouldFetch({ ...base, loadedCount: 19 })).toBe(true);
    expect(filteredListShouldFetch({ ...base, loadedCount: 20 })).toBe(false);
    expect(
      filteredListShouldFetch({
        ...base,
        loadedCount: 30,
        visibleCount: 40,
      }),
    ).toBe(false);
    expect(filteredListShouldFetch({ ...base, fetching: true, loadedCount: 0 })).toBe(false);
    expect(filteredListShouldFetch({ ...base, fetchFailed: true, loadedCount: 0 })).toBe(false);
    expect(filteredListShouldFetch({ ...base, hasNextServerPage: false, loadedCount: 0 })).toBe(
      false,
    );
  });
});

describe("filtered list advance", () => {
  test("reveals the next cached page without a fetch", () => {
    expect(
      advanceFilteredList({
        fetchFailed: false,
        fetching: false,
        hasNextServerPage: true,
        loadedCount: 100,
        visibleCount: 20,
      }),
    ).toEqual({ visibleCount: 40, fetch: false });
  });

  test("asks for one server page when the cache is consumed", () => {
    expect(
      advanceFilteredList({
        fetchFailed: false,
        fetching: false,
        hasNextServerPage: true,
        loadedCount: 100,
        visibleCount: 100,
      }),
    ).toEqual({ visibleCount: 100, fetch: true });
  });

  test("the end and an in-flight or failed fetch are ignored", () => {
    const end = advanceFilteredList({
      fetchFailed: false,
      fetching: false,
      hasNextServerPage: false,
      loadedCount: 20,
      visibleCount: 20,
    });
    const fetching = advanceFilteredList({
      fetchFailed: false,
      fetching: true,
      hasNextServerPage: true,
      loadedCount: 100,
      visibleCount: 20,
    });
    const failed = advanceFilteredList({
      fetchFailed: true,
      fetching: false,
      hasNextServerPage: true,
      loadedCount: 100,
      visibleCount: 20,
    });
    expect(end).toEqual({ visibleCount: 20, fetch: false });
    expect(fetching).toEqual({ visibleCount: 20, fetch: false });
    expect(failed).toEqual({ visibleCount: 20, fetch: false });
  });
});

describe("filtered list failure", () => {
  test("a failed page is an error and retry starts a fetch", () => {
    expect(
      filteredListStatus({
        fetchFailed: true,
        fetching: false,
        hasNextServerPage: true,
        loadedCount: 20,
        pending: false,
        visibleCount: 20,
      }),
    ).toBe("error");
    expect(retryFilteredListFetch({ requesting: false, generation: 4 })).toEqual({
      latch: { requesting: true, generation: 5 },
      fetch: true,
    });
  });
});

describe("filtered list duplicate fetch", () => {
  test("a second begin is dropped and release ignores a loading render", () => {
    const idle = { requesting: false, generation: 0 };
    const first = beginFilteredListFetch(idle, {
      fetchFailed: false,
      fetching: false,
      hasNextServerPage: true,
    });
    const second = beginFilteredListFetch(first.latch, {
      fetchFailed: false,
      fetching: false,
      hasNextServerPage: true,
    });
    expect(first).toEqual({ latch: { requesting: true, generation: 1 }, fetch: true });
    expect(second).toEqual({ latch: first.latch, fetch: false });

    const released = releaseFilteredListFetch(first.latch, first.latch.generation);
    expect(released).toEqual({ requesting: false, generation: 1 });

    const newer = beginFilteredListFetch(released, {
      fetchFailed: false,
      fetching: false,
      hasNextServerPage: true,
    });
    expect(releaseFilteredListFetch(newer.latch, first.latch.generation)).toBe(newer.latch);
    expect(newer.latch.requesting).toBe(true);
  });
});

describe("filtered list server page", () => {
  test("auto-fill does not grow the window and a consumed page grows by 20", () => {
    expect(
      visibleCountAfterServerPage({
        loadedCount: 15,
        previousLoadedCount: 0,
        visibleCount: 20,
      }),
    ).toBe(20);
    expect(
      visibleCountAfterServerPage({
        loadedCount: 180,
        previousLoadedCount: 100,
        visibleCount: 100,
      }),
    ).toBe(120);
  });

  test("a filter change restores the first page without treating cache as a new server page", () => {
    const current = { key: "done", visibleCount: 80 };
    expect(syncFilteredListFilter(current, "done")).toBe(current);
    expect(syncFilteredListFilter(current, "running")).toEqual({
      key: "running",
      visibleCount: 20,
    });

    const state = { filterKey: "done", visibleCount: 80, previousLoadedCount: 100 };
    expect(reduceFilteredListWindow(state, { filterKey: "done", loadedCount: 100 })).toBe(state);
    expect(reduceFilteredListWindow(state, { filterKey: "running", loadedCount: 40 })).toEqual({
      filterKey: "running",
      visibleCount: 20,
      previousLoadedCount: 40,
    });
    expect(
      reduceFilteredListWindow(
        { filterKey: "done", visibleCount: 20, previousLoadedCount: 0 },
        { filterKey: "done", loadedCount: 15 },
      ),
    ).toEqual({
      filterKey: "done",
      visibleCount: 20,
      previousLoadedCount: 15,
    });
  });
});

describe("wire page size", () => {
  test("status and chat requests stay at 100", () => {
    expect(AGENT_SESSION_STATUS_PAGE_SIZE).toBe(100);
    expect(CHAT_LIST_PAGE_SIZE).toBe(100);
    expect(FILTERED_LIST_PAGE_SIZE).toBe(20);

    const actions = readFileSync(join(here, "../../api/ws-actions.ts"), "utf8");
    expect(actions).toContain("AGENT_SESSION_STATUS_PAGE_SIZE");
    expect(actions).not.toContain("limit: 20");

    const pkg = readFileSync(join(here, "../../../../../package.json"), "utf8");
    expect(pkg).toContain('"lint": "oxlint --max-warnings=455"');
  });
});
