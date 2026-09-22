import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type PreviewState = {
  /** When true, the homepage Test page switch is on and `/preview` is the mock terminal path. */
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

export const usePreviewStore = create<PreviewState>()(
  persist(
    (set) => ({
      enabled: false,
      setEnabled: (enabled) => set({ enabled }),
    }),
    {
      name: "atmos.mobile.preview",
      partialize: (state) => ({ enabled: state.enabled }),
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
