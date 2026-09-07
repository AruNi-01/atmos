import type { WsEmpty } from "../dto/common";
import type {
  SimulatorClaim,
  SimulatorClaimList,
  SimulatorControlAck,
  SimulatorListRequest,
  SimulatorPressRequest,
  SimulatorProbe,
  SimulatorScreenshotRequest,
  SimulatorScreenshotResult,
  SimulatorStartRequest,
  SimulatorStartResult,
  SimulatorStopResponse,
  SimulatorSwipeRequest,
  SimulatorTapRequest,
  SimulatorTypeRequest,
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
  simulator_list: {
    input: SimulatorListRequest;
    output: SimulatorClaimList;
  };
  simulator_screenshot: {
    input: SimulatorScreenshotRequest;
    output: SimulatorScreenshotResult;
  };
  simulator_tap: {
    input: SimulatorTapRequest;
    output: SimulatorControlAck;
  };
  simulator_swipe: {
    input: SimulatorSwipeRequest;
    output: SimulatorControlAck;
  };
  simulator_type: {
    input: SimulatorTypeRequest;
    output: SimulatorControlAck;
  };
  simulator_press: {
    input: SimulatorPressRequest;
    output: SimulatorControlAck;
  };
};
