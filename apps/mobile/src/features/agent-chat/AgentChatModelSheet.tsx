import { useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { MobileAgentIcon } from "@/features/terminal/MobileAgentIcon";
import { useMobileTheme } from "@/theme/theme-store";
import { CheckIcon, ChevronRightIcon, SearchIcon, StarIcon } from "@/ui/icons/lucide-native";
import { ExpoDrawer } from "@/ui/primitives/expo-drawer";
import { GlassPanel } from "@/ui/primitives/glass-panel";
import { copy } from "./copy";
import {
  favoritesTabId,
  groupedModelRows,
  isFavoriteModel,
  type ComposerPatch,
  type ComposerPicker,
  type FavoriteModel,
  type PickerModelRow,
} from "./model-picker";

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
  const [effortOpen, setEffortOpen] = useState(false);
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
        group: props.picker.agents.find((item) => item.id === favorite.agentId)?.label || favorite.agentId,
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

  return (
    <ExpoDrawer isPresented={props.visible} matchContents={false} onDismiss={props.onClose} snapPoints={[{ fraction: 0.62 }, "full"]}>
      <View style={{ flexDirection: "row", gap: 8, minHeight: 460 }}>
        <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0, width: 52 }}>
          <RailButton
            label={copy.favorites}
            selected={favoritesOpen}
            onPress={() => {
              setRail(favoritesTabId());
              setSearch("");
            }}
          >
            <StarIcon
              color={theme.colors.label}
              fill={favoritesOpen ? theme.colors.label : "transparent"}
              size={18}
              strokeWidth={2.2}
            />
          </RailButton>
          {props.picker.agents.map((agent) => (
            <RailButton
              key={agent.id}
              label={agent.label}
              selected={!favoritesOpen && agent.id === props.picker.agentId}
              onPress={() => {
                setRail(agent.id);
                setSearch("");
                setEffortOpen(false);
                if (agent.id !== props.picker.agentId) props.onPatch({ agentId: agent.id });
              }}
            >
              <MobileAgentIcon agentId={agent.id} iconUrl={agent.iconUrl} size={22} />
            </RailButton>
          ))}
        </ScrollView>
        <View style={{ flex: 1, gap: 8 }}>
          <GlassPanel interactive shadow={false} style={{ borderRadius: 16, flexDirection: "row", alignItems: "center", paddingHorizontal: 12 }}>
            <SearchIcon color={theme.colors.secondaryLabel} size={16} strokeWidth={2.2} />
            <TextInput
              onChangeText={setSearch}
              placeholder={copy.searchModels}
              placeholderTextColor={theme.colors.secondaryLabel}
              style={{ color: theme.colors.label, flex: 1, fontSize: 16, paddingVertical: 10, paddingLeft: 8 }}
              value={search}
            />
          </GlassPanel>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
            {rows.length === 0 ? (
              <Text style={{ color: theme.colors.secondaryLabel, fontSize: 15, padding: 12 }}>
                {favoritesOpen ? copy.noFavorites : copy.noModels}
              </Text>
            ) : rows.map((row, index) => {
              if (row.type === "header") {
                const favorite = favoritesOpen ? favoriteByRow.find((item) => {
                  const agent = props.picker.agents.find((agent) => agent.id === item.agentId);
                  return (agent?.label || item.agentId) === row.label;
                }) : null;
                return (
                  <View key={`group-${row.label}-${index}`} style={{ alignItems: "center", flexDirection: "row", gap: 6, paddingBottom: 4, paddingTop: 10 }}>
                    {favorite ? <MobileAgentIcon agentId={favorite.agentId} size={14} /> : null}
                    <Text style={{ color: theme.colors.secondaryLabel, fontSize: 13 }}>{row.label}</Text>
                  </View>
                );
              }
              const favoriteEntry = favoritesOpen ? favoriteByRow[listed.findIndex((item) => item === row.option)] : null;
              const agentId = favoriteEntry?.agentId || props.picker.agentId;
              const selected = favoriteEntry
                ? favoriteEntry.agentId === props.picker.agentId && favoriteEntry.model === props.picker.modelId
                : row.option.id === props.picker.modelId;
              const favorited = isFavoriteModel(props.favorites, agentId, row.option.id);
              return (
                <View key={`${agentId}:${row.option.id}:${index}`}>
                  <View
                    style={{
                      alignItems: "center",
                      backgroundColor: selected ? theme.colors.mutedPressed : "transparent",
                      borderRadius: 10,
                      flexDirection: "row",
                      gap: 4,
                    }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        props.onPatch(favoriteEntry
                          ? { agentId: favoriteEntry.agentId, modelId: favoriteEntry.model }
                          : { modelId: row.option.id });
                        setEffortOpen(false);
                      }}
                      style={{ flex: 1, paddingVertical: 10 }}
                    >
                      <Text style={{ color: theme.colors.label, fontSize: 16 }}>
                        {row.option.label}
                        {row.option.multiplier ? `  ${row.option.multiplier}` : ""}
                      </Text>
                    </Pressable>
                    {selected && (props.picker.thinking.length > 1 || props.picker.fastAvailable || props.picker.context.length > 1) ? (
                      <Pressable accessibilityRole="button" onPress={() => setEffortOpen((open) => !open)}>
                        <GlassPanel shadow={false} style={{ alignItems: "center", borderRadius: 14, flexDirection: "row", gap: 2, paddingHorizontal: 8, paddingVertical: 4 }}>
                          <Text style={{ color: theme.colors.secondaryLabel, fontSize: 12 }}>{props.picker.effortLabel || copy.effort}</Text>
                          <ChevronRightIcon color={theme.colors.secondaryLabel} size={12} />
                        </GlassPanel>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityLabel={favorited ? copy.removeFavorite : copy.addFavorite}
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => props.onToggleFavorite({
                        agentId,
                        model: row.option.id,
                        label: row.option.label,
                      })}
                    >
                      <StarIcon
                        color={theme.colors.secondaryLabel}
                        fill={favorited ? theme.colors.label : "transparent"}
                        size={16}
                        strokeWidth={2.2}
                      />
                    </Pressable>
                    {selected ? <CheckIcon color={theme.colors.label} size={16} /> : null}
                  </View>
                  {selected && effortOpen ? (
                    <EffortPanel
                      onPatch={props.onPatch}
                      picker={props.picker}
                    />
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </ExpoDrawer>
  );
}

function RailButton(props: {
  children: ReactNode;
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable accessibilityLabel={props.label} accessibilityRole="button" onPress={props.onPress} style={{ marginBottom: 8 }}>
      <GlassPanel
        interactive
        shadow={false}
        style={{
          alignItems: "center",
          borderRadius: 16,
          height: 40,
          justifyContent: "center",
          opacity: props.selected ? 1 : 0.72,
          width: 40,
        }}
      >
        {props.children}
      </GlassPanel>
    </Pressable>
  );
}

function EffortPanel(props: {
  onPatch: (patch: ComposerPatch) => void;
  picker: ComposerPicker;
}) {
  const theme = useMobileTheme();
  const { picker } = props;
  const index = Math.max(0, picker.thinking.findIndex((level) => level.id === picker.thinkingId));
  return (
    <GlassPanel shadow={false} style={{ borderRadius: 16, gap: 8, marginBottom: 8, padding: 12 }}>
      {picker.thinking.length > 1 ? (
        <View style={{ gap: 8 }}>
          <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: theme.colors.label, fontSize: 15 }}>{copy.effort}</Text>
            <Text style={{ color: theme.colors.secondaryLabel, fontSize: 15 }}>{picker.thinkingLabel}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {picker.thinking.map((level, levelIndex) => (
              <Pressable
                accessibilityRole="button"
                key={level.id}
                onPress={() => props.onPatch({ thinkingId: level.id })}
                style={{
                  backgroundColor: levelIndex <= index ? theme.colors.label : theme.colors.glassBorder,
                  borderRadius: 99,
                  flex: 1,
                  height: 8,
                }}
              />
            ))}
          </View>
        </View>
      ) : null}
      {picker.fastAvailable ? (
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: picker.fastEnabled }}
          onPress={() => props.onPatch({ fastEnabled: !picker.fastEnabled })}
          style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}
        >
          <Text style={{ color: theme.colors.label, fontSize: 15 }}>{copy.fast}</Text>
          <View
            style={{
              backgroundColor: picker.fastEnabled ? theme.colors.label : theme.colors.glassBorder,
              borderRadius: 12,
              height: 24,
              justifyContent: "center",
              paddingHorizontal: 3,
              width: 42,
            }}
          >
            <View
              style={{
                alignSelf: picker.fastEnabled ? "flex-end" : "flex-start",
                backgroundColor: theme.colors.background,
                borderRadius: 9,
                height: 18,
                width: 18,
              }}
            />
          </View>
        </Pressable>
      ) : null}
      {picker.context.map((level) => (
        <Pressable
          accessibilityRole="button"
          key={level.id}
          onPress={() => props.onPatch({ contextId: level.id })}
          style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}
        >
          <Text style={{ color: theme.colors.label, fontSize: 15 }}>{level.label}</Text>
          {level.id === picker.contextId ? <CheckIcon color={theme.colors.label} size={16} /> : null}
        </Pressable>
      ))}
    </GlassPanel>
  );
}
