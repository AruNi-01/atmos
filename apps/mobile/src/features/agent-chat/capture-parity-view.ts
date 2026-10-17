import type { RefObject } from "react";
import type { View } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { ImageFormat, makeImageFromView } from "@shopify/react-native-skia";

const SHOT_NAME = /^[a-z0-9-]+$/;

/** Writes one PNG of the preview into Documents/parity-motion. Failures stay in the log. */
export async function writeParityMotionPng(
  ref: RefObject<View | null>,
  name: string,
): Promise<void> {
  if (!SHOT_NAME.test(name) || !ref.current) return;
  try {
    const image = await makeImageFromView(ref);
    const base64 = image?.encodeToBase64(ImageFormat.PNG);
    if (!base64) {
      console.error(`[parity] motion miss ${name}`);
      return;
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
