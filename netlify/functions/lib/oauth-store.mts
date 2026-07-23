import { getStore } from "@netlify/blobs";

// Strong consistency: an auth code or client can be created and then read
// again within the same short flow, so eventual consistency risks a
// false "not found" right after writing.
export function clientsStore() {
  return getStore({ name: "oauth-clients", consistency: "strong" });
}

export function codesStore() {
  return getStore({ name: "oauth-codes", consistency: "strong" });
}

export function refreshTokensStore() {
  return getStore({ name: "oauth-refresh-tokens", consistency: "strong" });
}
