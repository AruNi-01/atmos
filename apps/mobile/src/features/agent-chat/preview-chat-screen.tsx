import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  parityFixtureById,
  projectParityTree,
  type ParityExpand,
  type ParityNode,
} from "@/features/agent-chat/parity-tree";

function param(value: string | string[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ?? "";
}

function expandMode(value: string): ParityExpand {
  if (value === "process" || value === "all" || value === "none") return value;
  return "none";
}

function treeRows(
  nodes: readonly ParityNode[],
  depth: number,
  rows: Array<{ id: number; depth: number; text: string }>,
  seq: { next: number },
): void {
  for (const node of nodes) {
    const marker = node.expanded == null ? "" : node.expanded ? "▾ " : "▸ ";
    const label = node.label && node.label.length > 0 ? node.label : node.kind;
    rows.push({
      id: seq.next,
      depth,
      text: `${marker}${node.kind}  ${label}`,
    });
    seq.next += 1;
    if (node.children) treeRows(node.children, depth + 1, rows, seq);
  }
}

export function PreviewChatScreen() {
  const params = useLocalSearchParams<{
    fixture?: string | string[];
    theme?: string | string[];
    expand?: string | string[];
  }>();
  const fixtureId = param(params.fixture) || "F3";
  const theme = param(params.theme) === "dark" ? "dark" : "light";
  const expand = expandMode(param(params.expand));
  const backgroundColor = theme === "dark" ? "#000000" : "#f4f4f6";
  const color = theme === "dark" ? "#f4f4f6" : "#1a1a1a";
  const fixture = parityFixtureById(fixtureId);
  const rows = useMemo(() => {
    if (!fixture) return [];
    const collected: Array<{ id: number; depth: number; text: string }> = [];
    treeRows(projectParityTree(fixture.messages, { cards: fixture.cards, expand }), 0, collected, {
      next: 0,
    });
    return collected;
  }, [expand, fixture]);

  return (
    <View style={{ backgroundColor, flex: 1 }}>
      <Text style={{ color, fontSize: 13, padding: 16 }} testID="parity-ready">
        {fixtureId}
      </Text>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 24, paddingHorizontal: 16 }}
        style={{ backgroundColor, flex: 1 }}
      >
        {fixture ? null : <Text style={{ color, fontSize: 15 }}>Missing fixture</Text>}
        {rows.map((row) => (
          <Text
            key={row.id}
            style={{
              color,
              fontSize: 15,
              lineHeight: 20,
              marginBottom: 4,
              paddingLeft: row.depth * 12,
            }}
          >
            {row.text}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}
