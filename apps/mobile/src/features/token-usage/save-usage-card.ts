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

/** Write the share-card PNG into the photo library. Does not open a text share sheet. */
export async function saveUsageCardImage(dataUrl: string): Promise<void> {
  const base64 = pngBase64FromDataUrl(dataUrl);
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

  const file = new File(Paths.cache, "atmos-token-usage.png");
  if (file.exists) file.delete();
  file.create();
  file.write(base64, { encoding: "base64" });
  await mediaLibrary.Asset.create(file.uri);
}
