'use client';

import { useTranslations } from 'next-intl';
import { SettingsGroup, SettingsPageStack } from '@/features/settings/components/settings/SettingsGroupCard';
import { ShortcutKeySequence } from '@/shared/components/shortcut-key-sequence';

interface ShortcutEntry {
  keys: string[];
  description: string;
}

function ShortcutGroup({ title, shortcuts }: { title: string; shortcuts: ShortcutEntry[] }) {
  return (
    <section className="space-y-3">
      <h3 className="px-0.5 text-sm font-medium text-foreground">{title}</h3>
      <SettingsGroup>
        {shortcuts.map((shortcut, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-6 border-b border-border/60 px-2 py-3 last:border-b-0"
          >
            <p className="text-sm text-muted-foreground">{shortcut.description}</p>
            <ShortcutKeySequence keys={shortcut.keys} />
          </div>
        ))}
      </SettingsGroup>
    </section>
  );
}

export function ShortcutsSettingsSection() {
  const t = useTranslations('settings.shortcutsSection');

  return (
    <SettingsPageStack>
      <ShortcutGroup
        title={t('groups.global.title')}
        shortcuts={[
          { keys: ['⌘', 'B'], description: t('groups.global.items.toggleLeftSidebar') },
          { keys: ['⌘', 'K'], description: t('groups.global.items.commandPalette') },
          { keys: ['⌘', 'O'], description: t('groups.global.items.quickOpenFile') },
          { keys: ['⌘', '['], description: t('groups.global.items.navigateBack') },
          { keys: ['⌘', ']'], description: t('groups.global.items.navigateForward') },
          { keys: ['⌘', '⇧', 'M'], description: t('groups.global.items.toggleActionMenu') },
          { keys: ['⌘', 'U'], description: t('groups.global.items.toggleQuotaPopover') },
          { keys: ['⌘', '⇧', 'U'], description: t('groups.global.items.toggleNeedAttention') },
        ]}
      />
      <ShortcutGroup
        title={t('groups.workspace.title')}
        shortcuts={[
          { keys: ['⌘', 'N'], description: t('groups.workspace.items.newWorkspaceOverlay') },
          { keys: ['⌘', '⇧', 'H'], description: t('groups.workspace.items.toggleCanvasOverlay') },
          { keys: ['⌘', '⇧', 'K'], description: t('groups.workspace.items.expandKanbanOverlay') },
          { keys: ['⌘', '⇧', '↵'], description: t('groups.workspace.items.openOrCreateWorkspace') },
          { keys: ['⌘', '⇧', '1-9'], description: t('groups.workspace.items.listByPosition') },
        ]}
      />
      <ShortcutGroup
        title={t('groups.centerStageTabs.title')}
        shortcuts={[
          { keys: ['⌘', '0'], description: t('groups.centerStageTabs.items.overview') },
          { keys: ['⌘', '1-9'], description: t('groups.centerStageTabs.items.tabByPosition') },
        ]}
      />
      <ShortcutGroup
        title={t('groups.terminal.title')}
        shortcuts={[
          { keys: ['⌘', 'D'], description: t('groups.terminal.items.splitHorizontal') },
          { keys: ['⌘', '⇧', 'D'], description: t('groups.terminal.items.splitVertical') },
          { keys: ['⌘', 'T'], description: t('groups.terminal.items.newTab') },
          { keys: ['⌘', 'W'], description: t('groups.terminal.items.closePane') },
          { keys: ['⌘', '⇧', 'F'], description: t('groups.terminal.items.maximizePanel') },
          { keys: ['⌘', '⇧', 'P'], description: t('groups.terminal.items.pinToCanvas') },
          { keys: ['⌘', 'F'], description: t('groups.terminal.items.findInTerminal') },
          { keys: ['⌘', 'G'], description: t('groups.terminal.items.toggleAgentInput') },
          { keys: ['⌘', '['], description: t('groups.terminal.items.previousTab') },
          { keys: ['⌘', ']'], description: t('groups.terminal.items.nextTab') },
          { keys: ['⌘', 'C'], description: t('groups.terminal.items.copySelection') },
        ]}
      />
      <ShortcutGroup
        title={t('groups.appshots.title')}
        shortcuts={[
          { keys: ['Left ⇧', 'Right ⇧'], description: t('groups.appshots.items.captureFocusedApp') },
        ]}
      />
      <ShortcutGroup
        title={t('groups.editor.title')}
        shortcuts={[
          { keys: ['⌘', 'S'], description: t('groups.editor.items.saveCurrentFile') },
          { keys: ['⌘', 'F'], description: t('groups.editor.items.findInEditor') },
          { keys: ['⌘', 'G'], description: t('groups.editor.items.toggleAgentInput') },
        ]}
      />
      <ShortcutGroup
        title={t('groups.submitCommit.title')}
        shortcuts={[
          { keys: ['⌘', '↵'], description: t('groups.submitCommit.items.submitPromptOrCommit') },
        ]}
      />
      <ShortcutGroup
        title={t('groups.diffViewer.title')}
        shortcuts={[
          { keys: ['⇧', 'Click'], description: t('groups.diffViewer.items.multiSelectLines') },
        ]}
      />
    </SettingsPageStack>
  );
}
