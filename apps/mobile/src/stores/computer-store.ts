import { create } from "zustand";
import type { ComputerRow } from "@/api/types";

type ComputerState = {
  computers: ComputerRow[];
  isRefreshing: boolean;
  setComputers: (computers: ComputerRow[]) => void;
  setRefreshing: (isRefreshing: boolean) => void;
};

export const useComputerStore = create<ComputerState>((set) => ({
  computers: [],
  isRefreshing: false,
  setComputers: (computers) => set({ computers }),
  setRefreshing: (isRefreshing) => set({ isRefreshing }),
}));
