import type { ReactElement, ReactNode } from "react";
import { requireNativeView } from "expo";
import { View, type StyleProp, type ViewStyle } from "react-native";

type NativeEdgeView = (props: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) => ReactElement;

const NativeScrollEdge: NativeEdgeView | null =
  process.env.EXPO_OS !== "ios" ? null : requireNativeView("AtmosScrollEdge");

/** iOS 26 draws a blur on each scroll edge. This view hides that blur underneath it. */
export function HideScrollEdge({
  children,
  style,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}): ReactElement {
  if (!NativeScrollEdge) return <View style={style}>{children}</View>;
  return <NativeScrollEdge style={style}>{children}</NativeScrollEdge>;
}
