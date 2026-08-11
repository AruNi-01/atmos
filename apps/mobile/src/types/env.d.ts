declare global {
  namespace NodeJS {
    interface ProcessEnv {
      EXPO_PUBLIC_ATMOS_HUB_URL?: string;
      EXPO_PUBLIC_ATMOS_MOBILE_DEV_IMPORT_DEVICE?: string;
      EXPO_PUBLIC_ATMOS_MOBILE_DEV_DEVICE_SETTINGS_URL?: string;
      EXPO_PUBLIC_RELAY_URL?: string;
      EXPO_PUBLIC_RELAY_RELAY_URL?: string;
    }
  }
}

export {};
