import { wsRequest } from "@/api/ws/request";
import type {
  CenterLayoutDocument,
  CenterLayoutPutResponse,
} from "@atmos/api-types/ws/dto/center-layout";

export type { CenterLayoutDocument, CenterLayoutPutResponse };

export const centerLayoutApi = {
  get: () => wsRequest("center_layout_get"),
  put: (document: CenterLayoutDocument) =>
    wsRequest("center_layout_put", { document }),
};
