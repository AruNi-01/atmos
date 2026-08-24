import type { WsEmpty } from "../dto/common";
import type {
  PermissionAccessListResponse,
  PermissionAccessSetRequest,
} from "../dto/permission";

export type PermissionContract = {
  permission_access_list: {
    input: WsEmpty;
    output: PermissionAccessListResponse;
  };
  permission_access_set: {
    input: PermissionAccessSetRequest;
    output: PermissionAccessListResponse;
  };
};
