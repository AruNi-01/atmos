import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { HubMe } from "@atmos/hub-client";

type HubProfileState = {
  profile: HubMe | null;
  setProfile: (profile: HubMe) => void;
  clear: () => void;
};

export const useHubProfileStore = create<HubProfileState>()(
  persist(
    (set) => ({
      profile: null,
      setProfile: (profile) => set({ profile }),
      clear: () => set({ profile: null }),
    }),
    {
      name: "atmos.mobile.hub-profile",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ profile: state.profile }),
    },
  ),
);
