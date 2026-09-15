import type {
  SimulatorDevice,
  SimulatorInventory,
} from "@atmos/api-types/ws/dto/simulator";

export const ANDROID_AVD_NAME_RE = /^[A-Za-z0-9._-]+$/;
export const CAMERA_PNG_MAX_BYTES = 32 * 1024 * 1024;

export function isAndroidAvdName(name: string): boolean {
  return ANDROID_AVD_NAME_RE.test(name);
}

export function flattenInventory(inventory: SimulatorInventory | null | undefined): SimulatorDevice[] {
  if (!inventory) return [];
  return [...inventory.ios.devices, ...inventory.android.devices];
}

export function isDeviceBooted(state: string): boolean {
  return state === "Booted";
}

export function devicePower(state: string): "on" | "off" | "busy" {
  if (state === "Booted") return "on";
  if (state === "Shutdown" || state === "Unavailable") return "off";
  return "busy";
}

export function bootStateKey(
  state: string,
): "stateBooted" | "stateShutdown" | "stateBooting" | "stateShuttingDown" | "stateUnavailable" {
  switch (state) {
    case "Booted":
      return "stateBooted";
    case "Shutdown":
      return "stateShutdown";
    case "Booting":
      return "stateBooting";
    case "Shutting Down":
      return "stateShuttingDown";
    default:
      return "stateUnavailable";
  }
}

export function pngFileIsAllowed(file: File): boolean {
  if (file.size > CAMERA_PNG_MAX_BYTES) return false;
  if (file.type === "image/png") return true;
  return file.name.toLowerCase().endsWith(".png");
}

export function readPngBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("failed to read png"));
    };
    reader.readAsDataURL(file);
  });
}
