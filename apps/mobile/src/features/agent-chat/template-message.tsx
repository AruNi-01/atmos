/**
 * Message chrome from Evan Bacon's chat-template (MIT).
 * User text is a right-aligned bubble. Assistant text is full width.
 */
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";

const USER_BUBBLE = { dark: "#242424", light: "#f2f1ef" } as const;

export function ChatBubble({
  from,
  children,
}: {
  from: "user" | "assistant";
  children: ReactNode;
}) {
  const theme = useMobileTheme();
  if (from === "user") {
    return (
      <View
        style={{
          alignSelf: "flex-end",
          backgroundColor: theme.isDark ? USER_BUBBLE.dark : USER_BUBBLE.light,
          borderCurve: "continuous",
          borderRadius: 16,
          marginBottom: 8,
          maxWidth: "80%",
          padding: 12,
        }}
      >
        {typeof children === "string" ? (
          <Text selectable style={{ color: theme.colors.label, fontSize: 16, lineHeight: 22 }}>
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    );
  }

  return <View style={{ marginBottom: 8, width: "100%" }}>{children}</View>;
}
