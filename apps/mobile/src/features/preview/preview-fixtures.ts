import type { ComputerRow, TerminalWorkspaceCandidate } from "@/api/types";
import {
  mergeTerminalCandidateEntries,
  sortTerminalEntries,
} from "@/features/terminal/terminal-selection";
import type { MobileTerminalEntry } from "@/stores/terminal-store";

export const PREVIEW_COMPUTER: ComputerRow = {
  server_id: "preview-studio-mac",
  display_name: "Studio Mac",
  revoked: 0,
  created_at: 1_700_000_000,
  last_seen_at: 1_800_000_000,
  registration_meta: { mock: true },
  online: true,
  app_device_id: "preview-device",
};

export type PreviewWorkspaceFixture = {
  id: string;
  name: string;
  projectName: string;
  candidates: TerminalWorkspaceCandidate[];
  transcripts: Record<string, string[]>;
};

function candidate(
  partial: Pick<TerminalWorkspaceCandidate, "id" | "label" | "workspace_id"> &
    Partial<TerminalWorkspaceCandidate>,
): TerminalWorkspaceCandidate {
  return {
    active: false,
    ...partial,
  };
}

export const PREVIEW_WORKSPACES: PreviewWorkspaceFixture[] = [
  {
    id: "ws-atmos",
    name: "atmos",
    projectName: "Atmos",
    candidates: [
      candidate({
        id: "tmux:ws-atmos:0",
        workspace_id: "ws-atmos",
        label: "editor",
        tmux_window_index: 0,
        tmux_window_name: "editor",
      }),
      candidate({
        active: true,
        id: "tmux:ws-atmos:1:tab",
        workspace_id: "ws-atmos",
        label: "zsh",
        tmux_window_index: 1,
        tmux_window_name: "zsh",
      }),
      candidate({
        id: "tmux:ws-atmos:1:window",
        workspace_id: "ws-atmos",
        label: "zsh",
        tmux_window_index: 1,
        tmux_window_name: "zsh",
      }),
      candidate({
        id: "tmux:ws-atmos:2",
        workspace_id: "ws-atmos",
        label: "claude",
        tmux_window_index: 2,
        tmux_window_name: "claude",
      }),
    ],
    transcripts: {
      "tmux:ws-atmos:0": [
        "Studio Mac — editor",
        "~/atmos",
        "$ bun run typecheck",
        "✓ typecheck",
      ],
      "tmux:ws-atmos:1:tab": [
        "Studio Mac — zsh (tab)",
        "~/atmos",
        "$ git status",
        "On branch aarynlu/mobile-terminal-main-path-7d6c",
      ],
      "tmux:ws-atmos:1:window": [
        "Studio Mac — zsh (window)",
        "~/atmos/apps/mobile",
        "$ bun test",
        "52 pass, 0 fail",
      ],
      "tmux:ws-atmos:2": [
        "Studio Mac — claude",
        "Claude Code",
        "> Flatten workspace terminals into one tab strip",
      ],
    },
  },
  {
    id: "ws-landing",
    name: "landing",
    projectName: "Atmos",
    candidates: [
      candidate({
        active: true,
        id: "tmux:ws-landing:1",
        workspace_id: "ws-landing",
        label: "dev",
        tmux_window_index: 1,
        tmux_window_name: "dev",
      }),
      candidate({
        id: "tmux:ws-landing:3",
        workspace_id: "ws-landing",
        label: "preview",
        tmux_window_index: 3,
        tmux_window_name: "preview",
      }),
    ],
    transcripts: {
      "tmux:ws-landing:1": [
        "Studio Mac — landing/dev",
        "~/atmos/apps/landing",
        "$ bun run dev",
        "ready on :3000",
      ],
      "tmux:ws-landing:3": [
        "Studio Mac — landing/preview",
        "~/atmos/apps/landing",
        "$ bun run build",
      ],
    },
  },
];

export const PREVIEW_WORKSPACE_CHOICES: Array<{ id: string; name: string }> = PREVIEW_WORKSPACES.map(
  (workspace) => ({
    id: workspace.id,
    name: workspace.name,
  }),
);

export function previewWorkspaceById(workspaceId: string): PreviewWorkspaceFixture {
  return PREVIEW_WORKSPACES.find((workspace) => workspace.id === workspaceId) ?? PREVIEW_WORKSPACES[0]!;
}

export function previewEntriesForWorkspace(workspaceId: string): MobileTerminalEntry[] {
  const workspace = previewWorkspaceById(workspaceId);
  return mergeTerminalCandidateEntries(workspace.id, workspace.candidates, []);
}

export function previewTranscript(
  workspaceId: string,
  entryId: string,
  extraLines: string[] = [],
): string[] {
  const workspace = previewWorkspaceById(workspaceId);
  const lines = workspace.transcripts[entryId] ?? [`${PREVIEW_COMPUTER.display_name} — mock`, "$"];
  return [...lines, ...extraLines];
}

export function sortPreviewEntries(entries: MobileTerminalEntry[]): MobileTerminalEntry[] {
  return sortTerminalEntries(entries);
}
