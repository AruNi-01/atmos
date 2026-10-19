import { useState } from "react";
import { Pressable } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useMobileTheme } from "@/theme/theme-store";
import { CheckIcon, CopyIcon } from "@/ui/icons/lucide-native";
import { copy } from "./copy";

/** Web `MessageCopyButton` uses Lucide `size-3.5` inside a `size-6` hit target. */
export const COPY_MESSAGE_ICON_SIZE = 14;
export const COPY_MESSAGE_HIT = 24;
export const COPY_MESSAGE_COPIED_MS = 1200;

export function CopyMessageButton({ text }: { text: string }) {
  const theme = useMobileTheme();
  const [copied, setCopied] = useState(false);
  return (
    <Pressable
      accessibilityLabel={copy.copyMessage}
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => {
        const trimmed = text.trim();
        if (!trimmed) return;
        void Clipboard.setStringAsync(trimmed).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), COPY_MESSAGE_COPIED_MS);
        });
      }}
      style={{
        alignItems: "center",
        height: COPY_MESSAGE_HIT,
        justifyContent: "center",
        width: COPY_MESSAGE_HIT,
      }}
    >
      {copied ? (
        <CheckIcon color={theme.colors.green} size={COPY_MESSAGE_ICON_SIZE} />
      ) : (
        <CopyIcon color={theme.colors.secondaryLabel} size={COPY_MESSAGE_ICON_SIZE} />
      )}
    </Pressable>
  );
}
