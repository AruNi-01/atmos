import { useEffect, useRef, useState, type ReactNode } from "react";
import { Image, Linking, NativeModules, Pressable, ScrollView, Text, TurboModuleRegistry, View } from "react-native";
import type { SFSymbol } from "sf-symbols-typescript";
import { useMobileTheme } from "@/theme/theme-store";
import {
  CheckIcon,
  HammerIcon,
  HandIcon,
  ImageIcon,
  LayersIcon,
  ListTodoIcon,
  MessageSquareIcon,
  PencilIcon,
  ShieldAlertIcon,
  ShieldIcon,
  SparklesIcon,
} from "@/ui/icons/lucide-native";
import { ExpoDrawer } from "@/ui/primitives/expo-drawer";
import { MenuPickerRow } from "@/ui/primitives/menu-picker";
import { copy } from "./copy";
import { modeIconKind, permissionIconKind, type ComposerPatch, type ComposerPicker } from "./model-picker";
import { PHOTO_LIMIT, appendPhotos, type ComposerPhoto } from "./photo-attachment";

type RecentPhoto = ComposerPhoto;

const PHOTO_SIZE = 104;

function displayablePhotoUri(uri: string): boolean {
  return /^(file|content|ph|assets-library|https?|data):/i.test(uri);
}

export function AgentChatAddSheet(props: {
  onClose: () => void;
  onPatch: (patch: ComposerPatch) => void;
  onPhotosChange: (photos: ComposerPhoto[]) => void;
  photos: ComposerPhoto[];
  picker: ComposerPicker;
  visible: boolean;
}) {
  const theme = useMobileTheme();
  const recent = useRecentPhotos(props.visible);
  const [draft, setDraft] = useState<ComposerPhoto[]>(props.photos);
  const draftRef = useRef(draft);
  const libraryOpen = useRef(false);
  draftRef.current = draft;

  const wasVisible = useRef(false);
  useEffect(() => {
    if (props.visible && !wasVisible.current) setDraft(props.photos);
    wasVisible.current = props.visible;
  }, [props.photos, props.visible]);

  const commit = (photos: ComposerPhoto[]) => {
    draftRef.current = photos;
    props.onPhotosChange(photos);
  };

  const dismiss = () => {
    if (!libraryOpen.current) commit(draftRef.current);
    props.onClose();
  };

  const toggleRecent = (photo: RecentPhoto) => {
    setDraft((current) => (
      current.some((item) => item.id === photo.id)
        ? current.filter((item) => item.id !== photo.id)
        : appendPhotos(current, [photo])
    ));
  };

  const pickLibrary = async () => {
    const base = draftRef.current;
    const remaining = PHOTO_LIMIT - base.length;
    if (remaining <= 0) return;
    if (!hasNativeModule("ExponentImagePicker")) return;
    // `import()` splits on native dev and throws "Requiring unknown module".
    const imagePicker = require("expo-image-picker") as typeof import("expo-image-picker");
    libraryOpen.current = true;
    props.onClose();
    try {
      const result = await imagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ["images"],
        quality: 0.9,
        selectionLimit: remaining,
      });
      if (result.canceled) {
        commit(base);
        return;
      }
      commit(appendPhotos(base, result.assets.map((asset, index) => ({
        id: asset.assetId || asset.uri,
        uri: asset.uri,
        filename: asset.fileName || `photo-${index + 1}.jpg`,
        mediaType: asset.mimeType || "image/jpeg",
      }))));
    } catch {
      commit(base);
    } finally {
      libraryOpen.current = false;
    }
  };

  return (
    <ExpoDrawer
      contentPaddingHorizontal={20}
      isPresented={props.visible}
      matchContents={false}
      onDismiss={dismiss}
      snapPoints={["half", "full"]}
    >
      <View style={{ alignSelf: "stretch", flex: 1, gap: 8, width: "100%" }}>
        <Text style={{ color: theme.colors.label, fontSize: 17, fontWeight: "600" }}>{copy.context}</Text>
        <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 8 }} style={{ flex: 1 }}>
        {recent.photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: PHOTO_SIZE }}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {recent.photos.map((photo) => {
                const selected = draft.some((item) => item.id === photo.id);
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={photo.id}
                    onPress={() => toggleRecent(photo)}
                  >
                    <View
                      style={{
                        borderRadius: 16,
                        height: PHOTO_SIZE,
                        overflow: "hidden",
                        width: PHOTO_SIZE,
                      }}
                    >
                      {displayablePhotoUri(photo.uri) ? (
                        <Image source={{ uri: photo.uri }} style={{ height: PHOTO_SIZE, width: PHOTO_SIZE }} />
                      ) : null}
                      {selected ? (
                        <View
                          style={{
                            backgroundColor: "rgba(0,0,0,0.45)",
                            bottom: 0,
                            left: 0,
                            position: "absolute",
                            right: 0,
                            top: 0,
                          }}
                        />
                      ) : null}
                      {selected ? (
                        <View
                          style={{
                            alignItems: "center",
                            backgroundColor: "#fff",
                            borderRadius: 12,
                            height: 24,
                            justifyContent: "center",
                            position: "absolute",
                            right: 8,
                            top: 8,
                            width: 24,
                          }}
                        >
                          <CheckIcon color="#111" size={14} strokeWidth={3} />
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        ) : recent.status === "unavailable" ? (
          <Text style={{ color: theme.colors.secondaryLabel, fontSize: 15 }}>{copy.photosNeedRebuild}</Text>
        ) : recent.status === "denied" ? (
          <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()}>
            <Text style={{ color: theme.colors.secondaryLabel, fontSize: 15 }}>{copy.allowPhotos}</Text>
          </Pressable>
        ) : null}
        {props.picker.modes.length > 0 ? (
          <MenuPickerRow
            icon={<ModeGlyph id={props.picker.modeId} />}
            label={copy.mode}
            onValueChange={(modeId) => props.onPatch({ modeId })}
            options={props.picker.modes.map((choice) => ({
              value: choice.id,
              label: choice.label,
              systemImage: modeSymbol(choice.id),
            }))}
            selectedValue={props.picker.modeId}
          />
        ) : null}
        {props.picker.permissions.length > 0 ? (
          <MenuPickerRow
            icon={<PermissionGlyph id={props.picker.permissionId} />}
            label={copy.permission}
            onValueChange={(permissionId) => props.onPatch({ permissionId })}
            options={props.picker.permissions.map((choice) => ({
              value: choice.id,
              label: choice.label,
              systemImage: permissionSymbol(choice.id),
            }))}
            selectedValue={props.picker.permissionId}
          />
        ) : null}
        <Section title={copy.add}>
          <SettingRow
            icon={<ImageIcon color={theme.colors.label} size={18} strokeWidth={2.2} />}
            label={copy.photos}
            onPress={() => void pickLibrary()}
            value=""
          />
        </Section>
        </ScrollView>
      </View>
    </ExpoDrawer>
  );
}

function modeSymbol(id: string): SFSymbol {
  const kind = modeIconKind(id);
  if (kind === "plan") return "checklist";
  if (kind === "build") return "hammer";
  if (kind === "ask") return "bubble.left";
  if (kind === "code") return "chevron.left.forwardslash.chevron.right";
  if (kind === "chat") return "message";
  return "square.3.layers.3d";
}

function permissionSymbol(id: string): SFSymbol {
  const kind = permissionIconKind(id);
  if (kind === "yolo") return "shield.slash";
  if (kind === "edits") return "pencil";
  if (kind === "auto") return "sparkles";
  if (kind === "ask") return "hand.raised";
  return "shield";
}

function hasNativeModule(name: string): boolean {
  const expoModules = (globalThis as { expo?: { modules?: Record<string, object | undefined> } }).expo?.modules;
  if (expoModules?.[name]) return true;
  if (NativeModules[name]) return true;
  try {
    return TurboModuleRegistry.get(name) != null;
  } catch {
    return false;
  }
}

function useRecentPhotos(active: boolean): { photos: RecentPhoto[]; status: "unknown" | "granted" | "denied" | "unavailable" } {
  const [photos, setPhotos] = useState<RecentPhoto[]>([]);
  const [status, setStatus] = useState<"unknown" | "granted" | "denied" | "unavailable">("unknown");
  useEffect(() => {
    if (!active) return;
    if (!hasNativeModule("ExpoMediaLibraryNext")) {
      setStatus("unavailable");
      setPhotos([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        // `import()` splits on native dev and throws "Requiring unknown module".
        const mediaLibrary = require("expo-media-library") as typeof import("expo-media-library");
        const current = await mediaLibrary.getPermissionsAsync(false, ["photo"]);
        let granted = current.granted;
        if (!granted && current.canAskAgain) {
          const next = await mediaLibrary.requestPermissionsAsync(false, ["photo"]);
          granted = next.granted;
        }
        if (cancelled) return;
        if (!granted) {
          setStatus("denied");
          setPhotos([]);
          return;
        }
        setStatus("granted");
        const assets = await new mediaLibrary.Query()
          .eq(mediaLibrary.AssetField.MEDIA_TYPE, mediaLibrary.MediaType.IMAGE)
          .orderBy({ key: mediaLibrary.AssetField.CREATION_TIME, ascending: false })
          .limit(12)
          .exe();
        const resolved = (await Promise.all(assets.map(async (asset) => {
          try {
            const info = await asset.getInfo();
            const uri = typeof info.uri === "string" ? info.uri : "";
            const id = (typeof info.id === "string" && info.id) || asset.id;
            if (!displayablePhotoUri(uri) || !id) return null;
            return {
              id,
              uri,
              filename: (typeof info.filename === "string" && info.filename) || "photo.jpg",
              mediaType: "image/jpeg",
            };
          } catch {
            return null;
          }
        }))).filter((photo): photo is RecentPhoto => photo != null);
        if (!cancelled) setPhotos(resolved);
      } catch {
        if (!cancelled) setStatus((current) => (current === "granted" ? current : "denied"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);
  return { photos, status };
}

function Section(props: { children: ReactNode; title: string }) {
  const theme = useMobileTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: theme.colors.secondaryLabel, fontSize: 13 }}>{props.title}</Text>
      {props.children}
    </View>
  );
}

function SettingRow(props: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  value: string;
}) {
  const theme = useMobileTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={{ alignItems: "center", flexDirection: "row", gap: 12, paddingVertical: 10 }}
    >
      {props.icon}
      <Text style={{ color: theme.colors.label, flex: 1, fontSize: 16 }}>{props.label}</Text>
      {props.value ? <Text style={{ color: theme.colors.secondaryLabel, fontSize: 16 }}>{props.value}</Text> : null}
    </Pressable>
  );
}

function ModeGlyph(props: { id: string }) {
  const theme = useMobileTheme();
  const color = theme.colors.label;
  const kind = modeIconKind(props.id);
  if (kind === "plan") return <ListTodoIcon color={color} size={16} strokeWidth={2} />;
  if (kind === "build") return <HammerIcon color={color} size={16} strokeWidth={2} />;
  if (kind === "ask") return <MessageSquareIcon color={color} size={16} strokeWidth={2} />;
  if (kind === "code") return <LayersIcon color={color} size={16} strokeWidth={2} />;
  if (kind === "chat") return <MessageSquareIcon color={color} size={16} strokeWidth={2} />;
  return <LayersIcon color={color} size={16} strokeWidth={2} />;
}

function PermissionGlyph(props: { id: string }) {
  const theme = useMobileTheme();
  const color = theme.colors.label;
  const kind = permissionIconKind(props.id);
  if (kind === "yolo") return <ShieldAlertIcon color={color} size={16} strokeWidth={2} />;
  if (kind === "edits") return <PencilIcon color={color} size={16} strokeWidth={2} />;
  if (kind === "auto") return <SparklesIcon color={color} size={16} strokeWidth={2} />;
  if (kind === "ask") return <HandIcon color={color} size={16} strokeWidth={2} />;
  return <ShieldIcon color={color} size={16} strokeWidth={2} />;
}
