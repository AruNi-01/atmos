import type { PtComponentModule } from "./contract";
import {
  authFormModule,
  emptyStateModule,
  navContentModule,
  settingsShellModule,
} from "./modules";
import { bindBlockModules } from "./runtime";

export type { PtComponentModule, PtInspectorField, PtRendererProps } from "./contract";

export const BLOCK_MODULES: readonly PtComponentModule[] = [
  authFormModule,
  settingsShellModule,
  emptyStateModule,
  navContentModule,
];

bindBlockModules(BLOCK_MODULES);
