import { describe, expect, it } from "bun:test";
import { groupConversationsByCwd } from "@/features/agent/lib/group-conversations";

describe("S5 conversation list groups by cwd", () => {
  it("groups rows and can create in the current cwd", () => {
    const groups = groupConversationsByCwd([
      { id: "1", title: "A", cwd: "/tmp/a" },
      { id: "2", title: "B", cwd: "/tmp/b" },
      { id: "3", title: "C", cwd: "/tmp/a" },
    ]);
    expect(groups.map((group) => group.cwd)).toEqual(["/tmp/a", "/tmp/b"]);
    expect(groups[0].conversations.map((row) => row.id)).toEqual(["1", "3"]);
    const created = { id: "4", title: "New", cwd: "/tmp/a" };
    const next = groupConversationsByCwd([...groups.flatMap((g) => g.conversations), created]);
    expect(next.find((group) => group.cwd === "/tmp/a")?.conversations).toHaveLength(3);
  });
});
