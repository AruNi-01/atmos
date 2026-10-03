import { File, Paths } from "expo-file-system";
import { NativeModules, TurboModuleRegistry } from "react-native";
import { pngBase64FromDataUrl } from "@/features/token-usage/png-data-url";

function hasNativeModule(name: string): boolean {
  const expoModules = (globalThis as { expo?: { modules?: Record<string, object | undefined> } }).expo?.modules;
  if (expoModules?.[name]) return true;
  if (NativeModules[name]) return true;
  try {
    return TurboModuleRegistry.get(name) != null;
  } catch {
    return false;
  }
}

let saveQueue: Promise<void> = Promise.resolve();

/** Write a usage PNG into the photo library. Does not open a text share sheet. */
export function saveUsageCardImage(source: string): Promise<void> {
  const run = saveQueue.then(() => writeUsageCardImage(source), () => writeUsageCardImage(source));
  saveQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function writeUsageCardImage(source: string): Promise<void> {
  if (!hasNativeModule("ExpoMediaLibraryNext")) {
    throw new Error("Saving images is not available in this build.");
  }
  const mediaLibrary = require("expo-media-library") as typeof import("expo-media-library");
  const current = await mediaLibrary.getPermissionsAsync(true, ["photo"]);
  let granted = current.granted;
  if (!granted && current.canAskAgain) {
    granted = (await mediaLibrary.requestPermissionsAsync(true, ["photo"])).granted;
  }
  if (!granted) throw new Error("Allow photo access to save this image.");

  const owned = source.startsWith("data:");
  const file = owned
    ? new File(Paths.cache, `atmos-token-usage-${Date.now()}-${Math.random().toString(16).slice(2)}.png`)
    : new File(source);
  if (owned) {
    file.create();
    file.write(pngBase64FromDataUrl(source), { encoding: "base64" });
  } else if (!file.exists) {
    throw new Error("Could not save this image.");
  }
  try {
    await mediaLibrary.Asset.create(file.uri);
  } finally {
    if (owned && file.exists) file.delete();
  }
}
