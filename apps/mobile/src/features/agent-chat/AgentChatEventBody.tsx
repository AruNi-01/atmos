import { StyleSheet, Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { AgentChatMarkdown } from "./AgentChatMarkdown";
import type { EventBlock, EventViewModel } from "./event-model";

export function AgentChatEventBody({ model }: { model: EventViewModel }) {
  return (
    <View style={{ gap: 12 }}>
      <EventBlocks blocks={model.blocks} />
      {model.nested.map((nested, index) => (
        <View key={`${nested.kind}:${nested.title}:${index}`} style={{ gap: 8 }}>
          <EventTitle title={nested.title} />
          <AgentChatEventBody model={nested} />
        </View>
      ))}
    </View>
  );
}

function EventTitle({ title }: { title: string }) {
  const theme = useMobileTheme();
  return (
    <Text style={{ color: theme.colors.label, fontSize: 15, fontWeight: "600", lineHeight: 20 }}>
      {title}
    </Text>
  );
}

function EventBlocks({ blocks }: { blocks: EventBlock[] }) {
  return (
    <View style={{ gap: 12 }}>
      {blocks.map((block) => (
        <EventBlockView key={`${block.label}:${block.text.slice(0, 24)}`} block={block} />
      ))}
    </View>
  );
}

function EventBlockView({ block }: { block: EventBlock }) {
  const theme = useMobileTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.colors.secondaryLabel, fontSize: 13, lineHeight: 18 }}>{block.label}</Text>
      {block.format === "markdown" ? (
        <AgentChatMarkdown text={block.text} />
      ) : (
        <View
          style={{
            backgroundColor: theme.colors.cardSubtle,
            borderColor: theme.colors.glassBorder,
            borderCurve: "continuous",
            borderRadius: 12,
            borderWidth: StyleSheet.hairlineWidth,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        >
          <Text
            selectable
            style={{ color: theme.colors.label, fontFamily: "Menlo", fontSize: 13, lineHeight: 18 }}
          >
            {block.text}
          </Text>
        </View>
      )}
    </View>
  );
}
