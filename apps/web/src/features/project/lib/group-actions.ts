"use client";

import { getComputerQueryScope } from "@/api/query/query-scope";
import { wsGroupApi } from "@/api/ws-api";
import type { Group, GroupMember, GroupMemberType } from "@/shared/types/domain";
import {
  cancelProjectBootstrapQuery,
  patchProjectBootstrapSnapshotAt,
} from "@/features/project/hooks/use-project-bootstrap-query";
import { mapGroupModel } from "@/features/project/lib/project-query-options";
import { waitForConnection } from "@/features/project/store/project-store-connection";

function mapMemberFromApi(member: {
  guid: string;
  member_type: string;
  member_guid: string;
  sort_order: number;
}): GroupMember {
  return {
    id: member.guid,
    memberType: member.member_type === "workspace" ? "workspace" : "project",
    memberId: member.member_guid,
    sortOrder: member.sort_order,
  };
}

export async function createGroup(name: string): Promise<Group> {
  const scope = getComputerQueryScope();
  await waitForConnection();
  const model = await wsGroupApi.create({ name });
  const group = mapGroupModel(model);
  await cancelProjectBootstrapQuery(scope);
  patchProjectBootstrapSnapshotAt(scope, (current) => ({
    ...current,
    groups: [...(current.groups ?? []), group].sort(
      (a, b) => a.sidebarOrder - b.sidebarOrder,
    ),
  }));
  return group;
}

export async function renameGroup(groupId: string, name: string): Promise<void> {
  const scope = getComputerQueryScope();
  await waitForConnection();
  await wsGroupApi.update({ guid: groupId, name });
  await cancelProjectBootstrapQuery(scope);
  patchProjectBootstrapSnapshotAt(scope, (current) => ({
    ...current,
    groups: (current.groups ?? []).map((group) =>
      group.id === groupId ? { ...group, name: name.trim() } : group,
    ),
  }));
}

/** Persist group sidebar order (0-based indices after user reorder). */
export async function reorderGroups(
  orderedGroupIds: string[],
): Promise<void> {
  const scope = getComputerQueryScope();
  await waitForConnection();
  const orders = orderedGroupIds.map((guid, index) => ({ guid, order: index }));
  await wsGroupApi.updateOrder(orders);
  await cancelProjectBootstrapQuery(scope);
  const orderById = new Map(orders.map((item) => [item.guid, item.order]));
  patchProjectBootstrapSnapshotAt(scope, (current) => ({
    ...current,
    groups: (current.groups ?? [])
      .map((group) => ({
        ...group,
        sidebarOrder: orderById.get(group.id) ?? group.sidebarOrder,
      }))
      .sort((a, b) => a.sidebarOrder - b.sidebarOrder),
  }));
}

export async function deleteGroup(groupId: string): Promise<void> {
  const scope = getComputerQueryScope();
  await waitForConnection();
  await wsGroupApi.delete(groupId);
  await cancelProjectBootstrapQuery(scope);
  patchProjectBootstrapSnapshotAt(scope, (current) => ({
    ...current,
    groups: (current.groups ?? []).filter((group) => group.id !== groupId),
  }));
}

export async function setGroupMember(params: {
  groupId: string;
  memberType: GroupMemberType;
  memberId: string;
}): Promise<GroupMember> {
  const scope = getComputerQueryScope();
  await waitForConnection();
  const model = await wsGroupApi.setMember({
    groupGuid: params.groupId,
    memberType: params.memberType,
    memberGuid: params.memberId,
  });
  const member = mapMemberFromApi(model);
  await cancelProjectBootstrapQuery(scope);
  patchProjectBootstrapSnapshotAt(scope, (current) => {
    const groups = (current.groups ?? []).map((group) => ({
      ...group,
      members: group.members.filter(
        (existing) =>
          !(
            existing.memberType === params.memberType &&
            existing.memberId === params.memberId
          ),
      ),
    }));
    return {
      ...current,
      groups: groups.map((group) =>
        group.id === params.groupId
          ? {
              ...group,
              members: [...group.members, member].sort(
                (a, b) => a.sortOrder - b.sortOrder,
              ),
            }
          : group,
      ),
    };
  });
  return member;
}

export async function removeGroupMember(params: {
  memberType: GroupMemberType;
  memberId: string;
}): Promise<void> {
  const scope = getComputerQueryScope();
  await waitForConnection();
  await wsGroupApi.removeMember({
    memberType: params.memberType,
    memberGuid: params.memberId,
  });
  await cancelProjectBootstrapQuery(scope);
  patchProjectBootstrapSnapshotAt(scope, (current) => ({
    ...current,
    groups: (current.groups ?? []).map((group) => ({
      ...group,
      members: group.members.filter(
        (existing) =>
          !(
            existing.memberType === params.memberType &&
            existing.memberId === params.memberId
          ),
      ),
    })),
  }));
}
