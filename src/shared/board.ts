/**
 * Fractional positioning for kanban cards. Cards within a column are ordered by
 * a float `position`; inserting between two cards uses their midpoint, so a move
 * only ever rewrites the moved card's position.
 */

export function appendPosition(positions: number[]): number {
  return (positions.length ? Math.max(...positions) : 0) + 1;
}

/**
 * Position for inserting at slot `index` (0..length) within an ordered list of
 * the *other* cards' positions in the target column.
 */
export function insertPosition(orderedPositions: number[], index: number): number {
  const prev = index > 0 ? orderedPositions[index - 1] : undefined;
  const next = index < orderedPositions.length ? orderedPositions[index] : undefined;
  if (prev === undefined && next === undefined) return 1;
  if (prev === undefined) return next! - 1;
  if (next === undefined) return prev + 1;
  return (prev + next) / 2;
}
