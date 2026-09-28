import { Circle, Path, Rect, Svg, Text as SvgText } from "react-native-svg";

export type StatArtKind = "messages" | "days" | "cost" | "tokens";

/** Large corner glyph, same role as the web dither illustration (about 76px, clipped by the card). */
export function StatArt({ color, kind }: { color: string; kind: StatArtKind }) {
  return (
    <Svg height={92} viewBox="0 0 80 80" width={92}>
      {kind === "messages" ? (
        <>
          <Path d="M14 16h52a10 10 0 0 1 10 10v22a10 10 0 0 1-10 10H40L24 72V58H14A10 10 0 0 1 4 48V26A10 10 0 0 1 14 16z" fill={color} />
          <Rect fill="transparent" height={5} rx={2} width={28} x={22} y={30} />
        </>
      ) : null}
      {kind === "days" ? (
        <>
          <Rect fill={color} height={54} rx={10} width={54} x={13} y={16} />
          <Rect fill={color} height={12} rx={3} width={6} x={26} y={8} />
          <Rect fill={color} height={12} rx={3} width={6} x={48} y={8} />
        </>
      ) : null}
      {kind === "cost" ? (
        <SvgText fill={color} fontSize={68} fontWeight="700" x={18} y={64}>
          $
        </SvgText>
      ) : null}
      {kind === "tokens" ? (
        <>
          <Circle cx={30} cy={48} fill={color} r={22} />
          <Circle cx={52} cy={30} fill={color} r={22} />
        </>
      ) : null}
    </Svg>
  );
}
