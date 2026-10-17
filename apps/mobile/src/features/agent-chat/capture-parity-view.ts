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
import { motionSnapshotCenterIsBlank } from "./parity-motion-fixtures";

const SHOT_NAME = /^[a-z0-9-]+$/;

function centerAlpha(image: SkImage): number | null {
  const raster = image.makeNonTextureImage() ?? image;
  const pixels = raster.readPixels(
    Math.floor(raster.width() / 2),
    Math.floor(raster.height() / 2),
    {
      alphaType: AlphaType.Premul,
      colorType: ColorType.BGRA_8888,
      height: 1,
      width: 1,
    },
  );
  if (!pixels || pixels.length < 4) return null;
  const alpha = pixels[3];
  return typeof alpha === "number" ? alpha : null;
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
    if (motionSnapshotCenterIsBlank(centerAlpha(image))) {
      console.error(`[parity] motion blank ${name}`);
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
