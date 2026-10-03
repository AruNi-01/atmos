import type { RefObject } from "react";
import { Platform, type ScrollView, type View } from "react-native";
import { File, Paths } from "expo-file-system";
import { ImageFormat, Skia, makeImageFromView, type SkImage } from "@shopify/react-native-skia";

export type UsageShot = {
  aspect: number;
  uri: string;
};

type Measurable = {
  measure: (callback: (x: number, y: number, width: number, height: number) => void) => void;
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
  scrollTo?: (options: { animated?: boolean; y: number }) => void;
};

function asMeasurable(node: object): Measurable {
  return node as Measurable;
}

export async function captureUsageImage(input: {
  contentRef: RefObject<View | null>;
  offsetSeen: () => boolean;
  readOffset: () => number;
  scrollRef: RefObject<ScrollView | null>;
  /** Hide the navigation-bar scroll-edge fade so it is not baked into the image. */
  setEdgeHidden: (hidden: boolean) => void;
  setFreeze: (uri: string | null) => void;
}): Promise<UsageShot> {
  if (Platform.OS === "web") throw new Error("Could not capture this page.");
  const scroll = input.scrollRef.current;
  const content = input.contentRef.current;
  if (!scroll || !content) throw new Error("Could not capture this page.");

  const [contentSize, viewport, scrollWindow, contentWindow] = await Promise.all([
    measureLayout(asMeasurable(content)),
    measureLayout(asMeasurable(scroll)),
    measureWindow(asMeasurable(scroll)),
    measureWindow(asMeasurable(content)),
  ]);
  const saved = input.offsetSeen() ? input.readOffset() : scrollWindow.y - contentWindow.y;
  if (contentSize.height < 1 || viewport.height < 1 || viewport.width < 1) {
    throw new Error("Could not capture this page.");
  }

  let freezeUri: string | null = null;
  try {
    input.setEdgeHidden(true);
    await waitFrames(4);
    const current = await captureView(input.scrollRef);
    freezeUri = writePng(current);
    input.setFreeze(freezeUri);
    await waitFrames(2);

    const maxOffset = Math.max(0, contentSize.height - viewport.height);
    const slices: { image: SkImage; offset: number }[] = [];
    for (let guard = 0; guard < 12; guard += 1) {
      const offset = Math.min(guard * viewport.height, maxOffset);
      await scrollToSettled(scroll, offset, input.readOffset);
      slices.push({ image: await captureView(input.scrollRef), offset });
      if (offset >= maxOffset - 0.5) break;
    }
    await waitFrames(1);
    const image = stitchSlices(slices, contentSize.height, viewport.height);
    await scrollToSettled(scroll, saved, input.readOffset);
    await waitFrames(1);
    return { aspect: image.width() / image.height(), uri: writePng(image) };
  } finally {
    input.setEdgeHidden(false);
    input.setFreeze(null);
    if (freezeUri) releaseUsageImage(freezeUri);
  }
}

export function releaseUsageImage(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cache files are disposable.
  }
}

async function captureView(ref: RefObject<ScrollView | null>): Promise<SkImage> {
  const image = await makeImageFromView(ref as unknown as RefObject<View>);
  if (!image || image.width() < 1 || image.height() < 1) throw new Error("Could not capture this page.");
  return image;
}

function stitchSlices(slices: { image: SkImage; offset: number }[], contentHeight: number, viewportHeight: number): SkImage {
  const first = slices[0];
  if (!first) throw new Error("Could not capture this page.");
  const scale = first.image.height() / viewportHeight;
  const width = first.image.width();
  const totalHeight = Math.max(1, Math.round(contentHeight * scale));
  const surface = Skia.Surface.Make(width, totalHeight);
  if (!surface) throw new Error("Could not capture this page.");
  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  let drawn = 0;
  for (const slice of slices) {
    const sliceScale = slice.image.height() / viewportHeight;
    const start = Math.round(slice.offset * sliceScale);
    const skip = Math.max(0, drawn - start);
    const end = Math.min(totalHeight, Math.round((slice.offset + viewportHeight) * sliceScale));
    const take = end - (start + skip);
    if (take < 1) continue;
    canvas.drawImageRect(
      slice.image,
      Skia.XYWHRect(0, skip, width, take),
      Skia.XYWHRect(0, drawn, width, take),
      paint,
    );
    drawn += take;
  }
  const image = surface.makeImageSnapshot();
  if (image.width() < 1 || image.height() < 1) throw new Error("Could not capture this page.");
  return image;
}

function writePng(image: SkImage): string {
  const base64 = image.encodeToBase64(ImageFormat.PNG);
  if (!base64) throw new Error("Could not capture this page.");
  const file = new File(Paths.cache, `atmos-usage-${Date.now()}-${Math.random().toString(16).slice(2)}.png`);
  file.create();
  file.write(base64, { encoding: "base64" });
  return file.uri;
}

function measureLayout(node: Pick<Measurable, "measure">): Promise<{ height: number; width: number }> {
  return new Promise((resolve) => {
    node.measure((_x, _y, width, height) => resolve({ height, width }));
  });
}

function measureWindow(node: Pick<Measurable, "measureInWindow">): Promise<{ y: number }> {
  return new Promise((resolve) => {
    node.measureInWindow((_x, y) => resolve({ y }));
  });
}

function waitFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(count);
  });
}

async function scrollToSettled(scroll: ScrollView, y: number, read: () => number): Promise<void> {
  scroll.scrollTo({ animated: false, y });
  const start = Date.now();
  while (Math.abs(read() - y) > 1 && Date.now() - start < 280) await waitFrames(1);
  await waitFrames(2);
}
