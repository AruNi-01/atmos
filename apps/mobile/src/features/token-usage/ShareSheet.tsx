import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import WebView, { type WebViewMessageEvent } from "react-native-webview";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Host } from "@expo/ui";
import {
  hubDeleteUsagePage,
  hubGetUsagePage,
  hubPutUsagePage,
  type UsageVisibility,
} from "@atmos/hub-client";
import type { TokenUsageOverviewResponse } from "@atmos/api-types/ws/dto/token-usage";
import { formatCompactNumber, formatCurrencyCompact } from "@/features/token-usage/format";
import { shareCardHtml } from "@/features/token-usage/share-card-html";
import { mapOverviewToSharePayload } from "@/features/token-usage/share-payload";
import { useMobileTheme } from "@/theme/theme-store";
import { DownloadIcon } from "@/ui/icons/lucide-native";
import { ExpoDrawer } from "@/ui/primitives/expo-drawer";
import { expoUiButtonHostStyle, expoUiPrimaryStyle } from "@/ui/primitives/expo-ui-button-styles";
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
        shareText,
        tokens,
      }),
    [cost, isDark, messages, overview?.summary.active_days, shareText, tokens],
  );

  useEffect(() => {
    if (!open) setPreview(null);
  }, [open]);

  const onMessage = (event: WebViewMessageEvent) => {
    const payload = JSON.parse(event.nativeEvent.data) as { type?: string; url?: string };
    if (payload.type === "preview" && payload.url) setPreview(payload.url);
    if (payload.type === "share-fallback") {
      void Linking.openURL(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`);
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
    <ExpoDrawer isPresented={open} onDismiss={onDismiss} snapPoints={[{ fraction: 0.72 }]}>
      <NativeSegmentedControl
        onValueChange={setTab}
        options={[
          { label: "Share", value: "share" },
          { label: "Publish", value: "publish" },
        ]}
        selectedValue={tab}
      />
      {tab === "share" ? (
        <View style={{ gap: 12, marginTop: 12 }}>
          <View style={[styles.preview, { backgroundColor: theme.colors.cardSubtle, borderColor: theme.colors.separator }]}>
            {preview ? (
              <Image resizeMode="cover" source={{ uri: preview }} style={styles.previewImage} />
            ) : (
              <Text style={{ color: theme.colors.secondaryLabel }}>Capturing…</Text>
            )}
          </View>
          <View style={styles.actions}>
            <Social label="X" onPress={() => openSocial(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`)} />
            <Social label="Reddit" onPress={() => openSocial(`https://www.reddit.com/submit?url=${encodeURIComponent(SITE)}&title=${encodeURIComponent(shareText.split("\n")[0] ?? shareText)}`)} />
            <Social label="Facebook" onPress={() => openSocial(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SITE)}`)} />
            <Social label="Threads" onPress={() => openSocial(`https://www.threads.net/intent/post?text=${encodeURIComponent(shareText)}`)} />
            <Pressable accessibilityLabel="Save image" onPress={() => webRef.current?.injectJavaScript("window.shareCard && window.shareCard(); true;")}>
              <DownloadIcon color={theme.colors.label} size={18} />
            </Pressable>
          </View>
        </View>
      ) : (
        <PublishPane onDone={onDismiss} overview={overview} />
      )}
    </ExpoDrawer>
    </>
  );
}

function Social({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useMobileTheme();
  return (
    <Pressable onPress={onPress} style={[styles.social, { borderColor: theme.colors.separator }]}>
      <Text style={{ color: theme.colors.label, fontSize: 12, fontWeight: "700" }}>{label}</Text>
    </Pressable>
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
  const look = expoUiPrimaryStyle(theme.colors, publish.isPending || !overview);
  const slug = page?.handle || handle.trim().replace(/^@+/, "");
  const url = page?.url ?? (slug ? `${SITE}/tok/@${slug}` : null);

  useEffect(() => {
    if (page?.handle) setHandle(page.handle);
  }, [page?.handle]);

  return (
    <View style={{ gap: 12, marginTop: 12 }}>
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
      <Host colorScheme={theme.colorScheme} matchContents seedColor={look.seedColor} style={expoUiButtonHostStyle}>
        <Button
          disabled={publish.isPending || !overview}
          label={publish.isPending ? "Publishing…" : live ? "Update" : "Publish"}
          onPress={() => publish.mutate()}
          style={look.style}
          variant={look.variant}
        />
      </Host>
      {live ? (
        <Pressable onPress={() => turnOff.mutate()}>
          <Text style={{ color: theme.colors.secondaryLabel, textAlign: "center" }}>Turn off</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { alignItems: "center", flexDirection: "row", gap: 8 },
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
  social: { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingVertical: 6 },
});
