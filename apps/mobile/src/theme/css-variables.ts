import { getMobileThemeColors, lightColors, type MobileThemeColorScheme, type MobileThemeColors } from "./colors";
import { pressed } from "./pressed";
import { radii } from "./radii";
import { shadows } from "./shadows";
import { spacing } from "./spacing";
import { typography } from "./typography";

function camelToKebab(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

export function mobileColorKeyToCssVar(colorKey: keyof MobileThemeColors) {
  return `--color-${camelToKebab(colorKey)}`;
}

export const mobileColorCssVarKeys = Object.keys(lightColors).map((key) =>
  mobileColorKeyToCssVar(key as keyof MobileThemeColors),
);

export function getMobileColorCssVariables(colors: MobileThemeColors) {
  return Object.fromEntries(
    Object.entries(colors).map(([key, value]) => [mobileColorKeyToCssVar(key as keyof MobileThemeColors), value]),
  ) as Record<(typeof mobileColorCssVarKeys)[number], string>;
}

export function getMobileLayoutCssVariables() {
  return {
    "--spacing-screen-x": `${spacing.screenX}px`,
    "--spacing-screen-bottom": `${spacing.screenBottom}px`,
    "--spacing-screen-footer-bottom": `${spacing.screenFooterBottom}px`,
    "--spacing-screen-footer-top": `${spacing.screenFooterTop}px`,
    "--spacing-section-gap": `${spacing.sectionGap}px`,
    "--spacing-section-label-gap": `${spacing.sectionLabelGap}px`,
    "--spacing-section-label-x": `${spacing.sectionLabelX}px`,
    "--spacing-row-x": `${spacing.rowX}px`,
    "--spacing-row-y": `${spacing.rowY}px`,
    "--spacing-row-min-height": `${spacing.rowMinHeight}px`,
    "--spacing-row-gap": `${spacing.rowGap}px`,
    "--spacing-row-title-gap": `${spacing.rowTitleGap}px`,
    "--spacing-action-row-gap": `${spacing.actionRowGap}px`,
    "--spacing-card-padding": `${spacing.cardPadding}px`,
    "--spacing-content-padding": `${spacing.contentPadding}px`,
    "--spacing-separator-inset": `${spacing.separatorInset}px`,
    "--spacing-terminal-header-x": `${spacing.terminalHeaderX}px`,
    "--spacing-terminal-header-min-height": `${spacing.terminalHeaderMinHeight}px`,
    "--spacing-terminal-chrome-x": `${spacing.terminalChromeX}px`,
    "--spacing-terminal-keycap-gap": `${spacing.terminalKeycapGap}px`,
    "--radius-card": `${radii.card}px`,
    "--radius-card-nested": `${radii.cardNested}px`,
    "--radius-control": `${radii.control}px`,
    "--radius-icon-well": `${radii.iconWell}px`,
    "--radius-pill": `${radii.pill}px`,
    "--radius-terminal-chrome": `${radii.terminalChrome}px`,
    "--radius-terminal-keycap": `${radii.terminalKeycap}px`,
    "--font-size-hero-title": `${typography.heroTitle.fontSize}px`,
    "--line-height-hero-title": `${typography.heroTitle.lineHeight}px`,
    "--letter-spacing-hero-title": `${typography.heroTitle.letterSpacing}px`,
    "--font-size-hero-subtitle": `${typography.heroSubtitle.fontSize}px`,
    "--line-height-hero-subtitle": `${typography.heroSubtitle.lineHeight}px`,
    "--font-size-body-small": `${typography.bodySmall.fontSize}px`,
    "--line-height-body-small": `${typography.bodySmall.lineHeight}px`,
    "--font-size-mono-code": `${typography.monoCode.fontSize}px`,
    "--line-height-mono-code": `${typography.monoCode.lineHeight}px`,
    "--font-size-terminal-title": `${typography.terminalTitle.fontSize}px`,
    "--line-height-terminal-title": `${typography.terminalTitle.lineHeight}px`,
    "--font-size-terminal-keycap-label": `${typography.terminalKeycapLabel.fontSize}px`,
    "--line-height-terminal-keycap-label": `${typography.terminalKeycapLabel.lineHeight}px`,
    "--font-size-terminal-status": `${typography.terminalStatus.fontSize}px`,
    "--line-height-terminal-status": `${typography.terminalStatus.lineHeight}px`,
    "--font-size-section-label": `${typography.sectionLabel.fontSize}px`,
    "--line-height-section-label": `${typography.sectionLabel.lineHeight}px`,
    "--font-size-row-title": `${typography.rowTitle.fontSize}px`,
    "--line-height-row-title": `${typography.rowTitle.lineHeight}px`,
    "--font-size-row-subtitle": `${typography.rowSubtitle.fontSize}px`,
    "--line-height-row-subtitle": `${typography.rowSubtitle.lineHeight}px`,
    "--font-size-empty-title": `${typography.emptyTitle.fontSize}px`,
    "--line-height-empty-title": `${typography.emptyTitle.lineHeight}px`,
    "--font-size-empty-message": `${typography.emptyMessage.fontSize}px`,
    "--line-height-empty-message": `${typography.emptyMessage.lineHeight}px`,
    "--font-size-body": `${typography.body.fontSize}px`,
    "--line-height-body": `${typography.body.lineHeight}px`,
    "--opacity-pressed-control": String(pressed.controlOpacity),
    "--opacity-pressed-row": String(pressed.rowOpacity),
    "--shadow-glass-panel-dark": shadows.glassPanelDark,
    "--shadow-glass-panel-light": shadows.glassPanelLight,
    "--shadow-segmented-selected-dark": shadows.segmentedSelectedDark,
    "--shadow-segmented-selected-light": shadows.segmentedSelectedLight,
  } as const;
}

export function getMobileCssVariables(colorScheme: MobileThemeColorScheme): Record<string, string> {
  return {
    ...getMobileLayoutCssVariables(),
    ...getMobileColorCssVariables(getMobileThemeColors(colorScheme)),
  };
}

export const mobileLightCssVariables = getMobileCssVariables("light");
