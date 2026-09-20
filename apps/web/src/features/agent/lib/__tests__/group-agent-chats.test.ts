import { describe, expect, it } from "bun:test";
import { groupChatsByCwd } from "@/features/agent/lib/group-agent-chats";

describe("S5 chat list groups by cwd", () => {
  it("groups rows and can create in the current cwd", () => {
    const groups = groupChatsByCwd([
      { id: "1", title: "A", cwd: "/tmp/a" },
      { id: "2", title: "B", cwd: "/tmp/b" },
      { id: "3", title: "C", cwd: "/tmp/a" },
    ]);
    expect(groups.map((group) => group.cwd)).toEqual(["/tmp/a", "/tmp/b"]);
    expect(groups[0].chats.map((row) => row.id)).toEqual(["1", "3"]);
    const created = { id: "4", title: "New", cwd: "/tmp/a" };
    const next = groupChatsByCwd([...groups.flatMap((g) => g.chats), created]);
    expect(next.find((group) => group.cwd === "/tmp/a")?.chats).toHaveLength(3);
  });
});
