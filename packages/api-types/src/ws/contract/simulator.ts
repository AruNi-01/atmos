import type { WsEmpty } from "../dto/common";
import type {
  SimulatorClaim,
  SimulatorProbe,
  SimulatorStartRequest,
  SimulatorStartResult,
  SimulatorStopResponse,
  SimulatorWorkspaceRequest,
} from "../dto/simulator";

export type SimulatorContract = {
  simulator_probe: { input: WsEmpty; output: SimulatorProbe };
  simulator_start: {
    input: SimulatorStartRequest;
    output: SimulatorStartResult;
  };
  simulator_stop: {
    input: SimulatorWorkspaceRequest;
    output: SimulatorStopResponse;
  };
  simulator_status: {
    input: SimulatorWorkspaceRequest;
    output: SimulatorClaim | null;
  };
};
