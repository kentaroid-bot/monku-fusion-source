export const genreIds = [
  "work",
  "learning",
  "life",
  "relationships",
  "society",
  "making",
] as const;
export type Genre = (typeof genreIds)[number];

export function validateGenres(value: unknown): Genre[] {
  if (
    !Array.isArray(value) ||
    value.length > 2 ||
    value.some((item) => !genreIds.includes(item)) ||
    new Set(value).size !== value.length
  )
    throw new Error("ジャンルは候補から最大2つ選んでください。");
  // Canonical order makes publication retries independent of checkbox order.
  return genreIds.filter((genre) => value.includes(genre));
}

export function validateGenreFilter(value: unknown): Genre | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (!genreIds.includes(value as Genre))
    throw new Error("ジャンルの指定が不正です。");
  return value as Genre;
}
