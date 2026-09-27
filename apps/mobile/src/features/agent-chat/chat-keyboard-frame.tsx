/**
 * Composer lift adapted from Evan Bacon's chat-template Conversation (MIT).
 * The transcript stays in normal flow above the composer, and the keyboard
 * shortens that column so the field sits on top of the keyboard.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Keyboard, LayoutAnimation, Platform, View, type KeyboardEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function animateWithKeyboard(event: KeyboardEvent) {
  const duration = event.duration > 0 ? event.duration : 250;
  LayoutAnimation.configureNext({
    duration,
    update: { duration, type: LayoutAnimation.Types.keyboard },
  });
}

export function ChatKeyboardFrame({
  children,
  footer,
}: {
  children: ReactNode;
  footer: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (event: KeyboardEvent) => {
      animateWithKeyboard(event);
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener(hideEvent, (event: KeyboardEvent) => {
      animateWithKeyboard(event);
      setKeyboardHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const keyboardOpen = keyboardHeight > 0;

  return (
    <View style={{ flex: 1, paddingBottom: keyboardOpen ? keyboardHeight : 0 }}>
      <View style={{ flex: 1 }}>{children}</View>
      <View style={{ paddingBottom: keyboardOpen ? 0 : insets.bottom }}>{footer}</View>
    </View>
  );
}
