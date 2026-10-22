import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import { controlSize, frame } from "@expo/ui/swift-ui/modifiers";
import { Platform } from "react-native";

/**
 * JSON-safe stand-in for SwiftUI `CGFloat.infinity`.
 * `Number.POSITIVE_INFINITY` becomes `null` on the RN bridge, so
 * `frame(maxWidth: .infinity)` never reaches SwiftUI and filled buttons
 * stay a hugging capsule.
 */
export const EXPO_UI_FRAME_INFINITY = 1_000_000;

/**
 * Stretch a Button to the Host width and use the large control size.
 * Pass as Button `modifiers` with Host `style={expoUiButtonHostStyle}`.
 */
export const expoUiButtonStretchModifiers = Platform.select({
  ios: [
    frame({
      maxWidth: EXPO_UI_FRAME_INFINITY,
      minHeight: 52,
    }),
    controlSize("large"),
  ],
  android: [fillMaxWidth()],
  default: undefined,
});
