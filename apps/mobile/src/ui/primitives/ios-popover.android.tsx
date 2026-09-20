import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import type {
  IosPopoverDirection,
  IosPopoverProps,
  IosPopoverTriggerKind,
} from "./ios-popover.types";

export { POPOVER_PRESENT_ANIMATION } from "./ios-popover.types";
export type { IosPopoverDirection, IosPopoverProps, IosPopoverTriggerKind } from "./ios-popover.types";

type PopoverContextValue = {
  direction: IosPopoverDirection;
  setVisible: (visible: boolean) => void;
  trigger: IosPopoverTriggerKind;
  visible: boolean;
};

const PopoverContext = createContext<PopoverContextValue | null>(null);

function usePopoverContext() {
  const value = useContext(PopoverContext);
  if (!value) {
    throw new Error("IosPopover compound parts must be rendered inside IosPopover.");
  }
  return value;
}

function IosPopoverRoot({
  children,
  direction = "any",
  trigger = "tap",
}: IosPopoverProps) {
  const [visible, setVisible] = useState(false);
  const value = useMemo(
    () => ({ direction, setVisible, trigger, visible }),
    [direction, trigger, visible],
  );

  return <PopoverContext.Provider value={value}>{children}</PopoverContext.Provider>;
}

function Trigger({
  children,
  style,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { setVisible, trigger } = usePopoverContext();
  const open = () => setVisible(true);

  return (
    <Pressable
      onLongPress={trigger === "longPress" ? open : undefined}
      onPress={trigger === "tap" ? open : undefined}
      style={style}
    >
      {children}
    </Pressable>
  );
}

function Content({
  children,
  onDismiss,
  style,
}: {
  children?: ReactNode;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { direction, setVisible, visible } = usePopoverContext();
  const close = () => {
    setVisible(false);
    onDismiss?.();
  };
  const pinToBottom = direction === "top";

  return (
    <Modal animationType="fade" onRequestClose={close} transparent visible={visible}>
      <Pressable onPress={close} style={[styles.backdrop, pinToBottom ? styles.backdropBottom : styles.backdropTop]}>
        <View style={styles.cardShadow}>
          <Pressable onPress={() => {}} style={[styles.card, style]}>
            {children}
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

function MenuPressable({
  children,
  dismissOnPress = false,
  onPress,
  style,
}: {
  children?: ReactNode;
  dismissOnPress?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { setVisible } = usePopoverContext();

  return (
    <Pressable
      onPress={() => {
        onPress?.();
        if (dismissOnPress) setVisible(false);
      }}
      style={style}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.32)",
    flex: 1,
    paddingHorizontal: 20,
  },
  backdropBottom: {
    justifyContent: "flex-end",
    paddingBottom: 88,
  },
  backdropTop: {
    justifyContent: "flex-start",
    paddingTop: 88,
  },
  card: {
    borderCurve: "continuous",
    borderRadius: 16,
    overflow: "hidden",
  },
  cardShadow: {
    alignSelf: "center",
    borderRadius: 16,
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.28)",
    elevation: 12,
    maxWidth: 280,
    shadowColor: "#000",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    width: "100%",
  },
});

/** Android/web fallback: overlay modal, never a BottomSheet / formSheet. */
export const IosPopover = Object.assign(IosPopoverRoot, {
  Content,
  Pressable: MenuPressable,
  Trigger,
});
