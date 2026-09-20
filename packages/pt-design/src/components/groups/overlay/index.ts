import type { PtComponentModule } from "./contract";
import { alertDialogModule, dialogModule, drawerModule, sheetModule } from "./panels";
import { commandModule } from "./command";
import { contextMenuModule, dropdownMenuModule, menubarModule, navigationMenuModule } from "./menus";
import { hoverCardModule, popoverModule, tooltipModule } from "./bubbles";
import { sonnerModule, toastModule } from "./notices";
import { registerOverlayModules } from "./catalog";

export const OVERLAY_MODULES: readonly PtComponentModule[] = [
  alertDialogModule,
  contextMenuModule,
  dialogModule,
  drawerModule,
  dropdownMenuModule,
  hoverCardModule,
  menubarModule,
  navigationMenuModule,
  popoverModule,
  sheetModule,
  toastModule,
  sonnerModule,
  tooltipModule,
  commandModule,
];

registerOverlayModules(OVERLAY_MODULES);
