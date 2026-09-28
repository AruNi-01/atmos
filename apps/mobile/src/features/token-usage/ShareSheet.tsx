import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Host } from "@expo/ui";
import { Button, HStack, Spacer } from "@expo/ui/swift-ui";
import { buttonStyle, controlSize, disabled } from "@expo/ui/swift-ui/modifiers";
import {
  hubDeleteUsagePage,
  hubGetUsagePage,
  hubPutUsagePage,
  type UsageVisibility,
} from "@atmos/hub-client";
import type { TokenUsageOverviewResponse } from "@atmos/api-types/ws/dto/token-usage";
import { formatCompactNumber, formatCurrencyCompact } from "@/features/token-usage/format";
import { saveUsageCardImage } from "@/features/token-usage/save-usage-card";
import { shareCardHtml } from "@/features/token-usage/share-card-html";
import { mapOverviewToSharePayload } from "@/features/token-usage/share-payload";
import { useMobileTheme } from "@/theme/theme-store";
import { FacebookMark, RedditMark, ThreadsMark, XMark } from "@/features/token-usage/social-icons";
import { DownloadIcon } from "@/ui/icons/lucide-native";
import { ExpoDrawer } from "@/ui/primitives/expo-drawer";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { NativeSegmentedControl } from "@/ui/primitives/native-segmented-control";
import { NativeTextInput } from "@/ui/primitives/native-text-input";

const SITE = "https://atmos.land";

export function ShareSheet({
  isDark,
  messages,
  onDismiss,
  open,
  overview,
  totalCost,
  totalTokens,
}: {
  isDark: boolean;
  messages: number;
  onDismiss: () => void;
  open: boolean;
  overview: TokenUsageOverviewResponse | null;
  totalCost: number | null;
  totalTokens: number;
}) {
  const theme = useMobileTheme();
  const webRef = useRef<WebView>(null);
  const [tab, setTab] = useState<"share" | "publish">("share");
  const [preview, setPreview] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const saveRequest = useRef(0);
  const activeSave = useRef<number | null>(null);
  const saveStarted = useRef<number | null>(null);
  const tokens = formatCompactNumber(totalTokens);
  const cost = formatCurrencyCompact(totalCost);
  const shareText = `My AI agent usage on Atmos: ${tokens} tokens · ${cost}\nAtmosphere for Agentic Builders\n${SITE}`;
  const html = useMemo(
    () =>
      shareCardHtml({
        cost,
        days: String(overview?.summary.active_days ?? 0),
        isDark,
        messages: formatCompactNumber(messages),
        tokens,
      }),
    [cost, isDark, messages, overview?.summary.active_days, tokens],
  );

  useEffect(() => {
    if (!open) {
      saveRequest.current += 1;
      activeSave.current = null;
      saveStarted.current = null;
      setPreview(null);
      setSaveError(null);
      setSaveState("idle");
    }
  }, [open]);

  const requestSave = () => {
    if (activeSave.current !== null) return;
    const request = saveRequest.current + 1;
    saveRequest.current = request;
    activeSave.current = request;
    setSaveError(null);
    setSaveState("saving");
    webRef.current?.injectJavaScript("window.shareCard && window.shareCard(); true;");
  };

  const saveImage = (dataUrl: string, request: number) => {
    void saveUsageCardImage(dataUrl)
      .then(() => {
        if (saveRequest.current !== request) return;
        activeSave.current = null;
        setSaveState("saved");
      })
      .catch((reason: unknown) => {
        if (saveRequest.current !== request) return;
        activeSave.current = null;
        setSaveState("idle");
        setSaveError(reason instanceof Error ? reason.message : "Could not save this image.");
      });
  };

  const onMessage = (event: WebViewMessageEvent) => {
    const payload = JSON.parse(event.nativeEvent.data) as { type?: string; url?: string };
    if (payload.type === "preview" && payload.url) setPreview(payload.url);
    if (payload.type === "save-image" && payload.url) {
      const request = activeSave.current;
      if (request == null || request !== saveRequest.current || saveStarted.current === request) return;
      saveStarted.current = request;
      saveImage(payload.url, request);
    }
  };

  const openSocial = (url: string) => {
    void Linking.openURL(url);
  };

  return (
    <>
    <View pointerEvents="none" style={styles.hiddenWeb}>
      <WebView
        onMessage={onMessage}
        originWhitelist={["*"]}
        ref={webRef}
        source={{ html }}
        style={styles.web}
      />
    </View>
    <ExpoDrawer isPresented={open} matchContents={false} onDismiss={onDismiss} snapPoints={[{ fraction: 0.78 }]}>
      <View style={styles.sheet}>
      <NativeSegmentedControl
        onValueChange={setTab}
        options={[
          { label: "Share", value: "share" },
          { label: "Publish", value: "publish" },
        ]}
        selectedValue={tab}
        style={styles.tabs}
      />
      {tab === "share" ? (
        <View style={styles.pane}>
          <View style={[styles.preview, { backgroundColor: theme.colors.cardSubtle, borderColor: theme.colors.separator }]}>
            {preview ? (
              <Image resizeMode="cover" source={{ uri: preview }} style={styles.previewImage} />
            ) : (
              <Text style={{ color: theme.colors.secondaryLabel }}>Capturing…</Text>
            )}
          </View>
          <View style={styles.actions}>
            <Social icon={<XMark color={theme.colors.label} />} label="X" onPress={() => openSocial(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`)} />
            <Social icon={<RedditMark color={theme.colors.label} />} label="Reddit" onPress={() => openSocial(`https://www.reddit.com/submit?url=${encodeURIComponent(SITE)}&title=${encodeURIComponent(shareText.split("\n")[0] ?? shareText)}`)} />
            <Social icon={<FacebookMark color={theme.colors.label} />} label="Facebook" onPress={() => openSocial(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SITE)}`)} />
            <Social icon={<ThreadsMark color={theme.colors.label} />} label="Threads" onPress={() => openSocial(`https://www.threads.net/intent/post?text=${encodeURIComponent(shareText)}`)} />
            <GlassPanel interactive shadow={false} style={styles.socialGlass}>
              <Pressable
                accessibilityLabel={saveState === "saved" ? "Saved to photos" : "Save image"}
                accessibilityState={{ busy: saveState === "saving", disabled: saveState === "saving" }}
                disabled={saveState === "saving"}
                onPress={requestSave}
                style={styles.socialButton}
              >
                <DownloadIcon color={theme.colors.label} size={16} />
              </Pressable>
            </GlassPanel>
          </View>
          {saveError ? <Text style={{ color: theme.colors.red, fontSize: 13 }}>{saveError}</Text> : null}
          {saveState === "saved" ? (
            <Text style={{ color: theme.colors.secondaryLabel, fontSize: 13 }}>Saved to photos</Text>
          ) : null}
        </View>
      ) : (
        <PublishPane onDone={onDismiss} overview={overview} />
      )}
      </View>
    </ExpoDrawer>
    </>
  );
}

function Social({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  const theme = useMobileTheme();
  return (
    <GlassPanel interactive shadow={false} style={styles.socialGlass}>
      <Pressable accessibilityLabel={label} onPress={onPress} style={styles.socialButton}>
        {icon}
        <Text style={{ color: theme.colors.label, fontSize: 13, fontWeight: "600" }}>{label}</Text>
      </Pressable>
    </GlassPanel>
  );
}

function PublishPane({
  onDone,
  overview,
}: {
  onDone: () => void;
  overview: TokenUsageOverviewResponse | null;
}) {
  const theme = useMobileTheme();
  const queryClient = useQueryClient();
  const pageQuery = useQuery({
    queryKey: ["hub", "usage-page"],
    queryFn: () => hubGetUsagePage(),
  });
  const page = pageQuery.data ?? null;
  const [handle, setHandle] = useState(page?.handle ?? "");
  const [visibility, setVisibility] = useState<Exclude<UsageVisibility, "off">>(
    page?.visibility === "public" ? "public" : "unlisted",
  );
  const [error, setError] = useState<string | null>(null);
  const claimed = Boolean(page?.handle_claimed && page.handle);
  const live = page?.visibility === "public" || page?.visibility === "unlisted";
  const publish = useMutation({
    mutationFn: async () => {
      if (!overview) throw new Error("No usage to publish");
      return hubPutUsagePage({
        handle: claimed ? undefined : handle.trim().replace(/^@+/, ""),
        include_cost: true,
        snapshot: mapOverviewToSharePayload(overview, true),
        visibility,
      });
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["hub", "usage-page"] });
    },
    onError: (reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Could not publish this page");
    },
  });
  const turnOff = useMutation({
    mutationFn: () => hubDeleteUsagePage(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hub", "usage-page"] });
      onDone();
    },
  });
  const slug = page?.handle || handle.trim().replace(/^@+/, "");
  const url = page?.url ?? (slug ? `${SITE}/tok/@${slug}` : null);

  useEffect(() => {
    if (page?.handle) setHandle(page.handle);
  }, [page?.handle]);

  return (
    <View style={styles.pane}>
      <Text style={{ color: theme.colors.secondaryLabel, fontSize: 13 }}>Handle</Text>
      <NativeTextInput
        editable={!claimed && !publish.isPending}
        onChangeText={setHandle}
        placeholder="builder"
        value={handle}
      />
      <NativeSegmentedControl
        onValueChange={setVisibility}
        options={[
          { label: "Public", value: "public" },
          { label: "Unlisted", value: "unlisted" },
        ]}
        selectedValue={visibility}
      />
      {url ? (
        <Pressable onPress={() => void Linking.openURL(url)}>
          <Text style={{ color: theme.colors.label }}>{url.replace("https://", "")}</Text>
        </Pressable>
      ) : null}
      {error ? <Text style={{ color: theme.colors.red }}>{error}</Text> : null}
      <Host colorScheme={theme.colorScheme} matchContents={{ vertical: true }} style={{ width: "100%" }}>
        <HStack alignment="center" spacing={8}>
          {live ? (
            <Button
              label={turnOff.isPending ? "Turning off…" : "Turn off"}
              modifiers={[buttonStyle("glass"), controlSize("regular"), disabled(turnOff.isPending)]}
              onPress={turnOff.isPending ? undefined : () => turnOff.mutate()}
            />
          ) : null}
          <Spacer />
          <Button
            label={publish.isPending ? "Publishing…" : live ? "Update" : "Publish"}
            modifiers={[buttonStyle("glass"), controlSize("regular"), disabled(publish.isPending || !overview)]}
            onPress={publish.isPending || !overview ? undefined : () => publish.mutate()}
          />
        </HStack>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pane: { alignSelf: "stretch", gap: 12, marginTop: 12, width: "100%" },
  sheet: { alignSelf: "stretch", width: "100%" },
  tabs: { alignSelf: "stretch", width: "100%" },
  hiddenWeb: { height: 1, opacity: 0, overflow: "hidden", width: 1 },
  web: { height: 480, width: 320 },
  preview: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    height: 168,
    justifyContent: "center",
    overflow: "hidden",
  },
  previewImage: { height: "100%", width: "100%" },
  socialButton: { alignItems: "center", flexDirection: "row", gap: 6, paddingHorizontal: 10, paddingVertical: 8 },
  socialGlass: { borderRadius: 999 },
});
