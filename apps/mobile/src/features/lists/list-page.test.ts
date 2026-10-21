// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  LIST_PAGE_SIZE,
  listWindow,
  nextListWindow,
  openItemCount,
  pageBlocks,
  reconcileListWindow,
} from "./list-page";

describe("nextListWindow", () => {
  test("reveals loaded rows before fetching", () => {
    expect(nextListWindow({ shown: 20, loaded: 35, hasNextPage: true })).toEqual({
      shown: 35,
      fetch: false,
    });
  });

  test("grows and fetches when the window has consumed the page", () => {
    expect(nextListWindow({ shown: 20, loaded: 20, hasNextPage: true })).toEqual({
      shown: 40,
      fetch: true,
    });
  });

  test("fetches without growing when a client filter shrank the page", () => {
    expect(nextListWindow({ shown: 20, loaded: 0, hasNextPage: true })).toEqual({
      shown: 20,
      fetch: true,
    });
    expect(nextListWindow({ shown: 40, loaded: 15, hasNextPage: true })).toEqual({
      shown: 40,
      fetch: true,
    });
  });

  test("stays when there is no next page", () => {
    expect(nextListWindow({ shown: 20, loaded: 12, hasNextPage: false })).toEqual({
      shown: 20,
      fetch: false,
    });
  });
});

describe("pageBlocks", () => {
  test("keeps a collapsed header and omits a later open block", () => {
    const pinned = Array.from({ length: LIST_PAGE_SIZE }, (_, index) => index);
    const visible = pageBlocks(
      [
        { key: "pinned", items: pinned, keep: true, title: "Pinned" },
        { key: "recent", items: [], keep: true, title: "Recently" },
        { key: "later", items: [1, 2, 3], keep: true, title: "Later" },
      ],
      LIST_PAGE_SIZE,
    );
    expect(visible.map((block) => block.key)).toEqual(["pinned", "recent"]);
    expect(visible[0]?.items).toHaveLength(LIST_PAGE_SIZE);
    expect(visible[1]?.items).toEqual([]);
  });

  test("slices across open blocks", () => {
    const visible = pageBlocks(
      [
        { key: "a", items: ["a1", "a2"] },
        { key: "b", items: ["b1", "b2", "b3"] },
      ],
      3,
    );
    expect(visible).toEqual([
      { key: "a", items: ["a1", "a2"] },
      { key: "b", items: ["b1"] },
    ]);
    expect(listWindow(["a1", "a2", "b1", "b2"], 3)).toEqual(["a1", "a2", "b1"]);
  });

  test("a closed block keeps rows for the animation and does not spend the window", () => {
    const visible = pageBlocks(
      [
        { key: "open", items: ["a", "b"] },
        { key: "closing", items: ["c", "d", "e"], closed: true, keep: true },
        { key: "later", items: ["f"], keep: true },
      ],
      2,
    );
    expect(visible.map((block) => [block.key, [...block.items]])).toEqual([
      ["open", ["a", "b"]],
      ["closing", ["c", "d", "e"]],
    ]);
    expect(
      openItemCount([
        { key: "open", items: ["a", "b"] },
        { key: "closing", items: ["c", "d", "e"], closed: true },
      ]),
    ).toBe(2);
  });
});

describe("reconcileListWindow", () => {
  test("returning to a previous key starts at one page", () => {
    const first = reconcileListWindow(undefined, "filters-a");
    const grown = { key: first.key, shown: 40 };
    const other = reconcileListWindow(grown, "filters-b");
    expect(other).toEqual({ key: "filters-b", shown: LIST_PAGE_SIZE });
    expect(reconcileListWindow(other, "filters-a")).toEqual({
      key: "filters-a",
      shown: LIST_PAGE_SIZE,
    });
    expect(reconcileListWindow(grown, "filters-a")).toBe(grown);
  });
});
