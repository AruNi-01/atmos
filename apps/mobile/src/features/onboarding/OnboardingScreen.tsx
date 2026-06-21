import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { AppScreen, InlineError, Section } from "@/ui/layout/app-screen";
import { NativeButton, NativeTextInput } from "@/ui/primitives/native-controls";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { ComputerPicker } from "@/features/computers/ComputerPicker";
import { useRelayClient } from "@/hooks/use-relay-client";
import {
  generateAccessToken,
  getStoredAccessToken,
  isPlausibleAccessToken,
  storeAccessToken,
} from "@/lib/access-token";
import { useComputerStore } from "@/stores/computer-store";
import { useSessionStore } from "@/stores/session-store";
import { colors } from "@/theme/colors";
import { useMobileTheme } from "@/theme/theme-store";

const schema = z.object({
  token: z.string().refine(isPlausibleAccessToken, "Access Token must be at least 32 characters."),
});

type FormValues = z.infer<typeof schema>;

export function OnboardingScreen() {
  const router = useRouter();
  const theme = useMobileTheme();
  const client = useRelayClient();
  const setAccessTokenLoaded = useSessionStore((state) => state.setAccessTokenLoaded);
  const hasAccessToken = useSessionStore((state) => state.hasAccessToken);
  const relayUrl = useSessionStore((state) => state.relayUrl);
  const selectedServerId = useSessionStore((state) => state.selectedServerId);
  const selectServer = useSessionStore((state) => state.selectServer);
  const setClientSession = useSessionStore((state) => state.setClientSession);
  const setComputers = useComputerStore((state) => state.setComputers);
  const [registerCommand, setRegisterCommand] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    defaultValues: { token: "" },
    resolver: zodResolver(schema),
  });

  const saveToken = useMutation({
    mutationFn: async (values: FormValues) => {
      await client.registerTenant(values.token.trim());
      await storeAccessToken(values.token.trim());
      setAccessTokenLoaded(true);
      const registerToken = await client.createRegisterToken(values.token.trim());
      return registerToken.register_command;
    },
    onSuccess: (command) => {
      setRegisterCommand(command);
      setLocalError(null);
    },
    onError: (error) => {
      setLocalError(error instanceof Error ? error.message : "Could not save Access Token.");
    },
  });

  const computersQuery = useQuery({
    queryKey: ["onboarding-computers", relayUrl, hasAccessToken],
    enabled: hasAccessToken,
    refetchInterval: 5000,
    queryFn: async () => {
      const token = await getStoredAccessToken();
      if (!token) return [];
      const computers = await client.listComputers(token);
      setComputers(computers);
      return computers;
    },
  });

  const createSession = useMutation({
    mutationFn: async (serverId: string) => {
      const token = await getStoredAccessToken();
      if (!token) throw new Error("Access Token is not available.");
      return client.createClientSession(token, serverId);
    },
    onSuccess: (session, serverId) => {
      selectServer(serverId);
      setClientSession(session);
      setLocalError(null);
      router.replace("/");
    },
    onError: (error) => {
      setLocalError(error instanceof Error ? error.message : "Could not connect to Computer.");
    },
  });

  const handleGenerate = async () => {
    form.setValue("token", await generateAccessToken(), { shouldValidate: true });
  };
  const tokenDraft = form.watch("token").trim();
  const tokenActionLabel = saveToken.isPending
    ? "Saving..."
    : hasAccessToken
      ? "Replace Token"
      : "Save Token";

  return (
    <AppScreen
      footer={
        <View style={styles.footerActions}>
          {hasAccessToken && !tokenDraft ? <TokenSavedStatus /> : null}
          {!hasAccessToken || tokenDraft ? (
            <NativeButton
              label={tokenActionLabel}
              onPress={form.handleSubmit((values) => saveToken.mutate(values))}
              disabled={saveToken.isPending}
            />
          ) : null}
          {hasAccessToken ? (
            <NativeButton
              label={computersQuery.isFetching ? "Checking Computers..." : "Refresh Computers"}
              onPress={() => {
                if (!computersQuery.isFetching) void computersQuery.refetch();
              }}
            />
          ) : null}
        </View>
      }
    >
      <Section label="Access Token">
        <View style={styles.formBlock}>
          <View style={styles.tokenSummary}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: hasAccessToken ? theme.colors.label : theme.colors.tertiaryLabel },
              ]}
            />
            <Text selectable style={[styles.statusText, { color: theme.colors.secondaryLabel }]}>
              {hasAccessToken ? "Token saved on this device" : "Token required before selecting a Computer"}
            </Text>
          </View>
          <Text selectable style={[styles.bodyText, { color: theme.colors.secondaryLabel }]}>
            Mobile connects through Relay. Atmos Server still runs on your Mac or remote machine.
          </Text>
          <Controller
            control={form.control}
            name="token"
            render={({ field }) => (
              <NativeTextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={field.onChange}
                placeholder={hasAccessToken ? "Paste a new Access Token to replace" : "Paste or generate an Access Token"}
                secureTextEntry
                value={field.value}
              />
            )}
          />
          <View style={styles.inlineAction}>
            <NativeButton label="Generate Token" onPress={handleGenerate} />
          </View>
          <InlineError message={form.formState.errors.token?.message ?? localError} />
        </View>
      </Section>

      {hasAccessToken ? (
        <ComputerPicker
          computers={computersQuery.data ?? []}
          selectedServerId={selectedServerId}
          onRefresh={() => void computersQuery.refetch()}
          isRefreshing={computersQuery.isFetching}
          onSelect={(serverId) => createSession.mutate(serverId)}
        />
      ) : null}

      <Section label="Start Atmos Server">
        {registerCommand ? (
          <View style={[styles.commandBlock, { backgroundColor: theme.colors.terminalBg }]}>
            <Text selectable style={[styles.commandIntro, { color: theme.colors.terminalMuted }]}>
              Run this once on the machine that hosts Atmos Server.
            </Text>
            <Text selectable style={[styles.commandText, { color: theme.colors.terminalFg }]}>
              {registerCommand}
            </Text>
          </View>
        ) : (
          <View style={styles.steps}>
            <Step index="1" title="Save or replace token" body="The phone only stores the Relay Access Token." />
            <Step index="2" title="Register Atmos Server" body="After saving a token, Atmos creates a one-time command for the server machine." />
            <Step index="3" title="Choose a Computer" body="Online Computers appear below automatically." />
          </View>
        )}
      </Section>

      <InlineError
        message={
          localError ??
          (computersQuery.error instanceof Error
            ? computersQuery.error.message
            : createSession.error instanceof Error
              ? createSession.error.message
              : null)
        }
      />
    </AppScreen>
  );
}

function TokenSavedStatus() {
  const theme = useMobileTheme();

  return (
    <GlassPanel
      fallbackStyle={[styles.savedStatusFallback, { backgroundColor: theme.colors.glassFallbackStrong }]}
      glassEffectStyle="clear"
      style={[styles.savedStatus, { borderColor: theme.colors.glassBorder }]}
    >
      <View style={[styles.statusDot, { backgroundColor: theme.colors.label }]} />
      <Text style={[styles.savedStatusText, { color: theme.colors.label }]}>Access Token saved</Text>
    </GlassPanel>
  );
}

function Step({
  body,
  index,
  title,
}: {
  body: string;
  index: string;
  title: string;
}) {
  const theme = useMobileTheme();

  return (
    <View style={styles.step}>
      <View style={[styles.stepIndex, { backgroundColor: theme.colors.label }]}>
        <Text style={[styles.stepIndexText, { color: theme.colors.labelInverse }]}>{index}</Text>
      </View>
      <View style={styles.stepCopy}>
        <Text selectable style={[styles.stepTitle, { color: theme.colors.label }]}>
          {title}
        </Text>
        <Text selectable style={[styles.stepBody, { color: theme.colors.secondaryLabel }]}>
          {body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bodyText: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 20,
  },
  commandBlock: {
    backgroundColor: colors.terminalBg,
    gap: 10,
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
  footerActions: {
    gap: 10,
  },
  formBlock: {
    gap: 12,
    padding: 16,
  },
  inlineAction: {
    alignItems: "flex-start",
  },
  savedStatus: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: colors.glassBorder,
    borderRadius: 999,
    flexDirection: "row",
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 14,
  },
  savedStatusFallback: {
    backgroundColor: colors.glassFallbackStrong,
  },
  savedStatusText: {
    color: colors.label,
    fontSize: 15,
    fontWeight: "700",
  },
  statusDot: {
    backgroundColor: colors.tertiaryLabel,
    borderRadius: 999,
    height: 8,
    width: 8,
  },
  statusDotOk: {
    backgroundColor: colors.label,
  },
  statusText: {
    color: colors.secondaryLabel,
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  step: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
  },
  stepBody: {
    color: colors.secondaryLabel,
    fontSize: 14,
    lineHeight: 20,
  },
  stepCopy: {
    flex: 1,
    gap: 3,
  },
  stepIndex: {
    alignItems: "center",
    backgroundColor: colors.label,
    borderRadius: 999,
    height: 24,
    justifyContent: "center",
    marginTop: 1,
    width: 24,
  },
  stepIndexText: {
    color: colors.labelInverse,
    fontSize: 12,
    fontWeight: "800",
  },
  stepTitle: {
    color: colors.label,
    fontSize: 15,
    fontWeight: "800",
  },
  steps: {
    paddingVertical: 2,
  },
  tokenSummary: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
});
