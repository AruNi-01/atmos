import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Animated, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Host, RNHostView, ScrollView } from "@expo/ui";
import { Group, HStack, Image, TextField, useNativeState } from "@expo/ui/swift-ui";
import {
  autocorrectionDisabled,
  fixedSize,
  foregroundStyle,
  frame,
  glassEffect,
  padding,
  textFieldStyle,
  textInputAutocapitalization,
} from "@expo/ui/swift-ui/modifiers";
import { MobileAgentIcon } from "@/features/terminal/MobileAgentIcon";
import { radii } from "@/theme/radii";
import { useMobileTheme } from "@/theme/theme-store";
import { CheckIcon, ChevronRightIcon, StarIcon } from "@/ui/icons/lucide-native";
import { ExpoDrawer } from "@/ui/primitives/expo-drawer";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { IosPopover } from "@/ui/primitives/ios-popover";
import { MenuPicker } from "@/ui/primitives/menu-picker";
import { NativeSwitch } from "@/ui/primitives/native-controls";
import { copy } from "./copy";
import { EffortSlider } from "./effort-slider";
import {
  favoritesTabId,
  groupedModelRows,
  isFavoriteModel,
  type ComposerPatch,
  type ComposerPicker,
  type FavoriteModel,
  type GroupedModelRow,
  type PickerModelRow,
} from "./model-picker";

const ROW_INSET = 8;
const SCROLL_END = 88;

const MeasureContext = createContext<(id: string, height: number) => void>(() => {});

function useStackedHeight(keys: readonly string[]) {
  const heights = useRef(new Map<string, number>());
  const [version, setVersion] = useState(0);
  const signature = keys.join("\0");
  const live = useMemo(() => keys, [signature]);
  const { complete, total } = useMemo(() => {
    const allowed = new Set(live);
    for (const key of [...heights.current.keys()]) {
      if (!allowed.has(key)) heights.current.delete(key);
    }
    let sum = 0;
    let seen = 0;
    for (const key of live) {
      const value = heights.current.get(key);
      if (value == null) continue;
      sum += value;
      seen += 1;
    }
    return { complete: live.length > 0 && seen === live.length, total: sum };
  }, [live, version]);
  const onLayout = useCallback((id: string, height: number) => {
    const next = Math.ceil(height);
    const previous = heights.current.get(id);
    if (next <= 0 || (previous != null && Math.abs(previous - next) <= 1)) return;
    heights.current.set(id, next);
    setVersion((value) => value + 1);
  }, []);
  return { complete, onLayout, total };
}

function Measured({ children, id }: { children: ReactNode; id: string }) {
  const report = useContext(MeasureContext);
  return (
    <View
      onLayout={(event) => {
        report(id, event.nativeEvent.layout.height);
      }}
    >
      {children}
    </View>
  );
}

function MeasuredScroll({
  children,
  keys,
  minHeight = 0,
  showsIndicators = true,
}: {
  children: ReactNode;
  keys: readonly string[];
  /** Used until every child has reported a height. */
  minHeight?: number;
  showsIndicators?: boolean;
}) {
  const theme = useMobileTheme();
  const allKeys = useMemo(() => [...keys, "__end"], [keys]);
  const { complete, onLayout, total } = useStackedHeight(allKeys);
  const height = complete ? Math.max(total, 1) : Math.max(total, allKeys.length * 64, minHeight);
  return (
    <MeasureContext.Provider value={onLayout}>
      <Host colorScheme={theme.colorScheme} matchContents={false} style={{ flex: 1, minHeight: 0 }}>
        <ScrollView showsIndicators={showsIndicators}>
          <Group
            modifiers={[
              frame({ alignment: "topLeading", height, maxWidth: Infinity }),
              fixedSize({ horizontal: false, vertical: true }),
            ]}
          >
            <RNHostView matchContents={false}>
              <View>
                {children}
                <Measured id="__end">
                  <View style={{ height: SCROLL_END }} />
                </Measured>
              </View>
            </RNHostView>
          </Group>
        </ScrollView>
      </Host>
    </MeasureContext.Provider>
  );
}

const RAIL_ICON = 22;
const RAIL_SLOT = 44;
const RAIL_INSET = 4;
const RAIL_TRACK = RAIL_SLOT + RAIL_INSET * 2;
/** Search capsule. Fixed so the glass host has a box for the inner inset. */
const SEARCH_FIELD_HEIGHT = 52;
/** Effort chip cap. Label ellipsizes inside this; the chevron stays put. */
const EFFORT_MAX_WIDTH = 148;
const EFFORT_CHEVRON = 14;
const EFFORT_LABEL_MAX = EFFORT_MAX_WIDTH - 16 - 2 - EFFORT_CHEVRON;

type RailTab = {
  icon: ReactNode;
  id: string;
  label: string;
  onPress: () => void;
  selected: boolean;
};

export function AgentChatModelSheet(props: {
  favorites: FavoriteModel[];
  onClose: () => void;
  onPatch: (patch: ComposerPatch) => void;
  onToggleFavorite: (entry: FavoriteModel) => void;
  picker: ComposerPicker;
  visible: boolean;
}) {
  const theme = useMobileTheme();
  const [rail, setRail] = useState(props.picker.agentId || favoritesTabId());
  const [search, setSearch] = useState("");
  const favoritesOpen = rail === favoritesTabId();
  const query = search.trim().toLowerCase();
  const listed = useMemo(() => {
    if (!favoritesOpen) {
      return props.picker.models.filter((model) => {
        if (!query) return true;
        return `${model.label} ${model.group}`.toLowerCase().includes(query);
      });
    }
    return props.favorites
      .filter((favorite) => {
        const agent = props.picker.agents.find((item) => item.id === favorite.agentId);
        const haystack = `${favorite.label} ${favorite.model} ${agent?.label ?? ""}`.toLowerCase();
        return !query || haystack.includes(query);
      })
      .map((favorite): PickerModelRow => ({
        id: favorite.model,
        label: favorite.label,
        group:
          props.picker.agents.find((item) => item.id === favorite.agentId)?.label ||
          favorite.agentId,
        multiplier: "",
        fast: false,
      }));
  }, [favoritesOpen, props.favorites, props.picker.agents, props.picker.models, query]);
  const rows = groupedModelRows(listed);
  const favoriteByRow = favoritesOpen
    ? props.favorites.filter((favorite) => {
        const agent = props.picker.agents.find((item) => item.id === favorite.agentId);
        const haystack = `${favorite.label} ${favorite.model} ${agent?.label ?? ""}`.toLowerCase();
        return !query || haystack.includes(query);
      })
    : [];
  const tabs = useMemo<RailTab[]>(() => {
    const favoritesSelected = favoritesOpen;
    return [
      {
        icon: (
          <StarIcon
            color={theme.colors.label}
            fill={favoritesSelected ? theme.colors.label : "transparent"}
            size={RAIL_ICON}
            strokeWidth={2.2}
          />
        ),
        id: favoritesTabId(),
        label: copy.favorites,
        onPress: () => {
          setRail(favoritesTabId());
          setSearch("");
        },
        selected: favoritesSelected,
      },
      ...props.picker.agents.map((agent) => ({
        icon: <MobileAgentIcon agentId={agent.id} iconUrl={agent.iconUrl} size={RAIL_ICON} />,
        id: agent.id,
        label: agent.label,
        onPress: () => {
          setRail(agent.id);
          setSearch("");
          if (agent.id !== props.picker.agentId) props.onPatch({ agentId: agent.id });
        },
        selected: !favoritesOpen && agent.id === props.picker.agentId,
      })),
    ];
  }, [favoritesOpen, props, theme.colors.label]);
  const rowKeys = rows.length === 0 ? ["empty"] : rows.map((row, index) => modelRowKey(row, index));

  return (
    <ExpoDrawer
      isPresented={props.visible}
      matchContents={false}
      onDismiss={props.onClose}
      snapPoints={["half"]}
    >
      <View style={{ flex: 1, flexDirection: "row", gap: 10, minHeight: 0 }}>
        <AgentRail tabs={tabs} />
        <View style={{ flex: 1, gap: 8, minWidth: 0 }}>
          <ModelSearchField onChangeText={setSearch} value={search} />
          <MeasuredScroll keys={rowKeys}>
            {rows.length === 0 ? (
              <Measured id="empty">
                <Text style={{ color: theme.colors.secondaryLabel, fontSize: 15, padding: 12 }}>
                  {favoritesOpen ? copy.noFavorites : copy.noModels}
                </Text>
              </Measured>
            ) : (
              rows.map((row, index) => {
                const key = modelRowKey(row, index);
                if (row.type === "header") {
                  const favorite = favoritesOpen
                    ? favoriteByRow.find((item) => {
                        const agent = props.picker.agents.find(
                          (agent) => agent.id === item.agentId,
                        );
                        return (agent?.label || item.agentId) === row.label;
                      })
                    : null;
                  return (
                    <Measured id={key} key={key}>
                      <View
                        style={{
                          alignItems: "center",
                          flexDirection: "row",
                          gap: 6,
                          paddingBottom: 4,
                          paddingHorizontal: ROW_INSET + 8,
                          paddingTop: 10,
                        }}
                      >
                        {favorite ? <MobileAgentIcon agentId={favorite.agentId} size={14} /> : null}
                        <Text style={{ color: theme.colors.secondaryLabel, fontSize: 13 }}>
                          {row.label}
                        </Text>
                      </View>
                    </Measured>
                  );
                }
                const favoriteEntry = favoritesOpen
                  ? favoriteByRow[listed.findIndex((item) => item === row.option)]
                  : null;
                const agentId = favoriteEntry?.agentId || props.picker.agentId;
                const selected = favoriteEntry
                  ? favoriteEntry.agentId === props.picker.agentId &&
                    favoriteEntry.model === props.picker.modelId
                  : row.option.id === props.picker.modelId;
                const favorited = isFavoriteModel(props.favorites, agentId, row.option.id);
                const showEffort = selected;
                return (
                  <Measured id={key} key={key}>
                    <View
                      style={{
                        alignItems: "center",
                        backgroundColor: selected ? theme.colors.mutedPressed : "transparent",
                        borderRadius: 12,
                        flexDirection: "row",
                        flexWrap: "nowrap",
                        gap: 4,
                        marginHorizontal: ROW_INSET,
                        minWidth: 0,
                        paddingHorizontal: 8,
                      }}
                    >
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          props.onPatch(
                            favoriteEntry
                              ? { agentId: favoriteEntry.agentId, modelId: favoriteEntry.model }
                              : { modelId: row.option.id },
                          );
                        }}
                        style={{
                          flexBasis: 0,
                          flexGrow: 1,
                          flexShrink: 1,
                          maxWidth: showEffort ? "58%" : "100%",
                          minWidth: 0,
                          paddingVertical: 10,
                        }}
                      >
                        <Text
                          ellipsizeMode="tail"
                          numberOfLines={1}
                          style={{
                            color: theme.colors.label,
                            fontSize: 16,
                          }}
                        >
                          {row.option.label}
                          {row.option.multiplier ? `  ${row.option.multiplier}` : ""}
                        </Text>
                      </Pressable>
                      {showEffort ? (
                        <EffortPickerButton onPatch={props.onPatch} picker={props.picker} />
                      ) : null}
                      <Pressable
                        accessibilityLabel={favorited ? copy.removeFavorite : copy.addFavorite}
                        accessibilityRole="button"
                        hitSlop={8}
                        onPress={() =>
                          props.onToggleFavorite({
                            agentId,
                            model: row.option.id,
                            label: row.option.label,
                          })
                        }
                        style={{ flexShrink: 0 }}
                      >
                        <StarIcon
                          color={theme.colors.secondaryLabel}
                          fill={favorited ? theme.colors.label : "transparent"}
                          size={18}
                          strokeWidth={2.2}
                        />
                      </Pressable>
                      {selected ? (
                        <View style={{ flexShrink: 0 }}>
                          <CheckIcon color={theme.colors.label} size={18} strokeWidth={2.4} />
                        </View>
                      ) : null}
                    </View>
                  </Measured>
                );
              })
            )}
          </MeasuredScroll>
        </View>
      </View>
    </ExpoDrawer>
  );
}

function modelRowKey(row: GroupedModelRow, index: number): string {
  if (row.type === "header") return `header:${row.label}:${index}`;
  return `model:${row.option.id}:${index}`;
}

const RAIL_LENS_INSET = 4;
const RAIL_LENS_WIDTH = RAIL_TRACK - RAIL_LENS_INSET * 2;
const RAIL_LENS_HEIGHT = RAIL_SLOT - 8;

function AgentRail({ tabs }: { tabs: RailTab[] }) {
  const theme = useMobileTheme();
  const selectedIndex = tabs.findIndex((tab) => tab.selected);
  const lens = useRef(new Animated.Value(Math.max(0, selectedIndex))).current;

  useEffect(() => {
    if (selectedIndex < 0) return;
    Animated.spring(lens, {
      friction: 9,
      tension: 140,
      toValue: selectedIndex,
      useNativeDriver: true,
    }).start();
  }, [lens, selectedIndex]);

  return (
    <View style={{ alignSelf: "stretch", width: 60 }}>
      <MeasuredScroll
        keys={["rail"]}
        minHeight={tabs.length * RAIL_SLOT + RAIL_INSET * 2 + SCROLL_END}
        showsIndicators={false}
      >
        <Measured id="rail">
          <View style={{ borderRadius: radii.pill, overflow: "hidden", width: RAIL_TRACK }}>
            <GlassPanel
              shadow={false}
              style={{
                borderRadius: radii.pill,
                bottom: 0,
                left: 0,
                position: "absolute",
                right: 0,
                top: 0,
              }}
            />
            {selectedIndex >= 0 ? (
              <Animated.View
                pointerEvents="none"
                style={{
                  backgroundColor: theme.isDark ? "rgba(255,255,255,0.16)" : "rgba(17,17,18,0.08)",
                  borderCurve: "continuous",
                  borderRadius: 14,
                  height: RAIL_LENS_HEIGHT,
                  left: RAIL_LENS_INSET,
                  position: "absolute",
                  top: RAIL_INSET + (RAIL_SLOT - RAIL_LENS_HEIGHT) / 2,
                  transform: [{ translateY: Animated.multiply(lens, RAIL_SLOT) }],
                  width: RAIL_LENS_WIDTH,
                }}
              />
            ) : null}
            <View style={{ padding: RAIL_INSET }}>
              {tabs.map((tab) => (
                <Pressable
                  accessibilityLabel={tab.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: tab.selected }}
                  key={tab.id}
                  onPress={tab.onPress}
                  style={({ pressed }) => ({
                    alignItems: "center",
                    height: RAIL_SLOT,
                    justifyContent: "center",
                    opacity: pressed ? 0.65 : 1,
                    width: RAIL_SLOT,
                  })}
                >
                  <View
                    style={{
                      alignItems: "center",
                      height: RAIL_ICON,
                      justifyContent: "center",
                      opacity: tab.selected ? 1 : 0.55,
                      overflow: "hidden",
                      width: RAIL_ICON,
                    }}
                  >
                    {tab.icon}
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        </Measured>
      </MeasuredScroll>
    </View>
  );
}

function ModelSearchField({
  onChangeText,
  value,
}: {
  onChangeText: (value: string) => void;
  value: string;
}) {
  if (Platform.OS !== "ios") {
    return <AndroidModelSearchField onChangeText={onChangeText} value={value} />;
  }
  return <IosModelSearchField onChangeText={onChangeText} value={value} />;
}

function AndroidModelSearchField({
  onChangeText,
  value,
}: {
  onChangeText: (value: string) => void;
  value: string;
}) {
  const theme = useMobileTheme();
  return (
    <GlassPanel
      shadow={false}
      style={{
        borderRadius: radii.pill,
        justifyContent: "center",
        minHeight: SEARCH_FIELD_HEIGHT,
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}
    >
      <TextInput
        onChangeText={onChangeText}
        placeholder={copy.searchModels}
        placeholderTextColor={theme.colors.secondaryLabel}
        style={{
          color: theme.colors.label,
          fontSize: 16,
          margin: 0,
          padding: 0,
        }}
        value={value}
      />
    </GlassPanel>
  );
}

function IosModelSearchField({
  onChangeText,
  value,
}: {
  onChangeText: (value: string) => void;
  value: string;
}) {
  const theme = useMobileTheme();
  const text = useNativeState(value);
  useEffect(() => {
    if (text.value !== value) text.value = value;
  }, [text, value]);

  return (
    <Host
      colorScheme={theme.colorScheme}
      matchContents={false}
      style={{ height: SEARCH_FIELD_HEIGHT, width: "100%" }}
    >
      <HStack
        alignment="center"
        modifiers={[
          padding({ horizontal: 16, vertical: 10 }),
          glassEffect({
            glass: { interactive: true, variant: "regular" },
            shape: "capsule",
          }),
          frame({
            alignment: "center",
            height: SEARCH_FIELD_HEIGHT,
            maxWidth: Infinity,
          }),
        ]}
        spacing={8}
      >
        <Image color={theme.colors.secondaryLabel} size={16} systemName="magnifyingglass" />
        <TextField
          modifiers={[
            autocorrectionDisabled(true),
            foregroundStyle(theme.colors.label),
            frame({ maxWidth: Infinity }),
            textFieldStyle("plain"),
            textInputAutocapitalization("never"),
          ]}
          onTextChange={(next) => {
            if (next !== value) onChangeText(next);
          }}
          placeholder={copy.searchModels}
          text={text}
        />
      </HStack>
    </Host>
  );
}

function EffortPickerButton({
  onPatch,
  picker,
}: {
  onPatch: (patch: ComposerPatch) => void;
  picker: ComposerPicker;
}) {
  const theme = useMobileTheme();
  const label = picker.effortLabel || copy.effort;
  return (
    <View style={{ flexGrow: 0, flexShrink: 1, maxWidth: EFFORT_MAX_WIDTH, minWidth: 72 }}>
      <IosPopover background="glass" direction="any">
        <IosPopover.Trigger>
          <View
            style={{
              alignItems: "center",
              backgroundColor: theme.isDark ? "rgba(255,255,255,0.10)" : "rgba(17,17,18,0.08)",
              borderRadius: 12,
              flexDirection: "row",
              gap: 2,
              height: 28,
              maxWidth: EFFORT_MAX_WIDTH,
              minWidth: 0,
              paddingHorizontal: 8,
            }}
          >
            <Text
              ellipsizeMode="tail"
              numberOfLines={1}
              style={{
                color: theme.colors.secondaryLabel,
                flexShrink: 1,
                fontSize: 13,
                lineHeight: 16,
                maxWidth: EFFORT_LABEL_MAX,
                minWidth: 0,
              }}
            >
              {label}
            </Text>
            <View style={{ flexShrink: 0 }}>
              <ChevronRightIcon
                color={theme.colors.secondaryLabel}
                size={EFFORT_CHEVRON}
                strokeWidth={2.2}
              />
            </View>
          </View>
        </IosPopover.Trigger>
        <IosPopover.Content style={{ width: 280 }}>
          <View style={{ gap: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
            <EffortControls onPatch={onPatch} picker={picker} />
          </View>
        </IosPopover.Content>
      </IosPopover>
    </View>
  );
}

function EffortControls({
  onPatch,
  picker,
}: {
  onPatch: (patch: ComposerPatch) => void;
  picker: ComposerPicker;
}) {
  const theme = useMobileTheme();
  const max = Math.max(0, picker.thinking.length - 1);
  const propIndex = Math.max(
    0,
    picker.thinking.findIndex((level) => level.id === picker.thinkingId),
  );
  const [index, setIndex] = useState(propIndex);
  const committed = useRef(propIndex);
  useEffect(() => {
    setIndex(propIndex);
    committed.current = propIndex;
  }, [propIndex]);
  const current = picker.thinking[index] ?? picker.thinking[0];

  return (
    <View style={{ gap: 12 }}>
      {picker.thinking.length > 1 && current ? (
        <View style={{ gap: 8 }}>
          <View
            style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text style={{ color: theme.colors.label, fontSize: 15, fontWeight: "500" }}>
              {copy.effort}
            </Text>
            <FadeLabel color={theme.colors.secondaryLabel} value={current.label} />
          </View>
          <EffortSlider
            max={max}
            onChange={(next) => {
              setIndex(next);
              if (committed.current === next) return;
              committed.current = next;
              const level = picker.thinking[next];
              if (level) onPatch({ thinkingId: level.id });
            }}
            value={index}
          />
        </View>
      ) : null}
      {picker.fastAvailable ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: "transparent",
            flexDirection: "row",
            justifyContent: "space-between",
            minHeight: 32,
          }}
        >
          <Text style={{ color: theme.colors.label, fontSize: 15, fontWeight: "500" }}>
            {copy.fast}
          </Text>
          <NativeSwitch
            onValueChange={(enabled) => onPatch({ fastEnabled: enabled })}
            value={picker.fastEnabled}
          />
        </View>
      ) : null}
      {picker.context.length > 1 ? (
        <View
          style={{
            alignItems: "center",
            backgroundColor: "transparent",
            flexDirection: "row",
            justifyContent: "space-between",
            minHeight: 32,
          }}
        >
          <Text style={{ color: theme.colors.label, fontSize: 15, fontWeight: "500" }}>
            {copy.context}
          </Text>
          <MenuPicker
            onValueChange={(contextId) => onPatch({ contextId })}
            options={picker.context.map((level) => ({ label: level.label, value: level.id }))}
            selectedValue={picker.contextId}
          />
        </View>
      ) : null}
    </View>
  );
}

function FadeLabel({ color, value }: { color: string; value: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const shift = useRef(new Animated.Value(0)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    opacity.setValue(0);
    shift.setValue(8);
    Animated.parallel([
      Animated.timing(opacity, { duration: 180, toValue: 1, useNativeDriver: true }),
      Animated.timing(shift, { duration: 180, toValue: 0, useNativeDriver: true }),
    ]).start();
  }, [opacity, shift, value]);
  return (
    <Animated.Text
      numberOfLines={1}
      style={{ color, fontSize: 15, maxWidth: 160, opacity, transform: [{ translateY: shift }] }}
    >
      {value}
    </Animated.Text>
  );
}
