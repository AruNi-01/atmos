import type { WsEmpty } from "../dto/common";
import type {
  SimulatorAppearanceGetRequest,
  SimulatorAppearanceResult,
  SimulatorAppearanceSetRequest,
  SimulatorCameraAck,
  SimulatorCameraClearRequest,
  SimulatorCameraInjectRequest,
  SimulatorClaim,
  SimulatorClaimList,
  SimulatorControlAck,
  SimulatorCreateRequest,
  SimulatorDeleteResponse,
  SimulatorDeviceOpRequest,
  SimulatorDeviceResult,
  SimulatorInventory,
  SimulatorInventoryRequest,
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
  simulator_inventory: {
    input: SimulatorInventoryRequest;
    output: SimulatorInventory;
  };
  simulator_create: {
    input: SimulatorCreateRequest;
    output: SimulatorDeviceResult;
  };
  simulator_boot: {
    input: SimulatorDeviceOpRequest;
    output: SimulatorDeviceResult;
  };
  simulator_shutdown: {
    input: SimulatorDeviceOpRequest;
    output: SimulatorDeviceResult;
  };
  simulator_delete: {
    input: SimulatorDeviceOpRequest;
    output: SimulatorDeleteResponse;
  };
  simulator_appearance_get: {
    input: SimulatorAppearanceGetRequest;
    output: SimulatorAppearanceResult;
  };
  simulator_appearance_set: {
    input: SimulatorAppearanceSetRequest;
    output: SimulatorAppearanceResult;
  };
  simulator_camera_inject: {
    input: SimulatorCameraInjectRequest;
    output: SimulatorCameraAck;
  };
  simulator_camera_clear: {
    input: SimulatorCameraClearRequest;
    output: SimulatorCameraAck;
  };
};
