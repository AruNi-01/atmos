import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { ComputerRow } from "@/api/types";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { Separator } from "@/ui/layout/row";
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
import { colors } from "@/theme/colors";
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
        <View style={styles.block}>
          <View style={styles.preferenceHeader}>
            <View
              style={[
                styles.iconWell,
                { backgroundColor: theme.colors.cardSubtle, borderColor: theme.colors.separator },
              ]}
            >
              <SunMoonIcon color={theme.colors.label} size={18} strokeWidth={2.4} />
            </View>
            <View style={styles.settingsRowText}>
              <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.colors.label }]}>
                Theme
              </Text>
              <Text numberOfLines={2} style={[styles.rowDescription, { color: theme.colors.secondaryLabel }]}>
                {theme.preference === "system" ? "Follow system appearance" : `${theme.preference === "dark" ? "Dark" : "Light"} mode`}
              </Text>
            </View>
          </View>
          <NativeSegmentedControl<MobileThemePreference>
            onValueChange={theme.setPreference}
            options={themePreferenceOptions}
            selectedValue={theme.preference}
          />
        </View>
      </Section>

      <Section label="System & Integration">
        <View style={styles.list}>
          {systemEntries.map((entry) => (
            <SettingsListItem
              entry={entry}
              key={entry.id}
              onPress={() => router.push(entry.route)}
            />
          ))}
        </View>
      </Section>
    </AppScreen>
  );
}

export function SettingsComputersScreen() {
  const theme = useMobileTheme();
  const router = useRouter();
  const settings = useMobileSettingsController();
  const relayChanged = settings.canSaveRelaySettings;

  return (
    <AppScreen surface="sheet">
      <Section label="Account">
        <View style={styles.settingsBlock}>
          <SettingsHint
            message={
              settings.hasDeviceCredential
                ? "This phone is signed in with a Hub device. The credential is never shown."
                : "Sign in or scan a Desktop/Web pair QR to link this phone."
            }
          />
          <View style={styles.actionRow}>
            <NativeButton
              grow
              icon={KeyIcon}
              label={settings.hasDeviceCredential ? "Re-pair" : "Sign in / Scan"}
              onPress={() => router.replace("/onboarding")}
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
        <View style={styles.settingsBlock}>
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
            disabled={!settings.canSaveRelaySettings || settings.saveRelaySettings.isPending}
            icon={RadioIcon}
            label={settings.saveRelaySettings.isPending ? "Saving..." : "Save Relay"}
            onPress={() => settings.saveRelaySettings.mutate()}
            surface="control"
            tone={relayChanged ? "default" : "secondary"}
          />
          <SettingsHint
            message={
              settings.canSaveRelaySettings
                ? "relay.atmos.land does not need a secret. Self-hosted relays use RELAY_SECRET_KEY."
                : "Relay settings are already saved."
            }
          />
        </View>
      </Section>

      <Section label="Register Computer">
        <View style={styles.settingsBlock}>
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
            <View style={[styles.commandBlock, { backgroundColor: theme.colors.terminalBg }]}>
              <Text selectable style={[styles.commandIntro, { color: theme.colors.terminalMuted }]}>
                Run this once on the machine that hosts Atmos Server.
              </Text>
              <Text selectable style={[styles.commandText, { color: theme.colors.terminalFg }]}>
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
            <View style={styles.blockTopless}>
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
                <ComputerListItem
                  computer={computer}
                  selectedServerId={settings.selectedServerId}
                  onPress={() => settings.selectComputer(computer)}
                />
                {index < settings.activeComputers.length - 1 ? <Separator /> : null}
              </View>
            ))}
            <View style={styles.listFooter}>
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
        <View style={styles.settingsBlock}>
          <SelectedComputerSummary computer={settings.selectedComputer} />
          <NativeTextInput
            onChangeText={settings.setRenameValue}
            placeholder="New Computer name"
            value={settings.renameValue}
          />
          <View style={styles.actionRow}>
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

function SettingsListItem({
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
      style={({ pressed }) => [
        styles.settingsRow,
        pressed ? { backgroundColor: theme.colors.mutedPressed } : null,
      ]}
    >
      <View style={styles.settingsRowLeading}>
        <View
          style={[
            styles.iconWell,
            { backgroundColor: theme.colors.cardSubtle, borderColor: theme.colors.separator },
          ]}
        >
          <Icon color={theme.colors.label} size={18} strokeWidth={2.4} />
        </View>
        <View style={styles.settingsRowText}>
          <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.colors.label }]}>
            {entry.title}
          </Text>
          <Text numberOfLines={2} style={[styles.rowDescription, { color: theme.colors.secondaryLabel }]}>
            {entry.description}
          </Text>
        </View>
      </View>
      <View style={styles.trailing}>
        <ChevronRightIcon color={theme.colors.tertiaryLabel} size={18} strokeWidth={2.6} />
      </View>
    </Pressable>
  );
}

function ComputerListItem({
  computer,
  onPress,
  selectedServerId,
}: {
  computer: ComputerRow;
  onPress: () => void;
  selectedServerId: string | null;
}) {
  const theme = useMobileTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.settingsRow,
        pressed ? { backgroundColor: theme.colors.mutedPressed } : null,
      ]}
    >
      <View style={styles.settingsRowText}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.colors.label }]}>
          {computer.display_name ?? computer.server_id}
        </Text>
        <Text numberOfLines={1} style={[styles.rowDescription, { color: theme.colors.secondaryLabel }]}>
          {computer.server_id}
        </Text>
      </View>
      <ComputerStatus computer={computer} selectedServerId={selectedServerId} />
    </Pressable>
  );
}

function ComputerStatus({
  computer,
  selectedServerId,
}: {
  computer: ComputerRow;
  selectedServerId: string | null;
}) {
  const theme = useMobileTheme();

  return (
    <View style={styles.computerStatus}>
      {computer.server_id === selectedServerId ? (
        <Text style={[styles.selectedText, { color: theme.colors.label }]}>Selected</Text>
      ) : null}
      <Text
        style={[
          styles.statusPill,
          computer.online
            ? { backgroundColor: theme.colors.greenSurface, color: theme.colors.green }
            : { backgroundColor: theme.colors.mutedPressed, color: theme.colors.secondaryLabel },
        ]}
      >
        {computer.online ? "Online" : "Offline"}
      </Text>
    </View>
  );
}

function SelectedComputerSummary({ computer }: { computer: ComputerRow | null }) {
  const theme = useMobileTheme();

  if (!computer) {
    return <SettingsHint message="Select a Computer before renaming or revoking it." />;
  }

  return (
    <View style={styles.summary}>
      <Text numberOfLines={1} style={[styles.summaryTitle, { color: theme.colors.label }]}>
        {computer.display_name ?? computer.server_id}
      </Text>
      <Text numberOfLines={1} style={[styles.summaryText, { color: theme.colors.secondaryLabel }]}>
        {computer.server_id}
      </Text>
    </View>
  );
}

function SettingsHint({ message }: { message: string }) {
  const theme = useMobileTheme();

  return (
    <Text selectable style={[styles.hint, { color: theme.colors.secondaryLabel }]}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  block: {
    gap: 12,
    padding: 16,
  },
  blockTopless: {
    gap: 12,
    padding: 16,
    paddingTop: 0,
  },
  commandBlock: {
    backgroundColor: colors.terminalBg,
    borderCurve: "continuous",
    borderRadius: 18,
    gap: 10,
    overflow: "hidden",
    padding: 14,
  },
  commandIntro: {
    color: colors.terminalMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  commandText: {
    color: colors.terminalFg,
    fontFamily: "Menlo",
    fontSize: 12,
    lineHeight: 18,
  },
  computerStatus: {
    alignItems: "flex-end",
    gap: 6,
  },
  hint: {
    color: colors.secondaryLabel,
    fontSize: 13,
    lineHeight: 18,
  },
  iconWell: {
    alignItems: "center",
    backgroundColor: colors.cardSubtle,
    borderColor: colors.separator,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  list: {
    paddingVertical: 4,
  },
  listFooter: {
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  preferenceHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  rowDescription: {
    color: colors.secondaryLabel,
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 17,
  },
  rowTitle: {
    color: colors.label,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 21,
  },
  selectedText: {
    color: colors.label,
    fontSize: 12,
    fontWeight: "700",
  },
  settingsRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 74,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  settingsRowLeading: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 12,
    minWidth: 0,
  },
  settingsRowText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  settingsBlock: {
    gap: 14,
    padding: 16,
  },
  statusPill: {
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  summary: {
    gap: 3,
  },
  summaryText: {
    color: colors.secondaryLabel,
    fontSize: 12,
    lineHeight: 16,
  },
  summaryTitle: {
    color: colors.label,
    fontSize: 17,
    fontWeight: "800",
  },
  trailing: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
});
