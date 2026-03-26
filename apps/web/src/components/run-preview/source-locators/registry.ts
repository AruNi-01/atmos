import { angularSourceLocator } from './angular-locator';
import { reactSourceLocator } from './react-locator';
import { svelteSourceLocator } from './svelte-locator';
import { vueSourceLocator } from './vue-locator';
import type { SourceLocationResult, SourceLocatorAdapter } from './types';

const adapters: SourceLocatorAdapter[] = [vueSourceLocator, angularSourceLocator, svelteSourceLocator, reactSourceLocator];

export function getRegisteredSourceLocators(): SourceLocatorAdapter[] {
  return adapters.slice();
}

export function getAvailableSourceLocatorCapabilities(win: Window): string[] {
  return adapters
    .filter((adapter) => adapter.canHandle(win))
    .map((adapter) => `source-locator:${adapter.id}`);
}

export function locateSourceForElement(element: Element, win: Window): SourceLocationResult | null {
  for (const adapter of adapters) {
    if (!adapter.canHandle(win)) continue;
    const result = adapter.locate(element, win);
    if (result) return result;
  }
  return null;
}
