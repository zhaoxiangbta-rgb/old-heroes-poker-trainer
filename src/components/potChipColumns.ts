export function potChipColumns(pot: number) {
  if (pot < 10) return [1, 2, 1];
  if (pot < 40) return [2, 3, 3, 2];
  if (pot < 100) return [3, 4, 5, 4, 3];
  return [4, 5, 6, 6, 5, 4];
}
