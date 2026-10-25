import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button, Host } from "@expo/ui";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";
import { Text as SwiftUIText } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  controlSize,
  fixedSize,
  foregroundStyle,
  frame,
} from "@expo/ui/swift-ui/modifiers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { hubDeleteUsagePage, hubGetUsagePage, hubPutUsagePage } from "@atmos/hub-client";
import type { TokenUsageOverviewResponse } from "@atmos/api-types/ws/dto/token-usage";
import { releaseUsageImage, type UsageShot } from "@/features/token-usage/capture-usage-image";
import { UsageShareGenerating } from "@/features/token-usage/share-generating";
import { formatCompactNumber, formatCurrencyCompact } from "@/features/token-usage/format";
import {
  isUsagePageLive,
  normalizePublishHandle,
  publishBaselineFromPage,
  publishFormAfterPage,
  publishFormAfterSave,
  publishPrimaryDisabled,
  publishPrimaryLabel,
  type PublishDraft,
  type PublishFormSync,
} from "@/features/token-usage/publish-form";
import { saveUsageCardImage } from "@/features/token-usage/save-usage-card";
import { mapOverviewToSharePayload } from "@/features/token-usage/share-payload";
import { useMobileTheme } from "@/theme/theme-store";
import { FacebookMark, RedditMark, ThreadsMark, XMark } from "@/features/token-usage/social-icons";
import { radii } from "@/theme/radii";
import { DownloadIcon } from "@/ui/icons/lucide-native";
import { ExpoDrawer } from "@/ui/primitives/expo-drawer";
import {
  EXPO_UI_FRAME_INFINITY,
  expoUiButtonLabelStretchModifiers,
} from "@/ui/primitives/expo-ui-button-modifiers";
import { expoUiButtonHostStyle } from "@/ui/primitives/expo-ui-button-styles";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { NativeSegmentedControl } from "@/ui/primitives/native-segmented-control";
import { NativeSwitch } from "@/ui/primitives/native-controls";
import { NativeTextInput } from "@/ui/primitives/native-text-input";

const SITE = "https://atmos.land";
/** Full sheet only. A half detent would let a drag rest mid-screen. */
const SHARE_SHEET_DETENTS = ["large"] as const;
/** The system sheet spring has to finish before a screenshot. A layout pass during that spring drops the sheet and it bounces back. */
const SHEET_SETTLE_MS = 640;

export const ShareSheet = memo(function ShareSheet({
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
  const captureRef = useRef(capture);
  captureRef.current = capture;
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
      void captureRef
        .current()
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
          setCaptureError(
            reason instanceof Error ? reason.message : "Could not capture this page.",
          );
        });
    }, SHEET_SETTLE_MS);
    return () => {
      alive = false;
      clearTimeout(start);
    };
  }, [open]);

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
    <ExpoDrawer
      detents={SHARE_SHEET_DETENTS}
      isPresented={open}
      liftForKeyboard={false}
      matchContents={false}
      onDismiss={onDismiss}
    >
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
            <View
              style={[
                styles.preview,
                preview ? null : styles.previewSlot,
                {
                  backgroundColor: preview ? theme.colors.background : theme.colors.cardSubtle,
                  borderColor: theme.colors.separator,
                },
              ]}
            >
              {preview ? (
                <ScrollView
                  contentContainerStyle={{ backgroundColor: theme.colors.background }}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  style={[styles.previewScroll, { backgroundColor: theme.colors.background }]}
                >
                  <Image
                    resizeMode="contain"
                    source={{ uri: preview.uri }}
                    style={{
                      aspectRatio: preview.aspect,
                      backgroundColor: theme.colors.background,
                      width: "100%",
                    }}
                  />
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
              <Social
                icon={<XMark color={theme.colors.label} />}
                label="X"
                onPress={() =>
                  openSocial(
                    `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`,
                  )
                }
              />
              <Social
                icon={<RedditMark color={theme.colors.label} />}
                label="Reddit"
                onPress={() =>
                  openSocial(
                    `https://www.reddit.com/submit?url=${encodeURIComponent(SITE)}&title=${encodeURIComponent(shareText.split("\n")[0] ?? shareText)}`,
                  )
                }
              />
              <Social
                icon={<FacebookMark color={theme.colors.label} />}
                label="Facebook"
                onPress={() =>
                  openSocial(
                    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(SITE)}`,
                  )
                }
              />
              <Social
                icon={<ThreadsMark color={theme.colors.label} />}
                label="Threads"
                onPress={() =>
                  openSocial(
                    `https://www.threads.net/intent/post?text=${encodeURIComponent(shareText)}`,
                  )
                }
              />
              <GlassPanel interactive shadow={false} style={styles.socialGlass}>
                <Pressable
                  accessibilityLabel={saveState === "saved" ? "Saved to photos" : "Save image"}
                  accessibilityState={{
                    busy: saveState === "saving",
                    disabled: saveState === "saving" || !preview,
                  }}
                  disabled={saveState === "saving" || !preview}
                  onPress={requestSave}
                  style={styles.socialButton}
                >
                  <DownloadIcon color={theme.colors.label} size={16} />
                </Pressable>
              </GlassPanel>
            </View>
            {saveError ? (
              <Text style={{ color: theme.colors.red, fontSize: 13 }}>{saveError}</Text>
            ) : null}
            {saveState === "saved" ? (
              <Text style={{ color: theme.colors.secondaryLabel, fontSize: 13 }}>
                Saved to photos
              </Text>
            ) : null}
          </View>
        ) : (
          <PublishPane onDone={onDismiss} overview={overview} />
        )}
      </View>
    </ExpoDrawer>
  );
});

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

function pageLoadError(error: unknown, isError: boolean) {
  if (!isError) return null;
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : "Could not load the published page";
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
  const [publishForm, setPublishForm] = useState<PublishFormSync & { page: typeof page }>(() => {
    const baseline = publishBaselineFromPage(page);
    return { baseline, draft: baseline.draft, page };
  });
  if (publishForm.page !== page) {
    const next = publishFormAfterPage(publishForm, page);
    setPublishForm({ ...next, page });
  }
  const shownForm =
    publishForm.page === page ? publishForm : { ...publishFormAfterPage(publishForm, page), page };
  const { github, handle, visibility, x } = shownForm.draft;
  const setDraft = (patch: Partial<PublishDraft>) => {
    setPublishForm((current) => ({ ...current, draft: { ...current.draft, ...patch } }));
  };
  const [error, setError] = useState<string | null>(null);
  const claimed = Boolean(page?.handle_claimed && page.handle);
  const live = isUsagePageLive(page?.visibility);
  const publish = useMutation({
    mutationFn: async () => {
      if (!overview) throw new Error("No usage to publish");
      return hubPutUsagePage({
        github_username: github.trim(),
        handle: claimed ? undefined : normalizePublishHandle(handle),
        include_cost: true,
        snapshot: mapOverviewToSharePayload(overview, true),
        visibility,
        x_username: x.trim(),
      });
    },
    onSuccess: async () => {
      setError(null);
      const submitted: PublishDraft = { github, handle, visibility, x };
      setPublishForm((current) => ({
        ...publishFormAfterSave(current, submitted),
        page: current.page,
      }));
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
    onError: (reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Could not turn off this page");
    },
  });
  const slug = page?.handle || normalizePublishHandle(handle);
  const url = page?.url ?? (slug ? `${SITE}/tok/@${slug}` : null);
  const pageLoaded = pageQuery.isSuccess;
  const busy = publish.isPending || turnOff.isPending;
  const fieldsLocked = busy || !pageLoaded;
  const primaryDisabled = publishPrimaryDisabled({
    busy,
    claimed,
    draft: { github, handle, visibility, x },
    hasOverview: overview != null,
    live,
    pageLoaded,
    saved: page
      ? {
          github: page.github_username,
          handle: page.handle,
          handleClaimed: page.handle_claimed,
          visibility: page.visibility,
          x: page.x_username,
        }
      : null,
  });
  const primaryLabel = publish.isPending
    ? live
      ? "Updating…"
      : "Publishing…"
    : publishPrimaryLabel(live);

  const actions = (
    <View style={styles.publishActions}>
      <View style={styles.publishButtonSlot}>
        <StretchPublishButton
          label={primaryLabel}
          labelColor={primaryDisabled ? theme.colors.tertiaryLabel : theme.colors.label}
          onPress={primaryDisabled ? undefined : () => publish.mutate()}
        />
      </View>
      {live ? (
        <View style={styles.publishButtonSlot}>
          <StretchPublishButton
            label={turnOff.isPending ? "Turning off…" : "Turn off"}
            labelColor={busy ? theme.colors.tertiaryLabel : theme.colors.red}
            onPress={busy ? undefined : () => turnOff.mutate()}
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.publishPane}>
      <ScrollView
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        contentContainerStyle={styles.publishForm}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        style={styles.publishScroll}
      >
        <Text style={[styles.fieldLabel, { color: theme.colors.label }]}>Handle</Text>
        <PrefixedField
          accessibilityLabel="Handle"
          editable={!claimed && !fieldsLocked}
          onChangeText={(value) => setDraft({ handle: value })}
          placeholder="builder"
          prefix="atmos.land/tok/@"
          value={handle}
        />
        {url ? (
          <Pressable
            accessibilityLabel="Open published page"
            onPress={() => void Linking.openURL(url)}
          >
            <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>
              {url.replace("https://", "")}
            </Text>
          </Pressable>
        ) : null}
        <Text style={[styles.fieldLabel, { color: theme.colors.label }]}>Links</Text>
        <PrefixedField
          accessibilityLabel="X username"
          editable={!fieldsLocked}
          onChangeText={(value) => setDraft({ x: value })}
          placeholder="username"
          prefix="x.com/"
          value={x}
        />
        <PrefixedField
          accessibilityLabel="GitHub username"
          editable={!fieldsLocked}
          onChangeText={(value) => setDraft({ github: value })}
          placeholder="username"
          prefix="github.com/"
          value={github}
        />
        <View style={styles.publicRow}>
          <Text style={{ color: theme.colors.label, flex: 1, fontSize: 15, fontWeight: "600" }}>
            Public
          </Text>
          <View style={styles.publicSwitch}>
            <NativeSwitch
              disabled={fieldsLocked}
              onValueChange={(checked) => setDraft({ visibility: checked ? "public" : "unlisted" })}
              value={visibility === "public"}
            />
          </View>
        </View>
        {actions}
        {(error ?? pageLoadError(pageQuery.error, pageQuery.isError)) ? (
          <Text style={{ color: theme.colors.red, fontSize: 13 }}>
            {error ?? pageLoadError(pageQuery.error, pageQuery.isError)}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * Full-width glass actions. No border shape: the sheet is the frame, and a
 * border clips the glass press scale on both sides. Android stays a plain
 * full-width button.
 */
function publishActionModifiers() {
  return Platform.select({
    ios: [
      frame({
        alignment: "center",
        maxWidth: EXPO_UI_FRAME_INFINITY,
        minHeight: 52,
      }),
      controlSize("large"),
      fixedSize({ horizontal: false }),
      buttonStyle("glass"),
    ],
    android: [fillMaxWidth()],
    default: undefined,
  });
}

function publishLabelModifiers(color: string) {
  return [...(expoUiButtonLabelStretchModifiers ?? []), foregroundStyle(color)];
}

function StretchPublishButton({
  label,
  labelColor,
  onPress,
}: {
  label: string;
  labelColor: string;
  onPress?: () => void;
}) {
  const theme = useMobileTheme();
  const labelStretch = expoUiButtonLabelStretchModifiers;
  return (
    <Host
      colorScheme={theme.colorScheme}
      matchContents={{ vertical: true }}
      style={[expoUiButtonHostStyle, styles.publishButtonHost]}
    >
      {labelStretch ? (
        <Button modifiers={publishActionModifiers()} onPress={onPress}>
          <SwiftUIText modifiers={publishLabelModifiers(labelColor)}>{label}</SwiftUIText>
        </Button>
      ) : (
        <Button label={label} modifiers={publishActionModifiers()} onPress={onPress} />
      )}
    </Host>
  );
}

function PrefixedField({
  accessibilityLabel,
  editable,
  onChangeText,
  placeholder,
  prefix,
  value,
}: {
  accessibilityLabel: string;
  editable: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  prefix: string;
  value: string;
}) {
  const theme = useMobileTheme();
  return (
    <GlassPanel shadow={false} style={styles.prefixed}>
      <Text style={{ color: theme.colors.secondaryLabel, fontSize: 13 }}>{prefix}</Text>
      <View style={styles.prefixInput}>
        <NativeTextInput
          accessibilityLabel={accessibilityLabel}
          editable={editable}
          framed={false}
          minHeight={40}
          onChangeText={onChangeText}
          placeholder={placeholder}
          style={styles.prefixField}
          value={value}
        />
      </View>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  actions: { alignItems: "center", flexDirection: "row", flexShrink: 0, flexWrap: "wrap", gap: 8 },
  pane: { alignSelf: "stretch", flexShrink: 0, gap: 10, width: "100%" },
  fieldLabel: { fontSize: 13, fontWeight: "600" },
  prefixed: {
    alignItems: "center",
    borderRadius: radii.pill,
    flexDirection: "row",
    minHeight: 44,
    paddingLeft: 12,
    paddingRight: 4,
  },
  prefixInput: { flex: 1, minWidth: 0 },
  prefixField: { paddingHorizontal: 8, paddingVertical: 8 },
  publicRow: { alignItems: "center", flexDirection: "row", minHeight: 44, paddingRight: 6 },
  /** Keeps the switch capsule off the scroll view's right clip. */
  publicSwitch: { flexShrink: 0, overflow: "visible" },
  publishPane: { flexGrow: 1, flexShrink: 1, minHeight: 0, width: "100%" },
  publishScroll: { flexGrow: 1, flexShrink: 1, minHeight: 0 },
  publishForm: { gap: 10 },
  publishActions: {
    flexShrink: 0,
    gap: 10,
    marginTop: 4,
    overflow: "visible",
    paddingHorizontal: 8,
    width: "100%",
  },
  publishButtonHost: { overflow: "visible" },
  publishButtonSlot: { flexShrink: 0, minHeight: 52, overflow: "visible", width: "100%" },
  sheet: { alignSelf: "stretch", flex: 1, gap: 12, minHeight: 0, width: "100%" },
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
  socialButton: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  socialGlass: { borderRadius: 999, flexShrink: 0 },
});
