"use client";

export function compareDiffTreePaths(leftPath: string, rightPath: string): number {
  const leftParts = leftPath.split("/").filter(Boolean);
  const rightParts = rightPath.split("/").filter(Boolean);
  const sharedLength = Math.min(leftParts.length, rightParts.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];

    if (leftPart === rightPart) continue;

    return leftPart.localeCompare(rightPart);
  }

  return leftParts.length - rightParts.length;
}

export function sortByDiffTreePath<T extends { path: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) =>
    compareDiffTreePaths(left.path, right.path),
  );
}
