import { Host, Text, VStack } from "@expo/ui/swift-ui";
import { padding, redacted } from "@expo/ui/swift-ui/modifiers";
import { Platform, View } from "react-native";
import { spacing } from "@/theme/spacing";
import { useMobileTheme } from "@/theme/theme-store";

const PLACEHOLDER_ROWS = ["Session title", "Another session", "One more session"] as const;

/** Placeholder rows for a grouped list. iOS uses Expo UI's SwiftUI redaction. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  if (Platform.OS === "ios") {
    return (
      <Host matchContents>
        <VStack alignment="leading" modifiers={[redacted("placeholder"), padding({ horizontal: 18, vertical: 8 })]} spacing={14}>
          {PLACEHOLDER_ROWS.slice(0, rows).map((label) => (
            <VStack alignment="leading" key={label} spacing={6}>
              <Text>{label}</Text>
              <Text>atmos</Text>
            </VStack>
          ))}
        </VStack>
      </Host>
    );
  }

  return <FallbackListSkeleton rows={rows} />;
}

function FallbackListSkeleton({ rows }: { rows: number }) {
  const theme = useMobileTheme();

  return (
    <View style={{ gap: 16, paddingHorizontal: spacing.rowX, paddingVertical: 14 }}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={{ gap: 8 }}>
          <View
            style={{
              backgroundColor: theme.colors.cardSubtle,
              borderRadius: 6,
              height: 14,
              width: index === 1 ? "62%" : "78%",
            }}
          />
          <View
            style={{
              backgroundColor: theme.colors.cardSubtle,
              borderRadius: 6,
              height: 12,
              width: "36%",
            }}
          />
        </View>
      ))}
    </View>
  );
}
