import type { PtComponentModule } from "./contract";
import { CHART_MODULES } from "./modules";

export type { PtComponentModule, PtInspectorField, PtRendererProps } from "./contract";
export { CHART_MODULES };

export const CHARTS: readonly PtComponentModule[] = CHART_MODULES;
