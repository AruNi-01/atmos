'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Switch, TabsSubtle, TabsSubtleItem, cn } from '@workspace/ui';
import { Palette } from 'lucide-react';
import {
  TERMINAL_CURSOR_STYLES,
  type TerminalCursorStyle,
  useTerminalAppearanceSettingsStore,
} from '@/features/settings/store/terminal-appearance-settings-store';
import {
  SettingsGroupCard,
  SettingsGroupRow,
} from '@/features/settings/components/settings/SettingsGroupCard';

/** Mini caret glyph used as TabsSubtle icons + live blink preview. */
function CursorStylePreviewIcon({
  style,
  blink,
  active,
  className,
  size = 16,
}: {
  style: TerminalCursorStyle;
  blink: boolean;
  active: boolean;
  className?: string;
  size?: number;
}) {
  const shouldBlink = active && blink;
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-end justify-center text-current',
        className,
      )}
      style={{
        width: size,
        height: size,
        animation: shouldBlink
          ? 'atmos-cursor-blink 1.06s step-end infinite'
          : undefined,
      }}
      aria-hidden
    >
      {style === 'block' ? (
        <span className="mb-0.5 h-[70%] w-[55%] rounded-[1px] bg-current" />
      ) : null}
      {style === 'underline' ? (
        <span className="mb-0.5 h-[12%] w-[70%] rounded-[1px] bg-current" />
      ) : null}
      {style === 'bar' ? (
        <span className="mb-0.5 h-[75%] w-[12%] rounded-[1px] bg-current" />
      ) : null}
    </span>
  );
}

function makeCursorStyleTabIcon(
  style: TerminalCursorStyle,
  blink: boolean,
  active: boolean,
): React.ComponentType<{ className?: string; size?: number }> {
  return function CursorStyleTabIcon({ className, size }) {
    return (
      <CursorStylePreviewIcon
        style={style}
        blink={blink}
        active={active}
        className={className}
        size={size}
      />
    );
  };
}

/**
 * Terminal appearance settings group (cursor style + blink).
 * Owns its store load and expand state so TerminalSettingsSection stays thinner.
 */
export function TerminalCursorAppearanceSettings() {
  const t = useTranslations('settings.terminalSection');
  const {
    cursorStyle,
    cursorBlink,
    loadSettings: loadTerminalAppearanceSettings,
    setCursorStyle,
    setCursorBlink,
  } = useTerminalAppearanceSettingsStore();
  const [appearanceExpanded, setAppearanceExpanded] = React.useState(true);

  React.useEffect(() => {
    void loadTerminalAppearanceSettings();
  }, [loadTerminalAppearanceSettings]);

  const cursorStyleIndex = Math.max(0, TERMINAL_CURSOR_STYLES.indexOf(cursorStyle));
  const cursorStyleOptions = React.useMemo(
    () =>
      TERMINAL_CURSOR_STYLES.map((style) => ({
        style,
        label: t(`cursorStyle.options.${style}`),
        icon: makeCursorStyleTabIcon(style, cursorBlink, style === cursorStyle),
      })),
    [cursorBlink, cursorStyle, t],
  );

  return (
    <>
      <style>
        {`@keyframes atmos-cursor-blink{0%,49%{opacity:1}50%,100%{opacity:0}}`}
      </style>
      <SettingsGroupCard
        open={appearanceExpanded}
        onOpenChange={setAppearanceExpanded}
        icon={Palette}
        title={t('groups.appearance.title')}
        description={t('groups.appearance.description')}
      >
        <SettingsGroupRow
          title={t('cursorStyle.title')}
          description={t('cursorStyle.description')}
          wide
        >
          <TabsSubtle
            idPrefix="terminal-cursor-style"
            activeLabel
            selectedIndex={cursorStyleIndex}
            onSelect={(index) => {
              const next = TERMINAL_CURSOR_STYLES[index];
              if (next) void setCursorStyle(next);
            }}
            className="justify-end"
          >
            {cursorStyleOptions.map((option, index) => (
              <TabsSubtleItem
                key={option.style}
                index={index}
                label={option.label}
                icon={option.icon}
              />
            ))}
          </TabsSubtle>
        </SettingsGroupRow>
        <SettingsGroupRow
          title={t('cursorBlink.title')}
          description={t('cursorBlink.description')}
        >
          <Switch
            checked={cursorBlink}
            onCheckedChange={(value) => void setCursorBlink(!!value)}
            aria-label={t('cursorBlink.title')}
          />
        </SettingsGroupRow>
      </SettingsGroupCard>
    </>
  );
}
