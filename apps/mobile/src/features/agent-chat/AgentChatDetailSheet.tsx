import { Pressable, ScrollView, Text, View } from "react-native";
import type { AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import { useMobileTheme } from "@/theme/theme-store";
import { ChevronRightIcon } from "@/ui/icons/lucide-native";
import { ExpoDrawer } from "@/ui/primitives/expo-drawer";
import { AgentChatMarkdown } from "./AgentChatMarkdown";
import { AgentChatToolCard, AgentChatToolDetail } from "./AgentChatToolCard";
import { toolGroupOverview, type AssistantSegment } from "./assistant-process";
import { collapsedToolTitle, type AgentToolCallPart } from "./tool-kind";

export type DetailPage =
  | { kind: "process"; title: string; segments: AssistantSegment[] }
  | { kind: "group"; title: string; parts: AgentPart[] }
  | { kind: "tool"; part: AgentToolCallPart }
  | { kind: "thinking"; title: string; text: string };

export function AgentChatDetailSheet({
  onDismissAt,
  onPush,
  pages,
}: {
  onDismissAt: (index: number) => void;
  onPush: (page: DetailPage) => void;
  pages: DetailPage[];
}) {
  const theme = useMobileTheme();

  return (
    <>
      {pages.map((page, index) => (
        <ExpoDrawer
          key={`${page.kind}:${index}:${pageTitle(page)}`}
          isPresented
          matchContents={false}
          onDismiss={() => onDismissAt(index)}
          snapPoints={["half", "full"]}
        >
          <View style={{ flex: 1, gap: 12 }}>
            <Text numberOfLines={1} style={{ color: theme.colors.label, fontSize: 17, fontWeight: "600" }}>
              {pageTitle(page)}
            </Text>
            <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 12 }} style={{ flex: 1 }}>
              <DetailBody onPush={onPush} page={page} />
            </ScrollView>
          </View>
        </ExpoDrawer>
      ))}
    </>
  );
}

function thoughtTitle(durationMs: number | null | undefined): string {
  if (durationMs == null || durationMs <= 0) return "Thought for a few seconds";
  const total = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `Thought for ${hours}h${minutes}m${seconds}s`;
  if (minutes > 0) return `Thought for ${minutes}m${seconds}s`;
  return `Thought for ${seconds}s`;
}

function pageTitle(page: DetailPage): string {
  if (page.kind === "tool") return collapsedToolTitle(page.part);
  return page.title;
}

function DetailBody({
  onPush,
  page,
}: {
  onPush: (page: DetailPage) => void;
  page: DetailPage;
}) {
  if (page.kind === "tool") return <AgentChatToolDetail part={page.part} />;
  if (page.kind === "thinking") return <AgentChatMarkdown text={page.text} tone="thinking" />;
  if (page.kind === "group") {
    return (
      <View style={{ gap: 4 }}>
        {page.parts.map((part, index) => (
          <DetailRow key={`${part.type}:${index}`} onPush={onPush} part={part} />
        ))}
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      {page.segments.map((segment, index) => {
        if (segment.type === "tool_group") {
          return (
            <DetailLink
              key={segment.indexes.join("-") || `group-${index}`}
              label={toolGroupOverview(segment.parts)}
              onPress={() => onPush({
                kind: "group",
                title: toolGroupOverview(segment.parts),
                parts: segment.parts,
              })}
            />
          );
        }
        if (segment.part.type === "text") {
          return <AgentChatMarkdown key={`text-${segment.index}`} text={segment.part.text} />;
        }
        return <DetailRow key={`${segment.part.type}:${segment.index}`} onPush={onPush} part={segment.part} />;
      })}
    </View>
  );
}

function DetailRow({
  onPush,
  part,
}: {
  onPush: (page: DetailPage) => void;
  part: AgentPart;
}) {
  if (part.type === "tool_call") {
    return <AgentChatToolCard onPress={() => onPush({ kind: "tool", part })} part={part} />;
  }
  if (part.type === "thinking") {
    const title = thoughtTitle(part.duration_ms);
    return (
      <DetailLink
        label={title}
        onPress={() => onPush({ kind: "thinking", title, text: part.text })}
      />
    );
  }
  if (part.type === "text") return <AgentChatMarkdown text={part.text} />;
  if (part.type === "error") return <SheetText text={part.message} />;
  return null;
}

function DetailLink({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useMobileTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ alignItems: "center", flexDirection: "row", gap: 6, paddingVertical: 8 }}
    >
      <Text numberOfLines={2} style={{ color: theme.colors.label, flex: 1, fontSize: 16, lineHeight: 22 }}>
        {label}
      </Text>
      <ChevronRightIcon color={theme.colors.secondaryLabel} size={14} strokeWidth={2.2} />
    </Pressable>
  );
}

function SheetText({ text }: { text: string }) {
  const theme = useMobileTheme();
  return (
    <Text selectable style={{ color: theme.colors.label, fontSize: 16, lineHeight: 22 }}>
      {text}
    </Text>
  );
}
