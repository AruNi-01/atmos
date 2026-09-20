import type { PtComponentModule } from "./contract";
import {
  cardModule,
  dataTableModule,
  questionnaireModule,
  resizableModule,
  scrollAreaModule,
  tableModule,
} from "./content";
import { alertModule, emptyModule, progressModule, skeletonModule, spinnerModule } from "./feedback";
import {
  attachmentModule,
  bubbleModule,
  chartModule,
  messageModule,
  messageScrollerModule,
} from "./media";
import {
  accordionModule,
  breadcrumbModule,
  carouselModule,
  collapsibleModule,
  paginationModule,
  sidebarModule,
  tabsModule,
} from "./navigation";
import {
  aspectRatioModule,
  avatarModule,
  badgeModule,
  directionModule,
  itemModule,
  kbdModule,
  markerModule,
  separatorModule,
  typographyModule,
} from "./primitives";
import { bindDisplayModules } from "./runtime";

export type { PtComponentModule, PtInspectorField, PtRendererProps } from "./contract";

export const DISPLAY_MODULES: readonly PtComponentModule[] = [
  accordionModule,
  alertModule,
  aspectRatioModule,
  attachmentModule,
  avatarModule,
  badgeModule,
  breadcrumbModule,
  bubbleModule,
  cardModule,
  carouselModule,
  chartModule,
  collapsibleModule,
  dataTableModule,
  directionModule,
  emptyModule,
  itemModule,
  kbdModule,
  markerModule,
  messageModule,
  messageScrollerModule,
  paginationModule,
  progressModule,
  questionnaireModule,
  resizableModule,
  scrollAreaModule,
  separatorModule,
  sidebarModule,
  skeletonModule,
  spinnerModule,
  tableModule,
  tabsModule,
  typographyModule,
];

bindDisplayModules(DISPLAY_MODULES);
