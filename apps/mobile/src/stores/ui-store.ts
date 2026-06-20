import { create } from "zustand";

type UiState = {
  disconnectedReason: string | null;
  setDisconnectedReason: (reason: string | null) => void;
};

export const useUiStore = create<UiState>((set) => ({
  disconnectedReason: null,
  setDisconnectedReason: (disconnectedReason) => set({ disconnectedReason }),
}));
