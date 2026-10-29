/** docs/06 U-2: true when making `parentId` the parent of `childId` would loop (including self-parenting). */
export function wouldCreateCycle(childId: string, parentId: string, parentOf: (id: string) => string | null): boolean {
  const seen = new Set<string>();
  for (let cursor: string | null = parentId; cursor; cursor = parentOf(cursor)) {
    if (cursor === childId) return true;
    if (seen.has(cursor)) return true; // existing corrupt loop: refuse rather than spin
    seen.add(cursor);
  }
  return false;
}
