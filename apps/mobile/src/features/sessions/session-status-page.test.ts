// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import { LIST_PAGE_SIZE } from "@/features/lists/list-page";
import {
  UNFILTERED_SESSION_PAGE_LIMIT,
  agentSessionStatusListInput,
  agentSessionStatusQueryKey,
  omitSessionFromStatusPages,
} from "./session-status-page";

const SERVER = "computer-1";

describe("agent session status page", () => {
  test("the unfiltered home key stays exact", () => {
    expect(agentSessionStatusQueryKey({ serverId: SERVER })).toEqual([
      "agent-session-status-list",
      SERVER,
    ]);
    expect(agentSessionStatusQueryKey({ serverId: SERVER, groupKey: "  ", limit: 100 })).toEqual([
      "agent-session-status-list",
      SERVER,
    ]);
    expect(agentSessionStatusListInput({ cursor: null })).toEqual({
      cursor: null,
      limit: UNFILTERED_SESSION_PAGE_LIMIT,
    });
  });

  test("a bucket or workspace filter is its own page", () => {
    expect(agentSessionStatusQueryKey({ serverId: SERVER, groupKey: "running" })).toEqual([
      "agent-session-status-list",
      SERVER,
      "running",
      null,
      LIST_PAGE_SIZE,
    ]);
    expect(
      agentSessionStatusQueryKey({ serverId: SERVER, contextId: "ws-1", limit: LIST_PAGE_SIZE }),
    ).toEqual(["agent-session-status-list", SERVER, null, "ws-1", LIST_PAGE_SIZE]);
    expect(
      agentSessionStatusListInput({ groupKey: "running", contextId: " ws-1 ", cursor: "cursor" }),
    ).toEqual({
      cursor: "cursor",
      limit: LIST_PAGE_SIZE,
      group_key: "running",
      context_id: "ws-1",
    });
    const filtered = agentSessionStatusQueryKey({ serverId: SERVER, groupKey: "running" });
    expect(filtered.slice(0, 2)).toEqual(agentSessionStatusQueryKey({ serverId: SERVER }));
  });

  test("hiding a session drops it from a filtered page", () => {
    const page = omitSessionFromStatusPages(
      {
        pages: [
          {
            sessions: [{ session_id: "keep" }, { session_id: "drop" }],
            next_cursor: null,
          },
        ],
      },
      "drop",
    );
    expect(page?.pages[0]?.sessions.map((session) => session.session_id)).toEqual(["keep"]);
    expect(omitSessionFromStatusPages(undefined, "drop")).toBeUndefined();
  });
});
