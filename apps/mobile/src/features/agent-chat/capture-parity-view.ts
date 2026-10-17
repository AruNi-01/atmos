import type { RefObject } from "react";
import type { View } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import {
  AlphaType,
  ColorType,
  ImageFormat,
  makeImageFromView,
  type SkImage,
} from "@shopify/react-native-skia";
import {
  motionSnapshotCenterIsBlank,
  motionSnapshotIsFlat,
  type MotionSnapshotPixel,
} from "./parity-motion-fixtures";

const SHOT_NAME = /^[a-z0-9-]+$/;

function readPixel(image: SkImage, x: number, y: number): MotionSnapshotPixel | null {
  const pixels = image.readPixels(x, y, {
    alphaType: AlphaType.Premul,
    colorType: ColorType.BGRA_8888,
    height: 1,
    width: 1,
  });
  if (!pixels || pixels.length < 4) return null;
  const [b, g, r, a] = [pixels[0], pixels[1], pixels[2], pixels[3]];
  if (
    typeof b !== "number" ||
    typeof g !== "number" ||
    typeof r !== "number" ||
    typeof a !== "number"
  ) {
    return null;
  }
  return { a, b, g, r };
}

function snapshotSamples(image: SkImage): MotionSnapshotPixel[] {
  const raster = image.makeNonTextureImage() ?? image;
  const width = raster.width();
  const height = raster.height();
  const points = [
    [Math.floor(width / 2), Math.floor(height / 2)],
    [Math.floor(width / 5), Math.floor(height / 5)],
    [Math.floor((width * 4) / 5), Math.floor((height * 4) / 5)],
  ];
  const samples: MotionSnapshotPixel[] = [];
  for (const [x, y] of points) {
    const pixel = readPixel(raster, x ?? 0, y ?? 0);
    if (pixel) samples.push(pixel);
  }
  return samples;
}

/** Writes one PNG of the preview into Documents/parity-motion. Failures stay in the log. */
export async function writeParityMotionPng(
  ref: RefObject<View | null>,
  name: string,
): Promise<void> {
  if (!SHOT_NAME.test(name) || !ref.current) return;
  try {
    const image = await makeImageFromView(ref);
    const base64 = image?.encodeToBase64(ImageFormat.PNG);
    if (!image || !base64) {
      console.error(`[parity] motion miss ${name}`);
      return;
    }
    const samples = snapshotSamples(image);
    const center = samples[0];
    if (motionSnapshotCenterIsBlank(center?.a ?? null)) {
      console.error(`[parity] motion blank ${name}`);
    } else if (motionSnapshotIsFlat(samples) && center) {
      console.error(`[parity] motion flat ${name} ${center.r},${center.g},${center.b},${center.a}`);
    }
    const dir = new Directory(Paths.document, "parity-motion");
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const file = new File(dir, `${name}.png`);
    if (!file.exists) file.create();
    file.write(base64, { encoding: "base64" });
    console.error(`[parity] motion file ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "capture failed";
    console.error(`[parity] motion miss ${name} ${message}`);
  }
}
