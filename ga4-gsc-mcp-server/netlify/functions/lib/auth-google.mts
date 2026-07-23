import { GoogleAuth } from "google-auth-library";

declare const Netlify: { env: { get(key: string): string | undefined } };

function getCredentials() {
  const raw = Netlify.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
  if (!raw) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_KEY environment variable. Set it in Netlify project settings."
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    // Allow a base64-encoded value too, in case the raw JSON causes issues
    // in whatever UI is used to paste the env var.
    return JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
  }
}

// One GoogleAuth client per Google API scope, reused across warm invocations.
const clientCache = new Map<string, ReturnType<GoogleAuth["getClient"]>>();

export async function getAccessToken(scopes: string[]): Promise<string> {
  const key = scopes.slice().sort().join(",");
  if (!clientCache.has(key)) {
    const credentials = getCredentials();
    const auth = new GoogleAuth({ credentials, scopes });
    clientCache.set(key, auth.getClient());
  }
  const client = await clientCache.get(key)!;
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse.token) {
    throw new Error("Failed to obtain a Google access token from the service account.");
  }
  return tokenResponse.token;
}

export const SCOPES = {
  analyticsReadonly: "https://www.googleapis.com/auth/analytics.readonly",
  analyticsEdit: "https://www.googleapis.com/auth/analytics.edit",
  webmasters: "https://www.googleapis.com/auth/webmasters",
};
