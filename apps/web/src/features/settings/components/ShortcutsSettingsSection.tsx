'use client';

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
  return (
    <div className="space-y-8">
      <ShortcutGroup
        title="Global"
        shortcuts={[
          { keys: ['⌘', 'B'], description: 'Toggle left sidebar' },
          { keys: ['⌘', '⇧', 'B'], description: 'Toggle right sidebar' },
          { keys: ['⌘', 'K'], description: 'Command palette / global search' },
          { keys: ['⌘', 'O'], description: 'Quick open file' },
          { keys: ['⌘', '['], description: 'Navigate back' },
          { keys: ['⌘', ']'], description: 'Navigate forward' },
          { keys: ['⌘', '⇧', 'M'], description: 'Toggle action menu' },
          { keys: ['⌘', 'U'], description: 'Toggle usage popover' },
        ]}
      />
      <ShortcutGroup
        title="Workspace"
        shortcuts={[
          { keys: ['⌘', 'N'], description: 'New workspace overlay' },
          { keys: ['⌘', '⇧', 'H'], description: 'Toggle Canvas overlay' },
          { keys: ['⌘', '⇧', 'K'], description: 'Expand Kanban overlay' },
          { keys: ['⌘', '⇧', '↵'], description: 'Open / create workspace (In new workspace overlay)' },
        ]}
      />
      <ShortcutGroup
        title="Center Stage Tabs"
        shortcuts={[
          { keys: ['⌘', '0'], description: 'Switch to Overview tab' },
          { keys: ['⌘', '1'], description: 'Switch to Fixed Terminal tab' },
          { keys: ['⌘', '2'], description: 'Switch to terminal tab 1' },
          { keys: ['⌘', '3'], description: 'Switch to terminal tab 2' },
          { keys: ['⌘', '4'], description: 'Switch to terminal tab 3' },
          { keys: ['⌘', '5'], description: 'Switch to terminal tab 4' },
        ]}
      />
      <ShortcutGroup
        title="Terminal"
        shortcuts={[
          { keys: ['⌘', 'D'], description: 'Split terminal horizontally' },
          { keys: ['⌘', '⇧', 'D'], description: 'Split terminal vertically' },
          { keys: ['⌘', 'T'], description: 'New terminal tab' },
          { keys: ['⌘', 'W'], description: 'Close terminal pane' },
          { keys: ['⌘', '⇧', 'F'], description: 'Maximize / minimize terminal panel' },
          { keys: ['⌘', '⇧', 'P'], description: 'Pin terminal to Canvas' },
          { keys: ['⌘', 'F'], description: 'Find in terminal' },
          { keys: ['⌘', '['], description: 'Previous terminal tab' },
          { keys: ['⌘', ']'], description: 'Next terminal tab' },
          { keys: ['⌘', 'C'], description: 'Copy selection' },
        ]}
      />
      <ShortcutGroup
        title="Appshots"
        shortcuts={[
          { keys: ['Fn', '⌥', '⌘'], description: 'Capture the focused app as an Appshot' },
        ]}
      />
      <ShortcutGroup
        title="Editor"
        shortcuts={[
          { keys: ['⌘', 'S'], description: 'Save current file' },
          { keys: ['⌘', 'F'], description: 'Find in editor' },
        ]}
      />
      <ShortcutGroup
        title="Submit & Commit"
        shortcuts={[
          { keys: ['⌘', '↵'], description: 'Submit prompt / commit message' },
        ]}
      />
      <ShortcutGroup
        title="Diff Viewer"
        shortcuts={[
          { keys: ['⇧', 'Click'], description: 'Multi-select lines for annotation' },
        ]}
      />
    </div>
  );
}
