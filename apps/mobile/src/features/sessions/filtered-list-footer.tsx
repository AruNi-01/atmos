import { Pressable, Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { ListLoadMoreFooter } from "@/ui/layout/app-screen";
import type { FilteredListStatus } from "./filtered-list-page";

export function FilteredListFooter({
  onRetry,
  status,
}: {
  onRetry: () => void;
  status: FilteredListStatus;
}) {
  const theme = useMobileTheme();
  if (status === "loading-more") return <ListLoadMoreFooter loading />;
  if (status !== "error") return null;

  return (
    <View style={{ alignItems: "center", paddingVertical: 18 }}>
      <Text style={{ color: theme.colors.secondaryLabel, fontSize: 13, marginBottom: 8 }}>
        Could not load more.
      </Text>
      <Pressable accessibilityLabel="Try again" accessibilityRole="button" onPress={onRetry}>
        <Text style={{ color: theme.colors.label, fontSize: 15 }}>Try again</Text>
      </Pressable>
    </View>
  );
}
