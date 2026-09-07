import { useEffect, useRef, useState } from "react";
import { Power } from "lucide-react";
import { SimulatorToolbar } from "../simulator";

export const ATMOS_SIMULATOR_STOP_MESSAGE = "atmos:simulator-stop";
export const ATMOS_SIMULATOR_DEVICE_MESSAGE = "atmos:simulator-device";

export function requestAtmosSimulatorStop() {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: ATMOS_SIMULATOR_STOP_MESSAGE }, "*");
  }
}

export function requestAtmosSimulatorDevice(udid: string): boolean {
  const id = udid.trim();
  if (!id || window.parent === window) return false;
  window.parent.postMessage(
    { type: ATMOS_SIMULATOR_DEVICE_MESSAGE, udid: id, platform: "ios" },
    "*",
  );
  return true;
}

export function StopPreviewButton() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <SimulatorToolbar.Button
        forceEnabled
        aria-label="Stop preview"
        aria-expanded={open}
        title="Stop"
        onClick={() => setOpen((value) => !value)}
        style={{ color: "#f87171" }}
      >
        <Power size={19} strokeWidth={2} />
      </SimulatorToolbar.Button>
      {open ? (
        <div className="absolute left-1/2 top-[calc(100%+8px)] z-50 w-[220px] -translate-x-1/2 rounded-[10px] border border-white/12 bg-panel p-3 text-left shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
          <p className="m-0 text-[12px] font-medium text-white/90">Stop the simulator preview?</p>
          <p className="mt-1 mb-3 text-[11px] leading-4 text-white/55">
            This ends the helper process and frees the device.
          </p>
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              className="h-[26px] rounded-md border-none bg-transparent px-2 text-[12px] text-white/70 cursor-pointer hover:bg-white/8 hover:text-white"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="h-[26px] rounded-md border-none bg-[#dc2626] px-2 text-[12px] text-white cursor-pointer hover:bg-[#ef4444]"
              onClick={() => {
                requestAtmosSimulatorStop();
                setOpen(false);
              }}
            >
              Stop
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
