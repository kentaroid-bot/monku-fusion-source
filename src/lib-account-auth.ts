type TokenGetter = (options?: { template?: string }) => Promise<string | null>;

// Clerk's Convex integration adds aud=convex to the session token. A named
// template is only needed by the older integration, as in ConvexProviderWithClerk.
// The server still verifies the signature, issuer and audience of every token.
export function getConvexToken(getToken: TokenGetter, audience: unknown) {
  return audience === "convex"
    ? getToken()
    : getToken({ template: "convex" });
}
