import { Button, Host } from "@expo/ui";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { ComputerRow } from "@/api/types";
import { useMobileSettingsController } from "@/features/settings/use-mobile-settings-controller";
import { radii } from "@/theme/radii";
import { typography } from "@/theme/typography";
import {
  themePreferenceOptions,
  useMobileTheme,
  type MobileThemePreference,
} from "@/theme/theme-store";
import { AppScreen, EmptyState, InlineError, Section } from "@/ui/layout/app-screen";
import { Row, Separator } from "@/ui/layout/row";
import {
  ChevronRightIcon,
  LaptopIcon,
  LinkIcon,
  LogOutIcon,
  PlusCircleIcon,
  SunMoonIcon,
  UserIcon,
} from "@/ui/icons/lucide-native";
import { NativeSegmentedControl, NativeTextInput } from "@/ui/primitives/native-controls";
import { expoUiButtonStretchModifiers } from "@/ui/primitives/expo-ui-button-modifiers";
import {
  expoUiButtonHostStyle,
  expoUiPrimaryStyle,
  expoUiSecondaryStyle,
} from "@/ui/primitives/expo-ui-button-styles";

const buttonStretchModifiers = expoUiButtonStretchModifiers;

type LucideIcon = typeof LaptopIcon;

export function SettingsScreen() {
  return <SettingsIndexScreen />;
}

/** Grok-style root: profile row + short section lists. No card CTAs. */
export function SettingsIndexScreen() {
  const router = useRouter();
  const theme = useMobileTheme();
  const settings = useMobileSettingsController();
  const onlineCount = settings.activeComputers.filter((c) => c.online).length;
  const computersMeta =
    settings.activeComputers.length === 0
      ? "None"
      : `${settings.activeComputers.length}${onlineCount > 0 ? ` · ${onlineCount} online` : ""}`;

  return (
    <AppScreen surface="sheet">
      <Section>
        <SettingsProfileRow
          signedIn={settings.hasDeviceCredential}
          onPress={() => router.push("/sign-in")}
        />
      </Section>

      <Section label="Account">
        <SettingsListRow
          Icon={UserIcon}
          title={settings.hasDeviceCredential ? "Re-pair phone" : "Sign in / Pair"}
          onPress={() => router.push("/sign-in")}
        />
        {settings.hasDeviceCredential ? (
          <>
            <Separator />
            <SettingsListRow
              Icon={LogOutIcon}
              title={
                settings.signOutPhone.isPending ? "Signing out..." : "Sign out phone"
              }
              destructive
              onPress={
                settings.signOutPhone.isPending
                  ? undefined
                  : settings.confirmSignOutPhone
              }
            />
          </>
        ) : null}
      </Section>

      <Section label="Computer">
        <SettingsListRow
          Icon={LinkIcon}
          title="Relay"
          value={shortRelayHost(settings.relayUrl)}
          onPress={() => router.push("/settings/relay")}
        />
        <Separator />
        <SettingsListRow
          Icon={LaptopIcon}
          title="My Computers"
          value={computersMeta}
          onPress={() => router.push("/settings/computers")}
        />
        <Separator />
        <SettingsListRow
          Icon={PlusCircleIcon}
          title="Register Computer"
          onPress={() => router.push("/settings/register")}
        />
      </Section>

      <Section label="Preferences">
        <View style={{ gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
            <SettingsIconWell Icon={SunMoonIcon} />
            <Text
              style={[
                typography.rowTitle,
                { color: theme.colors.label, flex: 1 },
              ]}
            >
              Theme
            </Text>
          </View>
          <NativeSegmentedControl<MobileThemePreference>
            onValueChange={theme.setPreference}
            options={themePreferenceOptions}
            selectedValue={theme.preference}
          />
        </View>
      </Section>

      <InlineError message={settings.error} />
    </AppScreen>
  );
}

/** Sparse form: fields + one Save action (Grok form density). */
export function SettingsRelayScreen() {
  const theme = useMobileTheme();
  const settings = useMobileSettingsController();
  const canSave = settings.canSaveRelaySettings && !settings.saveRelaySettings.isPending;
  const saveStyle = expoUiPrimaryStyle(theme.colors, !canSave);

  return (
    <AppScreen surface="sheet">
      <View className="gap-5">
        <FieldBlock label="Relay URL">
          <NativeTextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) => {
              settings.setRelayDraft(value);
              settings.setError(null);
            }}
            placeholder="https://relay.atmos.land"
            value={settings.relayDraft}
          />
        </FieldBlock>

        <FieldBlock label="Secret key">
          <NativeTextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(value) => {
              settings.setRelaySecretDraft(value);
              settings.setError(null);
            }}
            placeholder="Self-hosted only"
            secureTextEntry
            value={settings.relaySecretDraft}
          />
        </FieldBlock>

        <Host
          matchContents={{ vertical: true }}
          colorScheme={theme.colorScheme}
          seedColor={saveStyle.seedColor}
          style={expoUiButtonHostStyle}
        >
          <Button
            disabled={!canSave}
            label={
              settings.saveRelaySettings.isPending
                ? "Saving..."
                : settings.relayConfigured
                  ? "Saved"
                  : "Save"
            }
            modifiers={buttonStretchModifiers}
            onPress={canSave ? () => settings.saveRelaySettings.mutate() : undefined}
            style={saveStyle.style}
            variant={saveStyle.variant}
          />
        </Host>

        <InlineError message={settings.error} />
      </View>
    </AppScreen>
  );
}

/** List of Computers only — refresh via pull or single quiet action. */
export function SettingsComputersScreen() {
  const theme = useMobileTheme();
  const router = useRouter();
  const settings = useMobileSettingsController();
  const refreshStyle = expoUiSecondaryStyle(
    theme.colors,
    settings.computersQuery.isFetching,
  );

  return (
    <AppScreen surface="sheet">
      <Stack.Screen
        options={{
          ...(process.env.EXPO_OS === "ios"
            ? {
                unstable_headerRightItems: () => [
                  {
                    type: "button" as const,
                    label: "Refresh",
                    icon: { type: "sfSymbol" as const, name: "arrow.clockwise" as const },
                    disabled: settings.computersQuery.isFetching,
                    onPress: () => void settings.computersQuery.refetch(),
                    accessibilityLabel: "Refresh Computers",
                    variant: "plain" as const,
                  },
                ],
              }
            : {
                headerRight: () => null,
              }),
        }}
      />

      {settings.activeComputers.length === 0 ? (
        <Section>
          <EmptyState
            layout="section"
            title="No Computers"
            message="Register a server, then refresh."
          />
          {process.env.EXPO_OS !== "ios" ? (
            <View className="px-card-padding pb-card-padding">
              <Host
                matchContents={{ vertical: true }}
                colorScheme={theme.colorScheme}
                seedColor={refreshStyle.seedColor}
                style={expoUiButtonHostStyle}
              >
                <Button
                  disabled={settings.computersQuery.isFetching}
                  label={
                    settings.computersQuery.isFetching ? "Refreshing..." : "Refresh"
                  }
                  modifiers={buttonStretchModifiers}
                  onPress={
                    settings.computersQuery.isFetching
                      ? undefined
                      : () => void settings.computersQuery.refetch()
                  }
                  style={refreshStyle.style}
                  variant={refreshStyle.variant}
                />
              </Host>
            </View>
          ) : null}
        </Section>
      ) : (
        <Section>
          {settings.activeComputers.map((computer, index) => (
            <View key={computer.server_id}>
              <ComputerListRow
                computer={computer}
                selectedServerId={settings.selectedServerId}
                onPress={() => {
                  settings.focusComputer(computer);
                  router.push({
                    pathname: "/settings/computer",
                    params: { serverId: computer.server_id },
                  });
                }}
              />
              {index < settings.activeComputers.length - 1 ? <Separator /> : null}
            </View>
          ))}
        </Section>
      )}

      <InlineError message={settings.error} />
    </AppScreen>
  );
}

/** Single Computer: name field + destructive revoke row. */
export function SettingsComputerDetailScreen() {
  const theme = useMobileTheme();
  const params = useLocalSearchParams<{ serverId?: string }>();
  const settings = useMobileSettingsController();
  const serverId = typeof params.serverId === "string" ? params.serverId : null;
  const computer =
    settings.activeComputers.find((row) => row.server_id === serverId) ??
    settings.selectedComputer;
  const renameDisabled =
    !serverId ||
    settings.rename.isPending ||
    !settings.renameValue.trim();
  const renameStyle = expoUiPrimaryStyle(theme.colors, renameDisabled);

  useEffect(() => {
    if (!serverId) return;
    const row = settings.activeComputers.find((c) => c.server_id === serverId);
    if (row && settings.selectedServerId !== serverId) {
      settings.focusComputer(row);
    }
  }, [serverId, settings.activeComputers, settings.focusComputer, settings.selectedServerId]);

  useEffect(() => {
    if (computer) {
      settings.setRenameValue(computer.display_name ?? "");
    }
    // Prefill once per computer open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computer?.server_id]);

  if (!computer) {
    return (
      <AppScreen surface="sheet">
        <EmptyState title="Computer not found" message="Go back and pick a Computer." />
      </AppScreen>
    );
  }

  return (
    <AppScreen surface="sheet">
      <View className="gap-5">
        <FieldBlock label="Name">
          <NativeTextInput
            onChangeText={settings.setRenameValue}
            placeholder="Computer name"
            value={settings.renameValue}
          />
        </FieldBlock>

        <Text className="px-1 text-secondary-label" style={typography.rowSubtitle}>
          {computer.server_id}
        </Text>

        <Host
          matchContents={{ vertical: true }}
          colorScheme={theme.colorScheme}
          seedColor={renameStyle.seedColor}
          style={expoUiButtonHostStyle}
        >
          <Button
            disabled={renameDisabled}
            label={settings.rename.isPending ? "Saving..." : "Save name"}
            modifiers={buttonStretchModifiers}
            onPress={renameDisabled ? undefined : () => settings.rename.mutate()}
            style={renameStyle.style}
            variant={renameStyle.variant}
          />
        </Host>

        <Section>
          <Pressable
            accessibilityRole="button"
            disabled={settings.revoke.isPending}
            onPress={settings.confirmRevokeSelectedComputer}
            style={({ pressed }) =>
              pressed ? { backgroundColor: theme.colors.mutedPressed } : undefined
            }
          >
            <View className="min-h-row-min-height items-center justify-center px-row-x py-row-y">
              <Text style={[typography.rowTitle, { color: theme.colors.red }]}>
                {settings.revoke.isPending ? "Revoking..." : "Revoke Computer"}
              </Text>
            </View>
          </Pressable>
        </Section>

        <InlineError message={settings.error} />
      </View>
    </AppScreen>
  );
}

/** Register: one action + optional command block. */
export function SettingsRegisterScreen() {
  const theme = useMobileTheme();
  const settings = useMobileSettingsController();
  const disabled =
    !settings.hasDeviceCredential || settings.createRegisterCommand.isPending;
  const createStyle = expoUiPrimaryStyle(theme.colors, disabled);

  return (
    <AppScreen surface="sheet">
      <View className="gap-5">
        {!settings.hasDeviceCredential ? (
          <EmptyState
            title="Sign in required"
            message="Pair this phone before creating a register command."
          />
        ) : (
          <Host
            matchContents={{ vertical: true }}
            colorScheme={theme.colorScheme}
            seedColor={createStyle.seedColor}
            style={expoUiButtonHostStyle}
          >
            <Button
              disabled={disabled}
              label={
                settings.createRegisterCommand.isPending
                  ? "Creating..."
                  : "Create command"
              }
              modifiers={buttonStretchModifiers}
              onPress={
                disabled ? undefined : () => settings.createRegisterCommand.mutate()
              }
              style={createStyle.style}
              variant={createStyle.variant}
            />
          </Host>
        )}

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
              className="font-mono text-terminal-fg text-mono-code leading-mono-code"
            >
              {settings.registerCommand}
            </Text>
          </View>
        ) : null}

        <InlineError message={settings.error} />
      </View>
    </AppScreen>
  );
}

function SettingsProfileRow({
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

function SettingsListRow({
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

function SettingsIconWell({ Icon }: { Icon: LucideIcon }) {
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

function FieldBlock({ label, children }: { label: string; children: ReactNode }) {
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
      subtitle={computer.online ? "Online" : "Offline"}
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

function shortRelayHost(url: string) {
  try {
    return new URL(url).host || url;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || url;
  }
}
