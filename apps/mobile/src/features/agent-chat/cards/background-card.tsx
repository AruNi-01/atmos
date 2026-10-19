import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useMobileTheme } from "@/theme/theme-store";
import { CommandTerminalIcon, TerminalIcon } from "@/ui/icons/lucide-native";
import type { BackgroundCommand } from "../composer-cards";
import { copy, fillTemplate } from "../copy";

/** Tailwind v4 `emerald-500`: `oklch(0.696 0.17 162.48)`. */
const LIVE_DOT = "#00bc7d";

export function BackgroundCard({ commands }: { commands: BackgroundCommand[] }) {
  const theme = useMobileTheme();
  const muted = theme.colors.secondaryLabel;
  const [open, setOpen] = useState(true);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 6,
        }}
      >
        <TerminalIcon color={muted} size={16} strokeWidth={2} />
        <Text
          style={{
            color: theme.colors.label,
            fontSize: 14,
            fontWeight: "500",
            lineHeight: 20,
          }}
        >
          {copy.backgroundCommandsTitle}
        </Text>
        <Text
          style={{
            color: muted,
            fontSize: 14,
            lineHeight: 20,
            marginLeft: "auto",
            marginRight: 4,
          }}
        >
          {fillTemplate(copy.backgroundCommandsRunningCount, { count: commands.length })}
        </Text>
      </Pressable>
      {open ? (
        <View style={{ paddingBottom: 4, paddingHorizontal: 6 }}>
          {commands.map((command) => (
            <View
              key={command.id}
              style={{
                alignItems: "center",
                flexDirection: "row",
                gap: 8,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            >
              <View
                style={{
                  alignItems: "center",
                  height: 16,
                  justifyContent: "center",
                  width: 16,
                }}
              >
                <CommandTerminalIcon color={muted} size={14} strokeWidth={2} />
                <View
                  style={{
                    backgroundColor: LIVE_DOT,
                    borderRadius: 999,
                    height: 6,
                    position: "absolute",
                    right: -2,
                    top: -2,
                    width: 6,
                  }}
                />
              </View>
              <Text
                numberOfLines={1}
                style={{
                  color: theme.colors.secondaryLabel,
                  flex: 1,
                  fontFamily: "Menlo",
                  fontSize: 12,
                  lineHeight: 16,
                }}
              >
                {command.preview ? `${command.command} · ${command.preview}` : command.command}
              </Text>
              <Text style={{ color: muted, fontSize: 11, lineHeight: 16 }}>
                {copy.backgroundCommandsRunning}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
