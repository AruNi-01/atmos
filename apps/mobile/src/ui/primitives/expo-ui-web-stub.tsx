import type { ReactNode } from "react";
import {
  Modal,
  Pressable,
  Switch as RNSwitch,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type AnyProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  [key: string]: unknown;
};

/** Web stand-in for `@expo/ui` so Expo web can render the Test page without native modules. */
export function Host({ children, style }: AnyProps) {
  return <View style={style}>{children}</View>;
}

export function Button({
  children,
  disabled,
  label,
  onPress,
  style,
}: AnyProps & { disabled?: boolean; label?: string; onPress?: () => void }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={style}>
      {label ? <Text>{label}</Text> : null}
      {children}
    </Pressable>
  );
}

export const RNHostView = View;

export function BottomSheet({
  children,
  isPresented,
  onDismiss,
}: AnyProps & { isPresented?: boolean; onDismiss?: () => void }) {
  if (!isPresented) return null;
  return (
    <Modal animationType="slide" onRequestClose={onDismiss} transparent visible>
      <Pressable
        onPress={onDismiss}
        style={{ backgroundColor: "rgba(0,0,0,0.32)", flex: 1, justifyContent: "flex-end" }}
      >
        <Pressable onPress={() => {}} style={{ backgroundColor: "#fff" }}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function Switch({
  disabled,
  label,
  onValueChange,
  value,
}: {
  disabled?: boolean;
  label?: string;
  onValueChange?: (value: boolean) => void;
  value?: boolean;
}) {
  return (
    <View>
      {label ? <Text>{label}</Text> : null}
      <RNSwitch disabled={disabled} onValueChange={onValueChange} value={value} />
    </View>
  );
}

export function List({ children }: AnyProps) {
  return <View>{children}</View>;
}

export function ListItem({
  children,
  onPress,
  supportingText,
  title,
  trailing,
}: AnyProps & {
  onPress?: () => void;
  supportingText?: ReactNode;
  title?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <Pressable onPress={onPress}>
      <Text>{title ?? children}</Text>
      {typeof supportingText === "string" ? <Text>{supportingText}</Text> : supportingText}
      {typeof trailing === "string" ? <Text>{trailing}</Text> : trailing}
    </Pressable>
  );
}

export function Picker({ children }: AnyProps) {
  return <View>{children}</View>;
}

export function Icon(_props: AnyProps) {
  return null;
}
Icon.select = (_spec: unknown) => "";

export function TextInput(_props: AnyProps) {
  return null;
}

export function OutlinedTextField(_props: AnyProps) {
  return null;
}

export function SegmentedButton(_props: AnyProps) {
  return null;
}

export function SingleChoiceSegmentedButtonRow({ children }: AnyProps) {
  return <View>{children}</View>;
}

export function SegmentedControl(_props: AnyProps) {
  return null;
}

export function Menu({ children }: AnyProps) {
  return <View>{children}</View>;
}

export function Section({ children }: AnyProps) {
  return <View>{children}</View>;
}

export function Toggle(_props: AnyProps) {
  return null;
}

export const Shape = {};

export function useNativeState<T>(initial: T): [T, (next: T) => void] {
  return [initial, () => {}];
}

export function MenuView({ children }: AnyProps) {
  return <View>{children}</View>;
}

export function fillMaxWidth() {
  return {};
}

export function height() {
  return {};
}

export function controlSize() {
  return {};
}

export function frame() {
  return {};
}

export function disabled() {
  return {};
}

export function labelStyle() {
  return {};
}

export function tint() {
  return {};
}

export { Text };
