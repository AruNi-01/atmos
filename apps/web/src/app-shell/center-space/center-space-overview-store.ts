"use client";

import { create } from "zustand";

type CenterSpaceOverviewStore = {
  open: boolean;
  /** True while a preview is zooming into the center. */
  busy: boolean;
  setOpen: (open: boolean) => void;
  setBusy: (busy: boolean) => void;
};

export const useCenterSpaceOverviewStore = create<CenterSpaceOverviewStore>((set) => ({
  open: false,
  busy: false,
  setOpen: (open) => set({ open }),
  setBusy: (busy) => set({ busy }),
}));
