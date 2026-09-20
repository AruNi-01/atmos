import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import { mdLiveTableViewPlugin } from "./table-chrome";
import { mdLiveTableDeletePlugin } from "./table-ops";
import type { MdLiveCopyFn } from "./types";

export {
  isMdLiveCellSelection,
  isMdLiveFullTableSelection,
  mdLiveDeleteFullTable,
  mdLiveDeleteTableSelection,
  mdLiveFirstTablePos,
  mdLiveTableAddCol,
  mdLiveTableAddRow,
  mdLiveTableDeleteCol,
  mdLiveTableDeletePlugin,
  mdLiveTableDeleteRow,
  mdLiveTablePosFromSelection,
  mdLiveTableAtScrollEnd,
} from "./table-ops";
export { mdLiveTableViewPlugin } from "./table-chrome";

export function mdLiveTablePlugins(getCopy: () => MdLiveCopyFn | undefined): MilkdownPlugin[] {
  return [mdLiveTableDeletePlugin, mdLiveTableViewPlugin(getCopy)];
}
