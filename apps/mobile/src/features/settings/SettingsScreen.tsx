import { Button, Host } from "@expo/ui";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import { controlSize, frame } from "@expo/ui/swift-ui/modifiers";
import type { ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { ComputerRow } from "@/api/types";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { Row, Separator } from "@/ui/layout/row";
import { NativeSegmentedControl, NativeTextInput } from "@/ui/primitives/native-controls";
import {
  ChevronRightIcon,
  LaptopIcon,
  SunMoonIcon,
} from "@/ui/icons/lucide-native";
import { useMobileSettingsController } from "@/features/settings/use-mobile-settings-controller";
import { radii } from "@/theme/radii";
import { typography } from "@/theme/typography";
import { themePreferenceOptions, useMobileTheme, type MobileThemePreference } from "@/theme/theme-store";

const buttonStretchModifiers = Platform.select({
  ios: [frame({ maxWidth: Number.POSITIVE_INFINITY }), controlSize("large")],
  android: [fillMaxWidth()],
  default: undefined,
});

type SettingsRoute = "/settings/computers";

type SettingsEntry = {
  description: string;
  icon: typeof LaptopIcon;
  id: string;
  route: SettingsRoute;
  title: string;
};

export function SettingsScreen() {
  return <SettingsIndexScreen />;
}

export function SettingsIndexScreen() {
  const router = useRouter();
  const theme = useMobileTheme();

  const systemEntries: SettingsEntry[] = [
    {
      description: "Account pairing, registration, and Computers linked to this phone.",
      icon: LaptopIcon,
      id: "atmos-computer",
      route: "/settings/computers",
      title: "Atmos Computer",
    },
  ];

  return (
    <AppScreen surface="sheet">
      <Section label="Preferences">
        <View className="gap-3 p-card-padding">
          <SettingsIconTextRow
            description={
              theme.preference === "system"
                ? "Follow system appearance"
                : `${theme.preference === "dark" ? "Dark" : "Light"} mode`
            }
            Icon={SunMoonIcon}
            title="Theme"
          />
          <NativeSegmentedControl<MobileThemePreference>
            onValueChange={theme.setPreference}
            options={themePreferenceOptions}
            selectedValue={theme.preference}
          />
        </View>
      </Section>

      <Section label="System & Integration">
        {systemEntries.map((entry, index) => (
          <View key={entry.id}>
            <SettingsNavRow entry={entry} onPress={() => router.push(entry.route)} />
            {index < systemEntries.length - 1 ? <Separator /> : null}
          </View>
        ))}
      </Section>
    </AppScreen>
  );
}

export function SettingsComputersScreen() {
  const theme = useMobileTheme();
  const router = useRouter();
  const settings = useMobileSettingsController();
  const relayConfigured = settings.relayConfigured;

  return (
    <AppScreen surface="sheet">
      <Section label="Account">
        <View className="gap-3.5 p-card-padding">
          <SettingsHint
            message={
              settings.hasDeviceCredential
                ? "This phone is signed in with a Hub device. The credential is never shown."
                : "Sign in or scan a Desktop/Web pair QR to link this phone."
            }
          />
          <View className="flex-row gap-action-row-gap">
            <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={theme.colors.label}
      style={{ alignSelf: "stretch", flex: 1, minWidth: 0, width: "100%" }}
    >
      <Button
        label={settings.hasDeviceCredential ? "Re-pair" : "Sign in / Scan"}
        onPress={() => router.push("/sign-in")}
        modifiers={buttonStretchModifiers}
        style={{
      backgroundColor: theme.colors.control,
      borderColor: theme.colors.controlBorder,
      borderRadius: radii.control,
      borderWidth: 1,
      height: 52,
      paddingHorizontal: 22,
    }}
        variant="outlined"
      />
    </Host>
            <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={!settings.hasDeviceCredential || settings.signOutPhone.isPending ? theme.colors.tertiaryLabel : theme.colors.red}
      style={{ alignSelf: "stretch", flex: 1, minWidth: 0, width: "100%" }}
    >
      <Button
        disabled={!settings.hasDeviceCredential || settings.signOutPhone.isPending}
        label={settings.signOutPhone.isPending ? "Signing out..." : "Sign out phone"}
        onPress={(!settings.hasDeviceCredential || settings.signOutPhone.isPending) ? undefined : (settings.confirmSignOutPhone)}
        modifiers={buttonStretchModifiers}
        style={{
      backgroundColor: !settings.hasDeviceCredential || settings.signOutPhone.isPending ? theme.colors.control : theme.colors.redSurface,
      borderColor: !settings.hasDeviceCredential || settings.signOutPhone.isPending ? theme.colors.separator : theme.colors.redBorder,
      borderRadius: radii.control,
      borderWidth: 1,
      height: 52,
      paddingHorizontal: 22,
    }}
        variant="outlined"
      />
    </Host>
          </View>
        </View>
      </Section>

      <Section label="Relay">
        <View className="gap-3.5 p-card-padding">
          <NativeTextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) => {
              settings.setRelayDraft(value);
              settings.setError(null);
            }}
            placeholder="Relay URL"
            value={settings.relayDraft}
          />
          <NativeTextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) => {
              settings.setRelaySecretDraft(value);
              settings.setError(null);
            }}
            placeholder="Relay secret key (self-hosted only)"
            secureTextEntry
            value={settings.relaySecretDraft}
          />
          <Host
            matchContents={{ vertical: true }}
            colorScheme={theme.colorScheme}
            seedColor={
              relayConfigured || settings.saveRelaySettings.isPending
                ? theme.colors.tertiaryLabel
                : theme.colors.ctaFill
            }
            style={{ alignSelf: "stretch", width: "100%" }}
          >
            <Button
              disabled={relayConfigured || settings.saveRelaySettings.isPending}
              label={settings.saveRelaySettings.isPending ? "Saving..." : "Save Relay"}
              modifiers={buttonStretchModifiers}
              onPress={
                relayConfigured || settings.saveRelaySettings.isPending
                  ? undefined
                  : () => settings.saveRelaySettings.mutate()
              }
              style={
                relayConfigured
                  ? {
                      backgroundColor: theme.colors.control,
                      borderColor: theme.colors.separator,
                      borderRadius: radii.control,
                      borderWidth: 1,
                      height: 52,
                      paddingHorizontal: 22,
                    }
                  : {
                      backgroundColor: settings.saveRelaySettings.isPending
                        ? theme.colors.controlDisabled
                        : theme.colors.ctaFill,
                      borderRadius: radii.control,
                      height: 52,
                      paddingHorizontal: 22,
                    }
              }
              variant={relayConfigured ? "outlined" : "filled"}
            />
          </Host>
          <SettingsHint
            message={
              relayConfigured
                ? "Relay settings are already saved."
                : "relay.atmos.land does not need a secret. Self-hosted relays use RELAY_SECRET_KEY."
            }
          />
        </View>
      </Section>

      <Section label="Register Computer">
        <View className="gap-3.5 p-card-padding">
          <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={!settings.hasDeviceCredential ||
              settings.createRegisterCommand.isPending ? theme.colors.tertiaryLabel : theme.colors.ctaFill}
      style={{ alignSelf: "stretch", width: "100%" }}
    >
      <Button
        disabled={!settings.hasDeviceCredential ||
              settings.createRegisterCommand.isPending}
        label={settings.createRegisterCommand.isPending ? "Creating..." : "Create Register Command"}
        onPress={(!settings.hasDeviceCredential ||
              settings.createRegisterCommand.isPending) ? undefined : (() => settings.createRegisterCommand.mutate())}
        modifiers={buttonStretchModifiers}
        style={{
      backgroundColor: !settings.hasDeviceCredential ||
              settings.createRegisterCommand.isPending ? theme.colors.controlDisabled : theme.colors.ctaFill,
      borderRadius: radii.control,
      height: 52,
      paddingHorizontal: 22,
    }}
        variant="filled"
      />
    </Host>
          {settings.registerCommand ? (
            <View
              className="gap-2.5 overflow-hidden p-3.5"
              style={{
                backgroundColor: theme.colors.terminalBg,
                borderCurve: "continuous",
                borderRadius: radii.cardNested,
              }}
            >
              <Text
                selectable
                className="text-terminal-muted text-body-small leading-body-small"
              >
                Run this once on the machine that hosts Atmos Server.
              </Text>
              <Text
                selectable
                className="font-mono text-terminal-fg text-mono-code leading-mono-code"
              >
                {settings.registerCommand}
              </Text>
            </View>
          ) : (
            <SettingsHint message="Create a one-time command to register another Mac or remote server." />
          )}
        </View>
      </Section>

      <Section label="My Computers">
        {settings.activeComputers.length === 0 ? (
          <View>
            <EmptyState
              title="No Computers"
              message="Register an Atmos Server or refresh after an existing Computer reconnects."
            />
            <View className="px-card-padding pb-card-padding">
              <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={settings.computersQuery.isFetching ? theme.colors.tertiaryLabel : theme.colors.label}
      style={{ alignSelf: "stretch", width: "100%" }}
    >
      <Button
        disabled={settings.computersQuery.isFetching}
        label={settings.computersQuery.isFetching ? "Refreshing..." : "Refresh Computers"}
        onPress={(settings.computersQuery.isFetching) ? undefined : (() => void settings.computersQuery.refetch())}
        modifiers={buttonStretchModifiers}
        style={{
      backgroundColor: theme.colors.control,
      borderColor: settings.computersQuery.isFetching ? theme.colors.separator : theme.colors.controlBorder,
      borderRadius: radii.control,
      borderWidth: 1,
      height: 52,
      paddingHorizontal: 22,
    }}
        variant="outlined"
      />
    </Host>
            </View>
          </View>
        ) : (
          <View>
            {settings.activeComputers.map((computer, index) => (
              <View key={computer.server_id}>
                <ComputerListRow
                  computer={computer}
                  selectedServerId={settings.selectedServerId}
                  onPress={() => settings.selectComputer(computer)}
                />
                {index < settings.activeComputers.length - 1 ? <Separator /> : null}
              </View>
            ))}
            <View className="px-card-padding py-1">
              <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={settings.computersQuery.isFetching ? theme.colors.tertiaryLabel : theme.colors.label}
      style={{ alignSelf: "stretch", width: "100%" }}
    >
      <Button
        disabled={settings.computersQuery.isFetching}
        label={settings.computersQuery.isFetching ? "Refreshing..." : "Refresh"}
        onPress={(settings.computersQuery.isFetching) ? undefined : (() => void settings.computersQuery.refetch())}
        modifiers={buttonStretchModifiers}
        style={{
      backgroundColor: theme.colors.control,
      borderColor: settings.computersQuery.isFetching ? theme.colors.separator : theme.colors.controlBorder,
      borderRadius: radii.control,
      borderWidth: 1,
      height: 52,
      paddingHorizontal: 22,
    }}
        variant="outlined"
      />
    </Host>
            </View>
          </View>
        )}
      </Section>

      <Section label="Selected Computer">
        <View className="gap-3.5 p-card-padding">
          <SelectedComputerSummary computer={settings.selectedComputer} />
          <NativeTextInput
            onChangeText={settings.setRenameValue}
            placeholder="New Computer name"
            value={settings.renameValue}
          />
          <View className="flex-row gap-action-row-gap">
            <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={!settings.selectedServerId || settings.rename.isPending || !settings.renameValue.trim() ? theme.colors.tertiaryLabel : theme.colors.ctaFill}
      style={{ alignSelf: "stretch", flex: 1, minWidth: 0, width: "100%" }}
    >
      <Button
        disabled={!settings.selectedServerId || settings.rename.isPending || !settings.renameValue.trim()}
        label={settings.rename.isPending ? "Renaming..." : "Rename"}
        onPress={(!settings.selectedServerId || settings.rename.isPending || !settings.renameValue.trim()) ? undefined : (() => settings.rename.mutate())}
        modifiers={buttonStretchModifiers}
        style={{
      backgroundColor: !settings.selectedServerId || settings.rename.isPending || !settings.renameValue.trim() ? theme.colors.controlDisabled : theme.colors.ctaFill,
      borderRadius: radii.control,
      height: 52,
      paddingHorizontal: 22,
    }}
        variant="filled"
      />
    </Host>
            <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.colorScheme}
      seedColor={!settings.selectedServerId || settings.revoke.isPending ? theme.colors.tertiaryLabel : theme.colors.red}
      style={{ alignSelf: "stretch", flex: 1, minWidth: 0, width: "100%" }}
    >
      <Button
        disabled={!settings.selectedServerId || settings.revoke.isPending}
        label={settings.revoke.isPending ? "Revoking..." : "Revoke"}
        onPress={(!settings.selectedServerId || settings.revoke.isPending) ? undefined : (settings.confirmRevokeSelectedComputer)}
        modifiers={buttonStretchModifiers}
        style={{
      backgroundColor: !settings.selectedServerId || settings.revoke.isPending ? theme.colors.control : theme.colors.redSurface,
      borderColor: !settings.selectedServerId || settings.revoke.isPending ? theme.colors.separator : theme.colors.redBorder,
      borderRadius: radii.control,
      borderWidth: 1,
      height: 52,
      paddingHorizontal: 22,
    }}
        variant="outlined"
      />
    </Host>
          </View>
        </View>
      </Section>

      <InlineError message={settings.error} />
    </AppScreen>
  );
}

function SettingsNavRow({
  entry,
  onPress,
}: {
  entry: SettingsEntry;
  onPress: () => void;
}) {
  const theme = useMobileTheme();
  const Icon = entry.icon;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) =>
        pressed ? { backgroundColor: theme.colors.mutedPressed } : undefined
      }
    >
      <View className="min-h-row-min-height px-row-x py-row-y">
        <SettingsIconTextRow
          description={entry.description}
          Icon={Icon}
          title={entry.title}
          trailing={<ChevronRightIcon color={theme.colors.tertiaryLabel} size={18} strokeWidth={2.6} />}
        />
      </View>
    </Pressable>
  );
}

function SettingsIconTextRow({
  description,
  Icon,
  title,
  trailing,
}: {
  description: string;
  Icon: typeof LaptopIcon;
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <SettingsIconWell Icon={Icon} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-label" numberOfLines={1} style={typography.rowTitle}>
          {title}
        </Text>
        <Text className="text-secondary-label" numberOfLines={2} style={typography.rowSubtitle}>
          {description}
        </Text>
      </View>
      {trailing}
    </View>
  );
}

function SettingsIconWell({
  Icon,
}: {
  Icon: typeof LaptopIcon;
}) {
  const theme = useMobileTheme();

  return (
    <View
      className="h-[38px] w-[38px] items-center justify-center border border-separator"
      style={{
        backgroundColor: theme.colors.cardSubtle,
        borderRadius: radii.iconWell,
      }}
    >
      <Icon color={theme.colors.label} size={18} strokeWidth={2.4} />
    </View>
  );
}

function ComputerListRow({
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
      subtitle={computer.server_id}
      onPress={onPress}
    >
      <ComputerStatusIndicator online={computer.online} selected={selected} />
    </Row>
  );
}

function ComputerStatusIndicator({
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
    <View className="flex-row items-center gap-1.5">
      <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor }} />
      <Text
        className={
          selected ? "text-label" : online ? "text-green" : "text-secondary-label"
        }
        style={typography.rowMeta}
      >
        {label}
      </Text>
    </View>
  );
}

function SelectedComputerSummary({ computer }: { computer: ComputerRow | null }) {
  if (!computer) {
    return <SettingsHint message="Select a Computer before renaming or revoking it." />;
  }

  return (
    <View className="gap-1">
      <Text className="text-label" numberOfLines={1} style={typography.rowTitle}>
        {computer.display_name ?? computer.server_id}
      </Text>
      <Text className="text-secondary-label" numberOfLines={1} style={typography.rowSubtitle}>
        {computer.server_id}
      </Text>
    </View>
  );
}

function SettingsHint({ message }: { message: string }) {
  return (
    <Text selectable className="text-secondary-label text-body-small leading-body-small">
      {message}
    </Text>
  );
}
