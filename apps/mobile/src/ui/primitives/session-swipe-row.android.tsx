import { useRef, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { ArchiveIcon, PinIcon, TrashIcon } from "@/ui/icons/lucide-native";
import type { SessionSwipeRowProps } from "./session-swipe-row.types";

function SwipeAction({
  color,
  icon,
  label,
  onPress,
}: {
  color: string;
  icon: ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={{
        alignItems: "center",
        backgroundColor: color,
        justifyContent: "center",
        width: 72,
      }}
    >
      {icon}
    </Pressable>
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
  const swipeRef = useRef<Swipeable>(null);
  const close = () => swipeRef.current?.close();
  const hasTrailing = Boolean(onArchive || onDelete);

  return (
    <Swipeable
      ref={swipeRef}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={() => (
        <SwipeAction
          color="#2563eb"
          icon={<PinIcon color="#ffffff" size={20} />}
          label={pinLabel}
          onPress={() => {
            close();
            onPin();
          }}
        />
      )}
      renderRightActions={
        hasTrailing
          ? () => (
              <View style={{ flexDirection: "row" }}>
                {onArchive ? (
                  <SwipeAction
                    color="#d97706"
                    icon={<ArchiveIcon color="#ffffff" size={20} />}
                    label={archiveLabel}
                    onPress={() => {
                      close();
                      onArchive();
                    }}
                  />
                ) : null}
                {onDelete ? (
                  <SwipeAction
                    color="#dc2626"
                    icon={<TrashIcon color="#ffffff" size={20} />}
                    label={deleteLabel}
                    onPress={() => {
                      close();
                      onDelete();
                    }}
                  />
                ) : null}
              </View>
            )
          : undefined
      }
    >
      <View style={{ backgroundColor }}>{children}</View>
    </Swipeable>
  );
}
