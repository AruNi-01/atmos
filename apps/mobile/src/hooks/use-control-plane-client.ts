import { useMemo } from "react";
import { ControlPlaneClient } from "@/api/control-plane-client";
import { useSessionStore } from "@/stores/session-store";

export function useControlPlaneClient() {
  const controlPlaneUrl = useSessionStore((state) => state.controlPlaneUrl);
  return useMemo(() => new ControlPlaneClient(controlPlaneUrl), [controlPlaneUrl]);
}
