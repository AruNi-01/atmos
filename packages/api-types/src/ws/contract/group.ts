import type { WsEmpty, WsSuccess } from "../dto/common";
import type {
  GroupCreateRequest,
  GroupDeleteRequest,
  GroupMemberModel,
  GroupModel,
  GroupRemoveMemberRequest,
  GroupSetMemberRequest,
  GroupUpdateMemberOrderRequest,
  GroupUpdateOrderRequest,
  GroupUpdateRequest,
} from "../dto/group";

export type GroupContract = {
  group_list: { input: WsEmpty; output: GroupModel[] };
  group_create: { input: GroupCreateRequest; output: GroupModel };
  group_update: { input: GroupUpdateRequest; output: WsSuccess };
  group_update_order: { input: GroupUpdateOrderRequest; output: WsSuccess };
  group_delete: { input: GroupDeleteRequest; output: WsSuccess };
  group_set_member: { input: GroupSetMemberRequest; output: GroupMemberModel };
  group_remove_member: { input: GroupRemoveMemberRequest; output: WsSuccess };
  group_update_member_order: {
    input: GroupUpdateMemberOrderRequest;
    output: WsSuccess;
  };
};
