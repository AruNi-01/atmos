"use client";

import React from "react";
import {
  MotionSidebar,
  MotionSidebarContent,
  MotionSidebarGroup,
  MotionSidebarGroupLabel,
  MotionSidebarHeader,
  MotionSidebarMenu,
  MotionSidebarMenuButton,
  MotionSidebarMenuItem,
  MotionSidebarProvider,
} from "@workspace/ui";
import InfoCircleIcon from "@workspace/ui/components/icons/info-circle-icon";
import LayoutDashboardIcon from "@workspace/ui/components/icons/layout-dashboard-icon";
import TerminalIcon from "@workspace/ui/components/icons/terminal-icon";
import { BotIcon } from "@workspace/ui/components/icons/bot-icon";
import BrainCircuitIcon from "@workspace/ui/components/icons/brain-circuit-icon";
import { BellIcon } from "@workspace/ui/components/icons/bell-icon";
import WorldIcon from "@workspace/ui/components/icons/world-icon";
import ComputerIcon from "@workspace/ui/components/icons/computer-icon";
import { FolderKanbanIcon } from "@workspace/ui/components/icons/folder-kanban-icon";
import { TagIcon } from "@workspace/ui/components/icons/tag-icon";
import KeyboardIcon from "@workspace/ui/components/icons/keyboard-icon";
import { BlocksIcon } from "@workspace/ui/components/icons/blocks-icon";
import CodeXmlIcon from "@workspace/ui/components/ui/code-xml-icon";
import CanvasIcon from "@workspace/ui/components/icons/canvas-icon";
import type { AnimatedIconHandle } from "@workspace/ui/components/icons/types";
import { FlaskIcon, type FlaskIconHandle } from "@/shared/components/ui/flask-icon";

export const SETTINGS_GROUPS = [
  {
    id: "interface",
    label: "Interface",
    description: "Layout, editor, canvas, and keyboard preferences",
    items: ["layout", "editor", "canvas", "terminal"] as const,
  },
  {
    id: "ai-agents",
    label: "AI & Agents",
    description: "AI providers and code agent configurations",
    items: ["ai", "code-agent"] as const,
  },
  {
    id: "system-integration",
    label: "System & Integration",
    description: "Integrations, remote access, and notifications",
    items: ["integrations", "remote-access", "atmos-computer", "notify"] as const,
  },
  {
    id: "workspace-projects",
    label: "Workspace & Projects",
    description: "Workspace management and labels",
    items: ["workspace", "labels"] as const,
  },
  {
    id: "more",
    label: "More",
    description: "Shortcuts, experiments, and about",
    items: ["shortcuts", "experiments", "about"] as const,
  },
] as const;

export const SETTINGS_SECTIONS = [
  {
    id: "layout",
    label: "Layout",
    description: "Panel arrangement and sidebar preferences",
  },
  {
    id: "editor",
    label: "Editor",
    description: "Code editor preferences and features",
  },
  {
    id: "canvas",
    label: "Canvas",
    description: "Canvas board preferences and auto-save behavior",
  },
  {
    id: "code-agent",
    label: "Code Agent",
    description: "Agent startup commands and custom parameters",
  },
  {
    id: "terminal",
    label: "Terminal",
    description: "Terminal preferences and link behavior",
  },
  {
    id: "workspace",
    label: "Workspace",
    description: "Deletion behavior and cleanup options",
  },
  {
    id: "labels",
    label: "Labels",
    description: "Manage workspace labels and their properties",
  },
  {
    id: "integrations",
    label: "Integrations",
    description: "External tool integrations and status",
  },
  {
    id: "ai",
    label: "AI & Provider",
    description: "Providers and lightweight task routing",
  },
  {
    id: "notify",
    label: "Notify",
    description: "Notification channels and agent event triggers",
  },
  {
    id: "remote-access",
    label: "Remote Access",
    description: "Tunnel gateway and remote browser access",
  },
  {
    id: "atmos-computer",
    label: "Atmos Computer",
    description: "Connect to your computers from anywhere",
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    description: "Keyboard shortcuts across the application",
  },
  {
    id: "experiments",
    label: "Experiments",
    description: "Optional and preview features disabled by default",
  },
  {
    id: "about",
    label: "About",
    description: "Product overview and desktop updates",
  },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

interface SettingsModalSidebarProps {
  activeSection: SettingsSectionId;
  onSelectSection: (sectionId: SettingsSectionId) => void;
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
  if (sectionId === "integrations") return <BlocksIcon ref={iconRef} className="shrink-0" size={16} />;
  if (sectionId === "ai") return <BrainCircuitIcon ref={iconRef} className="shrink-0" size={16} />;
  if (sectionId === "notify") return <BellIcon ref={iconRef} className="shrink-0" size={16} />;
  if (sectionId === "remote-access") return <WorldIcon ref={iconRef} className="shrink-0" size={16} />;
  if (sectionId === "atmos-computer") return <ComputerIcon ref={iconRef} className="shrink-0" size={16} />;
  if (sectionId === "shortcuts") return <KeyboardIcon ref={iconRef} className="shrink-0" size={16} />;
  if (sectionId === "experiments") {
    return <FlaskIcon ref={iconRef as React.Ref<FlaskIconHandle>} className="shrink-0" size={16} />;
  }
  return <InfoCircleIcon ref={iconRef} className="shrink-0" size={16} />;
}

export function SettingsModalSidebar({
  activeSection,
  onSelectSection,
}: SettingsModalSidebarProps) {
  const [sectionIconRefs] = React.useState(() => {
    const refs: Record<string, React.RefObject<AnimatedIconHandle | FlaskIconHandle | null>> = {};
    for (const section of SETTINGS_SECTIONS) {
      refs[section.id] = React.createRef();
    }
    return refs;
  });

  return (
    <aside className="h-full min-h-0 border-r border-border bg-background text-sidebar-foreground">
      <MotionSidebarProvider className="h-full min-h-0">
        <MotionSidebar
          collapsible="none"
          className="h-full w-full border-0 bg-transparent text-sidebar-foreground"
          containerClassName="h-full"
        >
          <MotionSidebarHeader className="gap-0 border-b border-border px-5 py-5">
            <p className="text-[12px] font-semibold text-sidebar-foreground/70">
              Settings
            </p>
            <p className="mt-2 text-xs text-sidebar-foreground/70">
              Setting atmos to personalize your experience.
            </p>
          </MotionSidebarHeader>

          <MotionSidebarContent className="overflow-y-auto p-3">
            {SETTINGS_GROUPS.map((group) => (
              <MotionSidebarGroup key={group.id}>
                <MotionSidebarGroupLabel>{group.label}</MotionSidebarGroupLabel>
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
                          <span className="min-w-0 truncate text-sm font-medium">{section.label}</span>
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
