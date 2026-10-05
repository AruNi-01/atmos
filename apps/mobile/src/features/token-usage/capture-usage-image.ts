import type { RefObject } from "react";
import { Platform, type ScrollView, type View } from "react-native";
import { File, Paths } from "expo-file-system";
import { ImageFormat, Skia, makeImageFromView, type SkImage } from "@shopify/react-native-skia";
import type { SharedValue } from "react-native-reanimated";
import { captureSliceWindow } from "@/features/token-usage/capture-window";

export type UsageShot = {
  aspect: number;
  uri: string;
};

type Measurable = {
  measure: (callback: (x: number, y: number, width: number, height: number) => void) => void;
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};

function asMeasurable(node: object): Measurable {
  return node as Measurable;
}

export async function captureUsageImage(input: {
  contentRef: RefObject<View | null>;
  scrollRef: RefObject<ScrollView | null>;
  setFreeze: (uri: string | null) => void;
  /** Distance from the top of the screen to where content can sit clear of the status bar. */
  safeTop: number;
  /** Visual slide only. Layout, scroll offset, and the navigation bar stay put. */
  shift: SharedValue<number>;
}): Promise<UsageShot> {
  if (Platform.OS === "web") throw new Error("Could not capture this page.");
  const scroll = input.scrollRef.current;
  const content = input.contentRef.current;
  if (!scroll || !content) throw new Error("Could not capture this page.");

  let freezeUri: string | null = null;
  try {
    const current = await captureView(input.scrollRef);
    freezeUri = writePng(current);
    input.setFreeze(freezeUri);
    await waitFrames(2);

    const [contentSize, viewport, placement] = await Promise.all([
      measureLayout(asMeasurable(content)),
      measureLayout(asMeasurable(scroll)),
      measurePlacement(asMeasurable(scroll), asMeasurable(content)),
    ]);
    if (contentSize.height < 1 || viewport.height < 1 || viewport.width < 1) {
      throw new Error("Could not capture this page.");
    }
    // Crop the large-title band, and the soft top fade once that title has collapsed.
    // Content is only translated, so the open share sheet keeps its height.
    const lead = placement.lead;
    const { baseShift, topCrop, windowHeight } = captureSliceWindow(
      lead,
      placement.scrollY,
      input.safeTop,
      viewport.height,
    );
    const maxTravel = Math.max(0, contentSize.height - windowHeight);
    const travels = [0];
    while (travels.length < 12 && (travels[travels.length - 1] ?? 0) < maxTravel - 0.5) {
      travels.push(Math.min((travels[travels.length - 1] ?? 0) + windowHeight, maxTravel));
    }
    const slices: { contentAtTop: number; image: SkImage }[] = [];
    for (const travel of travels) {
      const translateY = baseShift - travel;
      input.shift.set(translateY);
      await waitForShift(asMeasurable(scroll), asMeasurable(content), lead + translateY);
      slices.push({ contentAtTop: travel, image: await captureView(input.scrollRef) });
    }
    const image = stitchSlices(slices, contentSize.height, viewport.height, topCrop, windowHeight);
    return { aspect: image.width() / image.height(), uri: writePng(image) };
  } finally {
    input.shift.set(0);
    await waitFrames(1);
    // The still frame stays up until the sheet closes. Clearing it here lays out
    // the page under the open sheet, and the sheet drops and springs back.
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

async function captureView(ref: RefObject<ScrollView | View | null>): Promise<SkImage> {
  const image = await makeImageFromView(ref as unknown as RefObject<View>);
  if (!image || image.width() < 1 || image.height() < 1) throw new Error("Could not capture this page.");
  return image;
}

function stitchSlices(
  slices: { contentAtTop: number; image: SkImage }[],
  contentHeight: number,
  viewportHeight: number,
  topCrop: number,
  windowHeight: number,
): SkImage {
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
    const crop = Math.round(topCrop * sliceScale);
    const start = Math.round(slice.contentAtTop * sliceScale);
    const overlap = Math.max(0, drawn - start);
    const skip = crop + overlap;
    const end = Math.min(totalHeight, Math.round((slice.contentAtTop + windowHeight) * sliceScale));
    const take = Math.min(end - (start + overlap), slice.image.height() - skip);
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

async function measurePlacement(anchor: Measurable, child: Measurable): Promise<{ lead: number; scrollY: number }> {
  const [anchorWindow, childWindow] = await Promise.all([measureWindow(anchor), measureWindow(child)]);
  return { lead: childWindow.y - anchorWindow.y, scrollY: anchorWindow.y };
}

async function measureLead(anchor: Measurable, child: Measurable): Promise<number> {
  return (await measurePlacement(anchor, child)).lead;
}

async function waitForShift(scroll: Measurable, content: Measurable, expected: number): Promise<void> {
  await waitFrames(2);
  for (let i = 0; i < 8; i++) {
    const delta = await measureLead(scroll, content);
    if (Math.abs(delta - expected) < 3) return;
    await waitFrames(1);
  }
}
