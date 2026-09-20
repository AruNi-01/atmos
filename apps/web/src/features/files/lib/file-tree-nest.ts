export type NestedTreeNode<T> = {
  item: T;
  children: NestedTreeNode<T>[];
};

export function nestTreeItemsByParent<T>(
  items: T[],
  getId: (item: T) => string,
  getParentId: (item: T) => string | null | undefined,
  rootParentId = "root",
): NestedTreeNode<T>[] {
  const nodes = new Map<string, NestedTreeNode<T>>();
  const roots: NestedTreeNode<T>[] = [];

  for (const item of items) {
    nodes.set(getId(item), { item, children: [] });
  }

  for (const item of items) {
    const node = nodes.get(getId(item));
    if (!node) continue;
    const parentId = getParentId(item);
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (!parentId || parentId === rootParentId || !parent) {
      roots.push(node);
    } else {
      parent.children.push(node);
    }
  }

  return roots;
}
