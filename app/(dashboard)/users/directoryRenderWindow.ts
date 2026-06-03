export type DirectoryGroup<T> = [string, T[]];

export function limitGroupedItems<T>(
  groups: readonly DirectoryGroup<T>[],
  limit: number,
): DirectoryGroup<T>[] {
  if (limit <= 0) return [];

  const limited: DirectoryGroup<T>[] = [];
  let remaining = limit;

  for (const [label, members] of groups) {
    if (remaining <= 0) break;
    const slice = members.slice(0, remaining);
    if (slice.length > 0) {
      limited.push([label, slice]);
      remaining -= slice.length;
    }
  }

  return limited;
}

export function countGroupedItems<T>(groups: readonly DirectoryGroup<T>[]): number {
  return groups.reduce((sum, [, members]) => sum + members.length, 0);
}
