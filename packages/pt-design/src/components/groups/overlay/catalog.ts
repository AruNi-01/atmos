import type { PtComponentModule } from "./contract";

const byType = new Map<string, PtComponentModule>();

export function registerOverlayModules(modules: readonly PtComponentModule[]): void {
  byType.clear();
  for (const mod of modules) byType.set(mod.type, mod);
}

export function overlayModuleOf(type: string): PtComponentModule | undefined {
  return byType.get(type);
}
