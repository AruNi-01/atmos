import { SvgXml } from "react-native-svg";
import { CoinsIcon, LayoutGridIcon } from "@/ui/icons/lucide-native";
import { PROVIDER_SVG } from "@/ui/icons/provider-svg";

function tintProviderSvg(xml: string, color: string) {
  const rooted = xml.replace(/currentColor/g, color);
  return rooted.replace(/<path\b([^>]*?)\/?>/g, (tag, attrs: string) => {
    const painted = /\bfill\s*=/.test(attrs)
      ? attrs.replace(/fill="(?!none\b)[^"]*"/g, `fill="${color}"`)
      : `${attrs} fill="${color}"`;
    const close = tag.endsWith("/>") ? "/>" : ">";
    return `<path${painted}${close}`;
  });
}

export function ProviderGlyph({
  color,
  providerId,
  size = 18,
}: {
  color: string;
  providerId: string;
  size?: number;
}) {
  if (providerId === "all") return <LayoutGridIcon color={color} size={size} strokeWidth={1.8} />;
  const xml = PROVIDER_SVG[providerId];
  if (!xml) return <CoinsIcon color={color} size={size} strokeWidth={1.8} />;
  return <SvgXml height={size} width={size} xml={tintProviderSvg(xml, color)} />;
}
