import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import { controlSize, frame } from "@expo/ui/swift-ui/modifiers";
import { Platform } from "react-native";

/**
 * Stretch a Button to the Host width and use the large control size.
 * Pass as Button `modifiers` with Host `style={expoUiButtonHostStyle}`.
 */
export const expoUiButtonStretchModifiers = Platform.select({
  ios: [
    frame({
      maxWidth: Number.POSITIVE_INFINITY,
      minHeight: 52,
    }),
    controlSize("large"),
  ],
  android: [fillMaxWidth()],
  default: undefined,
});
