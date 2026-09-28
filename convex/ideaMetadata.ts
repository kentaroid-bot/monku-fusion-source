import { v } from "convex/values";
import { genreIds } from "../shared/idea-metadata";
import { generationModes } from "../shared/fusion";

export const genreValidator = v.union(
  ...genreIds.map((genre) => v.literal(genre)),
);
export const modeValidator = v.union(
  ...generationModes.map((mode) => v.literal(mode)),
);
