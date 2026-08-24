export type GroupMemberModel = {
  guid: string;
  member_type: "project" | "workspace" | string;
  member_guid: string;
  sort_order: number;
};

export type GroupModel = {
  guid: string;
  name: string;
  sidebar_order: number;
  members: GroupMemberModel[];
};

export type GroupCreateRequest = {
  name: string;
  sidebar_order?: number | null;
};

export type GroupUpdateRequest = {
  guid: string;
  name?: string | null;
};

export type GroupOrderItem = {
  guid: string;
  order: number;
};

export type GroupUpdateOrderRequest = {
  orders: GroupOrderItem[];
};

export type GroupDeleteRequest = {
  guid: string;
};

export type GroupSetMemberRequest = {
  group_guid: string;
  member_type: string;
  member_guid: string;
};

export type GroupRemoveMemberRequest = {
  member_type: string;
  member_guid: string;
};

export type GroupUpdateMemberOrderRequest = {
  group_guid: string;
  member_guids: string[];
};
