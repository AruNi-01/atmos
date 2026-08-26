import type { WsEmpty } from "../dto/common";
import type {
  CenterLayoutDocument,
  CenterLayoutPutRequest,
  CenterLayoutPutResponse,
} from "../dto/center-layout";

export type CenterLayoutContract = {
  center_layout_get: { input: WsEmpty; output: CenterLayoutDocument };
  center_layout_put: {
    input: CenterLayoutPutRequest;
    output: CenterLayoutPutResponse;
  };
};
