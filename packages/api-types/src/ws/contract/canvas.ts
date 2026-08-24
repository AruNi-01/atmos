import type { WsEmpty } from "../dto/common";
import type {
  AppOpenRequest,
  AppOpenResponse,
  CanvasAgentDispatchResultRequest,
  CanvasAgentDispatchResultResponse,
  CanvasBridgeRegisterRequest,
  CanvasBridgeRegisterResponse,
  CanvasBridgeUnregisterRequest,
  CanvasBridgeUnregisterResponse,
} from "../dto/canvas";

export type CanvasContract = {
  app_open: { input: AppOpenRequest; output: AppOpenResponse };
  canvas_bridge_register: {
    input: CanvasBridgeRegisterRequest;
    output: CanvasBridgeRegisterResponse;
  };
  canvas_bridge_unregister: {
    input: CanvasBridgeUnregisterRequest;
    output: CanvasBridgeUnregisterResponse;
  };
  canvas_agent_dispatch_result: {
    input: CanvasAgentDispatchResultRequest;
    output: CanvasAgentDispatchResultResponse;
  };
  pt_design_bridge_register: {
    input: CanvasBridgeRegisterRequest;
    output: CanvasBridgeRegisterResponse;
  };
  pt_design_bridge_unregister: {
    input: CanvasBridgeUnregisterRequest;
    output: CanvasBridgeUnregisterResponse;
  };
  pt_design_agent_dispatch_result: {
    input: CanvasAgentDispatchResultRequest;
    output: CanvasAgentDispatchResultResponse;
  };
};
