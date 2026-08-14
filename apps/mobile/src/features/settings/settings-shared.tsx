import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ComputerRow } from "@/api/types";
import { radii } from "@/theme/radii";
import { typography } from "@/theme/typography";
import { useMobileTheme } from "@/theme/theme-store";
import { Row, Separator } from "@/ui/layout/row";
import { ChevronRightIcon, LaptopIcon, UserIcon } from "@/ui/icons/lucide-native";

type LucideIcon = typeof LaptopIcon;

export function SettingsProfileRow({
  signedIn,
  onPress,
}: {
  signedIn: boolean;
  onPress: () => void;
}) {
  const theme = useMobileTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) =>
        pressed ? { backgroundColor: theme.colors.mutedPressed } : undefined
      }
    >
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: 12,
          minHeight: 64,
          paddingHorizontal: 16,
          paddingVertical: 14,
        }}
      >
        <View
          style={{
            alignItems: "center",
            backgroundColor: theme.colors.cardSubtle,
            borderRadius: 999,
            height: 48,
            justifyContent: "center",
            width: 48,
          }}
        >
          <UserIcon color={theme.colors.label} size={22} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={[typography.rowTitle, { color: theme.colors.label }]}
          >
            {signedIn ? "This phone" : "Not signed in"}
          </Text>
          <Text
            numberOfLines={1}
            style={[typography.rowSubtitle, { color: theme.colors.secondaryLabel }]}
          >
            {signedIn ? "Hub device linked" : "Sign in or pair with Desktop"}
          </Text>
        </View>
        <ChevronRightIcon color={theme.colors.tertiaryLabel} size={18} strokeWidth={2.6} />
      </View>
    </Pressable>
  );
}

export function SettingsListRow({
  Icon,
  title,
  value,
  onPress,
  destructive = false,
}: {
  Icon: LucideIcon;
  title: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
}) {
  const theme = useMobileTheme();

  const body = (
    <View
      style={{
        alignItems: "center",
        flexDirection: "row",
        gap: 12,
        minHeight: 64,
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <SettingsIconWell Icon={Icon} />
      <Text
        numberOfLines={1}
        style={[
          typography.rowTitle,
          {
            color: destructive ? theme.colors.red : theme.colors.label,
            flex: 1,
            minWidth: 0,
          },
        ]}
      >
        {title}
      </Text>
      {value ? (
        <Text
          numberOfLines={1}
          style={[
            typography.rowMeta,
            { color: theme.colors.secondaryLabel, maxWidth: "42%" },
          ]}
        >
          {value}
        </Text>
      ) : null}
      {onPress && !destructive ? (
        <ChevronRightIcon color={theme.colors.tertiaryLabel} size={18} strokeWidth={2.6} />
      ) : null}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) =>
        pressed ? { backgroundColor: theme.colors.mutedPressed } : undefined
      }
    >
      {body}
    </Pressable>
  );
}

export function SettingsIconWell({ Icon }: { Icon: LucideIcon }) {
  const theme = useMobileTheme();

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: theme.colors.cardSubtle,
        borderColor: theme.colors.separator,
        borderRadius: radii.iconWell,
        borderWidth: StyleSheet.hairlineWidth,
        height: 38,
        justifyContent: "center",
        width: 38,
      }}
    >
      <Icon color={theme.colors.label} size={18} strokeWidth={2.4} />
    </View>
  );
}

export function FieldBlock({ label, children }: { label: string; children: ReactNode }) {
  const theme = useMobileTheme();

  return (
    <View style={{ gap: 8 }}>
      <Text
        style={[
          typography.sectionLabel,
          { color: theme.colors.secondaryLabel, paddingHorizontal: 4 },
        ]}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

export function ComputerListRow({
  computer,
  onPress,
  selectedServerId,
}: {
  computer: ComputerRow;
  onPress: () => void;
  selectedServerId: string | null;
}) {
  const selected = computer.server_id === selectedServerId;

  return (
    <Row
      title={computer.display_name ?? computer.server_id}
      subtitle={computer.online ? "Online" : "Offline"}
      onPress={onPress}
    >
      <ComputerStatusIndicator online={computer.online} selected={selected} />
    </Row>
  );
}

export function ComputerStatusIndicator({
  online,
  selected,
}: {
  online: boolean;
  selected: boolean;
}) {
  const theme = useMobileTheme();
  const label = selected ? "Selected" : online ? "Online" : "Offline";
  const dotColor = selected
    ? theme.colors.label
    : online
      ? theme.colors.green
      : theme.colors.tertiaryLabel;

  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
      <View
        style={{
          backgroundColor: dotColor,
          borderRadius: 999,
          height: 6,
          width: 6,
        }}
      />
      <Text
        style={[
          typography.rowMeta,
          {
            color: selected
              ? theme.colors.label
              : online
                ? theme.colors.green
                : theme.colors.secondaryLabel,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function shortRelayHost(url: string) {
  try {
    return new URL(url).host || url;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || url;
  }
}
