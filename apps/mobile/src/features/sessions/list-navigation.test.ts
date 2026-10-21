// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import { openSessionBucketHref, openWorkspaceEntryHref } from "./list-navigation";

const here = dirname(fileURLToPath(import.meta.url));

describe("open helpers", () => {
  test("a session card returns a plain bucket href", () => {
    const href = openSessionBucketHref("done");
    expect(href).toEqual({
      pathname: "/(home)/session/[bucket]",
      params: { bucket: "done" },
    });
    expect(href).not.toBeInstanceOf(Promise);
  });

  test("a workspace row returns a plain entry href", () => {
    const href = openWorkspaceEntryHref("ws-1");
    expect(href).toEqual({
      pathname: "/workspace/[workspaceId]",
      params: { workspaceId: "ws-1" },
    });
    expect(href).not.toBeInstanceOf(Promise);
  });

  test("the helpers do not fetch", () => {
    const source = readFileSync(join(here, "list-navigation.ts"), "utf8");
    expect(source).not.toContain("await");
    expect(source).not.toContain("fetch(");
  });
});

describe("presses do not await navigation", () => {
  test("session cards and workspace rows push the href in the same turn", () => {
    const session = readFileSync(join(here, "SessionInboxScreen.tsx"), "utf8");
    const workspace = readFileSync(join(here, "../workspaces/WorkspaceHomeList.tsx"), "utf8");
    const inbox = readFileSync(join(here, "use-session-inbox.ts"), "utf8");

    expect(session).toContain("openSessionBucketHref");
    expect(session).not.toContain("await router.push");
    expect(session).not.toContain("await openSessionBucketHref");
    expect(session).not.toContain("fillWhenShort");

    expect(workspace).toContain("openWorkspaceEntryHref");
    expect(workspace).not.toContain("await router.push");
    expect(workspace).not.toContain("await openWorkspaceEntryHref");

    expect(inbox).toContain("sessionInboxRefreshesOnFocus");
    expect(inbox).toContain("sessionInboxLoadsEnrichment");
    expect(inbox).toContain("snapshotsForBucket");
  });

  test("the window hook uses the pager guards", () => {
    const source = readFileSync(join(here, "use-filtered-list-window.ts"), "utf8");
    expect(source).toContain("beginFilteredListFetch");
    expect(source).toContain("settleFilteredListFetch");
    expect(source).toContain("retryFilteredListFetch");
    expect(source).toContain("filteredListShouldFetch");
    expect(source).toContain("advanceFilteredList");
    expect(source).toContain("reduceFilteredListWindow");
  });
});
