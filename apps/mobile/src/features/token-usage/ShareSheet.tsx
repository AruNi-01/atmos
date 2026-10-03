import { useEffect, useRef, useState, type ReactNode } from "react";
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
import { releaseUsageImage, type UsageShot } from "@/features/token-usage/capture-usage-image";
import { UsageShareGenerating } from "@/features/token-usage/share-generating";
import { formatCompactNumber, formatCurrencyCompact } from "@/features/token-usage/format";
import { saveUsageCardImage } from "@/features/token-usage/save-usage-card";
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
  capture,
  onDismiss,
  open,
  overview,
  totalCost,
  totalTokens,
}: {
  capture: () => Promise<UsageShot>;
  onDismiss: () => void;
  open: boolean;
  overview: TokenUsageOverviewResponse | null;
  totalCost: number | null;
  totalTokens: number;
}) {
  const theme = useMobileTheme();
  const [tab, setTab] = useState<"share" | "publish">("share");
  const [preview, setPreview] = useState<UsageShot | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const saveRequest = useRef(0);
  const activeSave = useRef<number | null>(null);
  const shotUri = useRef<string | null>(null);
  const tokens = formatCompactNumber(totalTokens);
  const cost = formatCurrencyCompact(totalCost);
  const shareText = `My AI agent usage on Atmos: ${tokens} tokens · ${cost}\nAtmosphere for Agentic Builders\n${SITE}`;

  useEffect(() => {
    if (!open) {
      saveRequest.current += 1;
      const saving = activeSave.current !== null;
      activeSave.current = null;
      const uri = shotUri.current;
      shotUri.current = null;
      if (uri && !saving) releaseUsageImage(uri);
      setPreview(null);
      setCaptureError(null);
      setSaveError(null);
      setSaveState("idle");
      return;
    }
    let alive = true;
    setPreview(null);
    setCaptureError(null);
    setSaveError(null);
    setSaveState("idle");
    const start = setTimeout(() => {
      if (!alive) return;
      void capture()
        .then((shot) => {
          if (!alive) {
            releaseUsageImage(shot.uri);
            return;
          }
          const previous = shotUri.current;
          shotUri.current = shot.uri;
          if (previous && previous !== shot.uri) releaseUsageImage(previous);
          setPreview(shot);
        })
        .catch((reason: unknown) => {
          if (!alive) return;
          setCaptureError(reason instanceof Error ? reason.message : "Could not capture this page.");
        });
    }, 180);
    return () => {
      alive = false;
      clearTimeout(start);
    };
  }, [capture, open]);

  const requestSave = () => {
    const uri = shotUri.current;
    if (!uri || activeSave.current !== null) return;
    const request = saveRequest.current + 1;
    saveRequest.current = request;
    activeSave.current = request;
    setSaveError(null);
    setSaveState("saving");
    void saveUsageCardImage(uri)
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

  const openSocial = (url: string) => {
    void Linking.openURL(url);
  };

  return (
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
          <View style={[styles.preview, preview ? null : styles.previewSlot, { backgroundColor: theme.colors.cardSubtle, borderColor: theme.colors.separator }]}>
            {preview ? (
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={styles.previewScroll}>
                <Image resizeMode="contain" source={{ uri: preview.uri }} style={{ aspectRatio: preview.aspect, width: "100%" }} />
              </ScrollView>
            ) : captureError ? (
              <View style={styles.previewMessage}>
                <Text style={{ color: theme.colors.red, fontSize: 13 }}>{captureError}</Text>
              </View>
            ) : (
              <UsageShareGenerating dark={theme.isDark} />
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
                accessibilityState={{ busy: saveState === "saving", disabled: saveState === "saving" || !preview }}
                disabled={saveState === "saving" || !preview}
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
  actions: { alignItems: "center", flexDirection: "row", flexShrink: 0, flexWrap: "wrap", gap: 8 },
  pane: { alignSelf: "stretch", flexShrink: 0, gap: 12, marginTop: 12, width: "100%" },
  sheet: { alignSelf: "stretch", flexShrink: 0, width: "100%" },
  tabs: { alignSelf: "stretch", flexShrink: 0, width: "100%" },
  preview: {
    borderCurve: "continuous",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 0,
    overflow: "hidden",
    width: "100%",
  },
  previewMessage: { alignItems: "center", height: 168, justifyContent: "center" },
  previewScroll: { flexShrink: 0, maxHeight: 360, width: "100%" },
  previewSlot: { height: 168 },
  socialButton: { alignItems: "center", flexDirection: "row", flexShrink: 0, gap: 6, minHeight: 36, paddingHorizontal: 10, paddingVertical: 8 },
  socialGlass: { borderRadius: 999, flexShrink: 0 },
});
