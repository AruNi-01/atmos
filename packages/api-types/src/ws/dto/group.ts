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
