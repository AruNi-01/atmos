import { useEffect, useState } from "react";
import { AccessibilityInfo, PixelRatio, View } from "react-native";
import { AlphaType, Canvas, ColorType, Image, Skia, type SkImage } from "@shopify/react-native-skia";
import { createEffortFlame } from "./effort-flame";

const TRACK_HEIGHT = 32;

/**
 * Max-effort jet, clipped to the effort track. Same night-sky flame as the
 * web RangeSlider `maxEffect` fill.
 */
export function EffortExhaust() {
  const [width, setWidth] = useState(0);
  const [reduce, setReduce] = useState(false);
  const [image, setImage] = useState<SkImage | null>(null);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setReduce(value);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (width < 8) return;
    const dpr = Math.min(PixelRatio.get(), 2);
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(TRACK_HEIGHT * dpr));
    const flame = createEffortFlame(pixelWidth, pixelHeight);
    let raf = 0;
    let last = performance.now();
    let time = 0.4;
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduce) time += dt;
      const pixels = flame.paint(time, dt, reduce);
      const data = Skia.Data.fromBytes(pixels.slice());
      const next = Skia.Image.MakeImage(
        {
          alphaType: AlphaType.Unpremul,
          colorType: ColorType.RGBA_8888,
          height: pixelHeight,
          width: pixelWidth,
        },
        data,
        pixelWidth * 4,
      );
      if (next) setImage(next);
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [reduce, width]);

  return (
    <View
      onLayout={(event) => {
        const next = Math.ceil(event.nativeEvent.layout.width);
        setWidth((current) => (current === next ? current : next));
      }}
      pointerEvents="none"
      style={{ borderRadius: TRACK_HEIGHT / 2, height: TRACK_HEIGHT, overflow: "hidden", width: "100%" }}
    >
      {image ? (
        <Canvas style={{ height: TRACK_HEIGHT, width: "100%" }}>
          <Image fit="fill" height={TRACK_HEIGHT} image={image} width={width} x={0} y={0} />
        </Canvas>
      ) : null}
    </View>
  );
}
