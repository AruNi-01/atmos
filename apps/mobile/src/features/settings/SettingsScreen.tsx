import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { ComputerRow } from "@/api/types";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { Row, Separator } from "@/ui/layout/row";
import { NativeButton, NativeSegmentedControl, NativeTextInput } from "@/ui/primitives/native-controls";
import {
  ChevronRightIcon,
  KeyIcon,
  LaptopIcon,
  PencilIcon,
  RadioIcon,
  RefreshIcon,
  SunMoonIcon,
  TrashIcon,
} from "@/ui/icons/lucide-native";
import { useMobileSettingsController } from "@/features/settings/use-mobile-settings-controller";
import { radii } from "@/theme/radii";
import { typography } from "@/theme/typography";
import { themePreferenceOptions, useMobileTheme, type MobileThemePreference } from "@/theme/theme-store";

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
            <NativeButton
              grow
              icon={KeyIcon}
              label={settings.hasDeviceCredential ? "Re-pair" : "Sign in / Scan"}
              onPress={() => router.push("/sign-in")}
              surface="control"
              tone="secondary"
            />
            <NativeButton
              grow
              disabled={
                !settings.hasDeviceCredential || settings.signOutPhone.isPending
              }
              icon={TrashIcon}
              label={
                settings.signOutPhone.isPending ? "Signing out..." : "Sign out phone"
              }
              onPress={settings.confirmSignOutPhone}
              surface="control"
              tone="danger"
            />
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
          <NativeButton
            disabled={relayConfigured || settings.saveRelaySettings.isPending}
            icon={RadioIcon}
            label={settings.saveRelaySettings.isPending ? "Saving..." : "Save Relay"}
            onPress={() => settings.saveRelaySettings.mutate()}
            surface="control"
            tone={relayConfigured ? "secondary" : "default"}
          />
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
          <NativeButton
            disabled={
              !settings.hasDeviceCredential ||
              settings.createRegisterCommand.isPending
            }
            icon={LaptopIcon}
            label={settings.createRegisterCommand.isPending ? "Creating..." : "Create Register Command"}
            onPress={() => settings.createRegisterCommand.mutate()}
            surface="control"
          />
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
              <NativeButton
                disabled={settings.computersQuery.isFetching}
                icon={RefreshIcon}
                label={settings.computersQuery.isFetching ? "Refreshing..." : "Refresh Computers"}
                onPress={() => void settings.computersQuery.refetch()}
                surface="control"
                tone="secondary"
              />
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
              <NativeButton
                disabled={settings.computersQuery.isFetching}
                icon={RefreshIcon}
                label={settings.computersQuery.isFetching ? "Refreshing..." : "Refresh"}
                onPress={() => void settings.computersQuery.refetch()}
                surface="control"
                tone="text"
              />
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
            <NativeButton
              grow
              disabled={!settings.selectedServerId || settings.rename.isPending || !settings.renameValue.trim()}
              icon={PencilIcon}
              label={settings.rename.isPending ? "Renaming..." : "Rename"}
              onPress={() => settings.rename.mutate()}
              surface="control"
            />
            <NativeButton
              grow
              disabled={!settings.selectedServerId || settings.revoke.isPending}
              icon={TrashIcon}
              label={settings.revoke.isPending ? "Revoking..." : "Revoke"}
              onPress={settings.confirmRevokeSelectedComputer}
              surface="control"
              tone="danger"
            />
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
