"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Input,
  MotionSidebar,
  MotionSidebarContent,
  MotionSidebarGroup,
  MotionSidebarGroupLabel,
  MotionSidebarHeader,
  MotionSidebarMenu,
  MotionSidebarMenuButton,
  MotionSidebarMenuItem,
  MotionSidebarProvider,
  cn,
} from "@workspace/ui";
import { KeyRound, Search, X } from "lucide-react";
import InfoCircleIcon from "@workspace/ui/components/icons/info-circle-icon";
import LayoutDashboardIcon from "@workspace/ui/components/icons/layout-dashboard-icon";
import TerminalIcon from "@workspace/ui/components/icons/terminal-icon";
import { BotIcon } from "@workspace/ui/components/icons/bot-icon";
import BrainCircuitIcon from "@workspace/ui/components/icons/brain-circuit-icon";
import { BellIcon } from "@workspace/ui/components/icons/bell-icon";
import WorldIcon from "@workspace/ui/components/icons/world-icon";
import ComputerIcon from "@workspace/ui/components/icons/computer-icon";
import DesktopUseIcon from "@workspace/ui/components/icons/desktop-use-icon";
import { FolderKanbanIcon } from "@workspace/ui/components/icons/folder-kanban-icon";
import { TagIcon } from "@workspace/ui/components/icons/tag-icon";
import KeyboardIcon from "@workspace/ui/components/icons/keyboard-icon";
import { BlocksIcon } from "@workspace/ui/components/icons/blocks-icon";
import { UserIcon } from "@workspace/ui/components/icons/user-icon";
import CodeXmlIcon from "@workspace/ui/components/ui/code-xml-icon";
import CanvasIcon from "@workspace/ui/components/icons/canvas-icon";
import type { AnimatedIconHandle } from "@workspace/ui/components/icons/types";
import { FlaskIcon, type FlaskIconHandle } from "@/shared/components/ui/flask-icon";
import {
  SETTINGS_GROUPS,
  SETTINGS_SEARCH_ENTRIES,
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "@/features/settings/components/settings-modal-data";

type SettingsSearchEntry = (typeof SETTINGS_SEARCH_ENTRIES)[number];

function normalizeSettingsSearchValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSettingsSearchTerms(query: string) {
  return normalizeSettingsSearchValue(query)
    .split(" ")
    .filter(Boolean);
}

function keywordMatchesSearch(keyword: string, normalizedQuery: string, queryTerms: string[]) {
  const normalizedKeyword = normalizeSettingsSearchValue(keyword);
  if (!normalizedKeyword) return false;

  if (queryTerms.length <= 1) {
    return normalizedKeyword === normalizedQuery;
  }

  return normalizedKeyword.includes(normalizedQuery) ||
    queryTerms.every((term) => normalizedKeyword.includes(term));
}

function entryMatchesSettingsSearch(entry: SettingsSearchEntry, query: string) {
  const normalizedQuery = normalizeSettingsSearchValue(query);
  if (!normalizedQuery) return true;

  const queryTerms = getSettingsSearchTerms(query);
  const visibleText = normalizeSettingsSearchValue(`${entry.label} ${entry.description}`);
  if (visibleText.includes(normalizedQuery)) return true;
  if (queryTerms.every((term) => visibleText.includes(term))) return true;

  return entry.keywords.some((keyword) => keywordMatchesSearch(keyword, normalizedQuery, queryTerms));
}

const toCamelCase = (str: string) => str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());

interface SettingsModalSidebarProps {
  activeSection: SettingsSectionId;
  searchQuery: string;
  onSelectSection: (sectionId: SettingsSectionId) => void;
  onSearchQueryChange: (query: string) => void;
}

function SettingsSectionIcon({
  iconRef,
  sectionId,
}: {
  iconRef: React.RefObject<AnimatedIconHandle | FlaskIconHandle | null>;
  sectionId: SettingsSectionId;
}) {
  if (sectionId === "layout") return <LayoutDashboardIcon ref={iconRef} className="shrink-0" size={16} />;
  if (sectionId === "editor") return <CodeXmlIcon ref={iconRef} className="shrink-0" size={16} />;
  if (sectionId === "canvas") return <CanvasIcon ref={iconRef} className="shrink-0" size={16} />;
  if (sectionId === "terminal") return <TerminalIcon ref={iconRef} className="shrink-0" size={16} />;
  if (sectionId === "code-agent") return <BotIcon ref={iconRef} className="shrink-0" size={16} />;
  if (sectionId === "workspace") return <FolderKanbanIcon ref={iconRef} className="shrink-0" size={16} />;
  if (sectionId === "labels") return <TagIcon ref={iconRef} className="shrink-0" size={16} />;
  if (sectionId === "account") return <UserIcon ref={iconRef} className="shrink-0" size={16} />;
  if (sectionId === "integrations") return <BlocksIcon ref={iconRef} className="shrink-0" size={16} />;
  if (sectionId === "ai") return <BrainCircuitIcon ref={iconRef} className="shrink-0" size={16} />;
  if (sectionId === "notify") return <BellIcon ref={iconRef} className="shrink-0" size={16} />;
  if (sectionId === "tunnel-connector") return <WorldIcon ref={iconRef} className="shrink-0" size={16} />;
  if (sectionId === "atmos-computer") return <ComputerIcon ref={iconRef} className="shrink-0" size={16} />;
  if (sectionId === "desktop-use") {
    return <DesktopUseIcon ref={iconRef} className="shrink-0" size={16} />;
  }
  if (sectionId === "permission-access") {
    return <KeyRound className="shrink-0" size={16} />;
  }
  if (sectionId === "shortcuts") return <KeyboardIcon ref={iconRef} className="shrink-0" size={16} />;
  if (sectionId === "experiments") {
    return <FlaskIcon ref={iconRef as React.Ref<FlaskIconHandle>} className="shrink-0" size={16} />;
  }
  return <InfoCircleIcon ref={iconRef} className="shrink-0" size={16} />;
}

export function SettingsModalSidebar({
  activeSection,
  searchQuery,
  onSelectSection,
  onSearchQueryChange,
}: SettingsModalSidebarProps) {
  const t = useTranslations("settings.modal");
  const [sectionIconRefs] = React.useState(() => {
    const refs: Record<string, React.RefObject<AnimatedIconHandle | FlaskIconHandle | null>> = {};
    for (const section of SETTINGS_SECTIONS) {
      refs[section.id] = React.createRef();
    }
    return refs;
  });
  const trimmedSearchQuery = searchQuery.trim();
  const orderedMatchingSectionIds = React.useMemo(() => {
    if (!trimmedSearchQuery) {
      return SETTINGS_SECTIONS.map((section) => section.id);
    }

    const seen = new Set<SettingsSectionId>();
    return SETTINGS_SEARCH_ENTRIES.flatMap((entry) => {
      const camelSectionId = toCamelCase(entry.sectionId);
      let localizedLabel = "";
      let localizedDescription = "";

      if (entry.kind === "section") {
        localizedLabel = t(`sections.${camelSectionId}.label`);
        localizedDescription = t(`sections.${camelSectionId}.description`);
      } else {
        localizedLabel = entry.translationKey ? t(`search.items.${entry.translationKey}.label`) : entry.label;
        localizedDescription = entry.translationKey && entry.description
          ? t(`search.items.${entry.translationKey}.description`)
          : t(`sections.${camelSectionId}.description`);
      }

      const localizedEntry = {
        ...entry,
        label: localizedLabel,
        description: localizedDescription,
      };

      if (seen.has(localizedEntry.sectionId) || !entryMatchesSettingsSearch(localizedEntry, trimmedSearchQuery)) return [];
      seen.add(localizedEntry.sectionId);
      return [localizedEntry.sectionId];
    });
  }, [trimmedSearchQuery, t]);
  const matchingSectionIds = React.useMemo(
    () => new Set(orderedMatchingSectionIds),
    [orderedMatchingSectionIds],
  );
  const filteredGroups = React.useMemo(
    () =>
      SETTINGS_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((itemId) => matchingSectionIds.has(itemId)),
      })).filter((group) => group.items.length > 0),
    [matchingSectionIds],
  );

  React.useEffect(() => {
    if (!trimmedSearchQuery || matchingSectionIds.has(activeSection)) return;

    const firstMatch = orderedMatchingSectionIds[0];
    if (firstMatch) {
      onSelectSection(firstMatch);
    }
  }, [activeSection, matchingSectionIds, onSelectSection, orderedMatchingSectionIds, trimmedSearchQuery]);

  return (
    <aside className="h-full min-h-0 border-r border-border bg-background text-sidebar-foreground">
      <MotionSidebarProvider className="h-full min-h-0">
        <MotionSidebar
          collapsible="none"
          className="h-full w-full border-0 bg-transparent text-sidebar-foreground"
          containerClassName="h-full"
        >
          <MotionSidebarHeader className="gap-0 px-3 pb-1.5 pt-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-sidebar-foreground/45" />
              <Input
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && searchQuery) {
                    event.preventDefault();
                    onSearchQueryChange("");
                  }
                }}
                placeholder={t("sidebar.searchPlaceholder")}
                aria-label={t("sidebar.searchAriaLabel")}
                className="h-9 rounded-lg border-border bg-muted/30 pl-8 pr-8 text-sm shadow-none"
              />
              <button
                type="button"
                aria-label={t("sidebar.clearSearchAriaLabel")}
                onClick={() => onSearchQueryChange("")}
                className={cn(
                  "absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-foreground/45 transition-colors hover:bg-muted hover:text-sidebar-foreground",
                  !searchQuery && "pointer-events-none opacity-0",
                )}
              >
                <X className="size-3.5" />
              </button>
            </div>
          </MotionSidebarHeader>

          <MotionSidebarContent className="gap-1 overflow-y-auto px-3 pb-3 pt-1">
            {filteredGroups.length === 0 ? (
              <div className="px-2 py-6 text-sm text-muted-foreground">
                {t("sidebar.noSettingsFound")}
              </div>
            ) : null}
            {filteredGroups.map((group) => (
              <MotionSidebarGroup key={group.id} className="px-2 py-1 first:pt-1">
                <MotionSidebarGroupLabel className="h-7">
                  {t(`groups.${toCamelCase(group.id)}.label`)}
                </MotionSidebarGroupLabel>
                <MotionSidebarMenu>
                  {group.items.map((itemId) => {
                    const section = SETTINGS_SECTIONS.find((item) => item.id === itemId);
                    if (!section) return null;

                    const isActive = activeSection === section.id;
                    const itemIconRef = sectionIconRefs[section.id];

                    return (
                      <MotionSidebarMenuItem key={itemId}>
                        <MotionSidebarMenuButton
                          type="button"
                          isActive={isActive}
                          onClick={() => onSelectSection(section.id)}
                          className="h-9 gap-3 rounded-lg px-3 text-left"
                          onMouseEnter={() => itemIconRef.current?.startAnimation?.()}
                          onMouseLeave={() => itemIconRef.current?.stopAnimation?.()}
                        >
                          <SettingsSectionIcon iconRef={itemIconRef} sectionId={itemId} />
                          <span className="min-w-0 truncate text-sm font-medium">
                            {t(`sections.${toCamelCase(section.id)}.label`)}
                          </span>
                        </MotionSidebarMenuButton>
                      </MotionSidebarMenuItem>
                    );
                  })}
                </MotionSidebarMenu>
              </MotionSidebarGroup>
            ))}
          </MotionSidebarContent>
        </MotionSidebar>
      </MotionSidebarProvider>
    </aside>
  );
}
