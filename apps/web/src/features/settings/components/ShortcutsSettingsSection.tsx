'use client';

import { useTranslations } from 'next-intl';
import { ShortcutKeySequence } from '@/shared/components/shortcut-key-sequence';

interface ShortcutEntry {
  keys: string[];
  description: string;
}

function ShortcutGroup({ title, shortcuts }: { title: string; shortcuts: ShortcutEntry[] }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full">
          <tbody>
            {shortcuts.map((shortcut, i) => (
              <tr
                key={i}
                className={i !== shortcuts.length - 1 ? 'border-b border-border' : ''}
              >
                <td className="w-[200px] px-4 py-3">
                  <ShortcutKeySequence keys={shortcut.keys} />
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {shortcut.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ShortcutsSettingsSection() {
  const t = useTranslations('settings.shortcutsSection');

  return (
    <div className="space-y-8">
      <ShortcutGroup
        title={t('groups.global.title')}
        shortcuts={[
          { keys: ['⌘', 'B'], description: t('groups.global.items.toggleLeftSidebar') },
          { keys: ['⌘', '⇧', 'B'], description: t('groups.global.items.toggleRightSidebar') },
          { keys: ['⌘', 'K'], description: t('groups.global.items.commandPalette') },
          { keys: ['⌘', 'O'], description: t('groups.global.items.quickOpenFile') },
          { keys: ['⌘', '['], description: t('groups.global.items.navigateBack') },
          { keys: ['⌘', ']'], description: t('groups.global.items.navigateForward') },
          { keys: ['⌘', '⇧', 'M'], description: t('groups.global.items.toggleActionMenu') },
          { keys: ['⌘', 'U'], description: t('groups.global.items.toggleQuotaPopover') },
        ]}
      />
      <ShortcutGroup
        title={t('groups.workspace.title')}
        shortcuts={[
          { keys: ['⌘', 'N'], description: t('groups.workspace.items.newWorkspaceOverlay') },
          { keys: ['⌘', '⇧', 'H'], description: t('groups.workspace.items.toggleCanvasOverlay') },
          { keys: ['⌘', '⇧', 'K'], description: t('groups.workspace.items.expandKanbanOverlay') },
          { keys: ['⌘', '⇧', '↵'], description: t('groups.workspace.items.openOrCreateWorkspace') },
        ]}
      />
      <ShortcutGroup
        title={t('groups.centerStageTabs.title')}
        shortcuts={[
          { keys: ['⌘', '0'], description: t('groups.centerStageTabs.items.overview') },
          { keys: ['⌘', '1'], description: t('groups.centerStageTabs.items.fixedTerminal') },
          { keys: ['⌘', '2'], description: t('groups.centerStageTabs.items.terminal1') },
          { keys: ['⌘', '3'], description: t('groups.centerStageTabs.items.terminal2') },
          { keys: ['⌘', '4'], description: t('groups.centerStageTabs.items.terminal3') },
          { keys: ['⌘', '5'], description: t('groups.centerStageTabs.items.terminal4') },
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
    </div>
  );
}
