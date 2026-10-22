import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import {
  buttonBorderShape,
  buttonStyle,
  controlSize,
  fixedSize,
  frame,
} from "@expo/ui/swift-ui/modifiers";
import { Platform } from "react-native";

/**
 * JSON-safe stand-in for SwiftUI `CGFloat.infinity`.
 * `Number.POSITIVE_INFINITY` becomes `null` on the RN bridge, so
 * `frame(maxWidth: .infinity)` never reaches SwiftUI and filled buttons
 * stay a hugging capsule.
 */
export const EXPO_UI_FRAME_INFINITY = 1_000_000;

const VARIANT_BUTTON_STYLE = {
  filled: "borderedProminent",
  outlined: "bordered",
  text: "plain",
} as const;

/**
 * Layout-only stretch. Universal Button still prepends `buttonStyle`, so filled
 * chrome can hug inside this frame. Prefer `expoUiButtonStretchModifiersFor`
 * when the control must actually fill the Host width.
 */
export const expoUiButtonStretchModifiers = Platform.select({
  ios: [
    frame({
      alignment: "leading",
      maxWidth: EXPO_UI_FRAME_INFINITY,
      minHeight: 52,
    }),
    controlSize("large"),
    buttonBorderShape("roundedRectangle"),
  ],
  android: [fillMaxWidth()],
  default: undefined,
});

/**
 * Stretch a Button to the Host width and use the large control size.
 * `fixedSize(horizontal: false)` then `buttonStyle` last. Filled chrome still
 * needs `expoUiButtonLabelStretchModifiers` on a SwiftUI `Text` child.
 * Pass with Host `style={expoUiButtonHostStyle}`. Do not also pass
 * `style={{ height }}`: Expo UI `FrameModifier` takes the fixed-size branch
 * when `height` is set and ignores `maxWidth`.
 */
export function expoUiButtonStretchModifiersFor(variant: keyof typeof VARIANT_BUTTON_STYLE) {
  const stretch = expoUiButtonStretchModifiers;
  if (Platform.OS !== "ios" || stretch == null) return stretch;
  return [...stretch, fixedSize({ horizontal: false }), buttonStyle(VARIANT_BUTTON_STYLE[variant])];
}

/**
 * Frame the button *label*, not only the Button view. `borderedProminent`
 * sizes chrome to the label; a Button-level `frame(maxWidth:)` just parks a
 * short capsule in a wide Host (centered by default, leading after alignment).
 * Outlined `bordered` already paints the frame, which is why Turn off looked
 * full-width while Update/Publish did not.
 */
export const expoUiButtonLabelStretchModifiers = Platform.select({
  ios: [
    frame({
      alignment: "center",
      maxWidth: EXPO_UI_FRAME_INFINITY,
    }),
  ],
  default: undefined,
});
