declare global {
  namespace NodeJS {
    interface ProcessEnv {
      EXPO_PUBLIC_ATMOS_MOBILE_DEV_ACCESS_TOKEN_SETTINGS_URL?: string;
      EXPO_PUBLIC_ATMOS_MOBILE_DEV_IMPORT_ACCESS_TOKEN?: string;
      EXPO_PUBLIC_RELAY_URL?: string;
      EXPO_PUBLIC_RELAY_RELAY_URL?: string;
    }
  }
}

export {};
