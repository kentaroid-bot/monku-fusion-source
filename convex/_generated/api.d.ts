/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountRetirement from "../accountRetirement.js";
import type * as ai from "../ai.js";
import type * as categoryBackfill from "../categoryBackfill.js";
import type * as fusions from "../fusions.js";
import type * as http from "../http.js";
import type * as ideaMetadata from "../ideaMetadata.js";
import type * as incense from "../incense.js";
import type * as safety from "../safety.js";
import type * as security from "../security.js";
import type * as stripe from "../stripe.js";
import type * as transformations from "../transformations.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountRetirement: typeof accountRetirement;
  ai: typeof ai;
  categoryBackfill: typeof categoryBackfill;
  fusions: typeof fusions;
  http: typeof http;
  ideaMetadata: typeof ideaMetadata;
  incense: typeof incense;
  safety: typeof safety;
  security: typeof security;
  stripe: typeof stripe;
  transformations: typeof transformations;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
