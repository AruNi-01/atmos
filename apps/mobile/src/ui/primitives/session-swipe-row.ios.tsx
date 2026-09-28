import { Host, RNHostView } from "@expo/ui";
import { Button, Image, SwipeActions } from "@expo/ui/swift-ui";
import { accessibilityLabel, labelStyle } from "@expo/ui/swift-ui/modifiers";
import type { SFSymbol } from "sf-symbols-typescript";
import { View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import type { SessionSwipeRowProps } from "./session-swipe-row.types";

function SwipeIconButton({
  label,
  onPress,
  role,
  systemName,
}: {
  label: string;
  onPress: () => void;
  role?: "destructive";
  systemName: SFSymbol;
}) {
  return (
    <Button
      modifiers={[labelStyle("iconOnly"), accessibilityLabel(label)]}
      onPress={onPress}
      role={role}
    >
      <Image color="#ffffff" size={20} systemName={systemName} />
    </Button>
  );
}

export function SessionSwipeRow({
  archiveLabel = "Archive",
  backgroundColor,
  children,
  deleteLabel = "Delete",
  onArchive,
  onDelete,
  onPin,
  pinLabel,
}: SessionSwipeRowProps) {
  const theme = useMobileTheme();
  const hasTrailing = Boolean(onArchive || onDelete);

  return (
    <Host
      colorScheme={theme.colorScheme}
      matchContents={{ vertical: true }}
      style={{ backgroundColor: "transparent", width: "100%" }}
    >
      <SwipeActions>
        <RNHostView matchContents>
          <View style={{ backgroundColor }}>{children}</View>
        </RNHostView>
        <SwipeActions.Actions allowsFullSwipe={false} edge="leading">
          <SwipeIconButton label={pinLabel} onPress={onPin} systemName="pin" />
        </SwipeActions.Actions>
        {hasTrailing ? (
          <SwipeActions.Actions allowsFullSwipe={false} edge="trailing">
            {onArchive ? (
              <SwipeIconButton
                label={archiveLabel}
                onPress={onArchive}
                systemName="archivebox"
              />
            ) : null}
            {onDelete ? (
              <SwipeIconButton
                label={deleteLabel}
                onPress={onDelete}
                role="destructive"
                systemName="trash"
              />
            ) : null}
          </SwipeActions.Actions>
        ) : null}
      </SwipeActions>
    </Host>
  );
}
