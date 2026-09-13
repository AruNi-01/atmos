import { $remark } from "@milkdown/kit/utils";
import { remarkUnknownMdast } from "../embed/unknown-directive";

export const mdLiveUnknownMdastRemark = $remark("mdLiveUnknownMdast", () => remarkUnknownMdast);

export const mdLiveUnknownMdastPlugins = [mdLiveUnknownMdastRemark].flat();
