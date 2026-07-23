import type { Context, Config } from "@netlify/functions";
import { randomBytes, createHash } from "node:crypto";
import { codesStore, refreshTokensStore } from "./lib/oauth-store.mts";
import { signJWT } from "./lib/jwt.mts";
import { safeCompare } from "./lib/safe-compare.mts";

declare const Netlify: { env: { get(key: string): string | undefined } };

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return json({ error: "invalid_request", error_description: "Only POST is supported" }, 405);
  }

  const secret = Netlify.env.get("MCP_JWT_SECRET");
  if (!secret) {
    return json({ error: "server_error", error_description: "MCP_JWT_SECRET is not set" }, 500);
  }

  const params = await parseBody(req);
  const grantType = params.get("grant_type");

  if (grantType === "authorization_code") {
    return handleAuthorizationCodeGrant(params, secret);
  }
  if (grantType === "refresh_token") {
    return handleRefreshTokenGrant(params, secret);
  }
  return json({ error: "unsupported_grant_type" }, 400);
};

export const config: Config = {
  path: "/token",
};

async function parseBody(req: Request): Promise<URLSearchParams> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    return new URLSearchParams(body as Record<string, string>);
  }
  return new URLSearchParams(await req.text());
}

async function handleAuthorizationCodeGrant(params: URLSearchParams, secret: string) {
  const code = params.get("code");
  const redirectUri = params.get("redirect_uri");
  const clientId = params.get("client_id");
  const codeVerifier = params.get("code_verifier");

  if (!code || !redirectUri || !clientId || !codeVerifier) {
    return json({ error: "invalid_request", error_description: "Missing required parameters" }, 400);
  }

  const store = codesStore();
  const record = await store.get(code, { type: "json" });
  if (!record || record.expires_at < Date.now()) {
    return json({ error: "invalid_grant", error_description: "Authorization code is invalid or expired" }, 400);
  }
  if (record.client_id !== clientId || record.redirect_uri !== redirectUri) {
    return json({ error: "invalid_grant", error_description: "client_id or redirect_uri mismatch" }, 400);
  }

  const computedChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  if (!safeCompare(computedChallenge, record.code_challenge)) {
    return json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
  }

  // Delete immediately so the code can never be exchanged a second time.
  await store.delete(code);

  return issueTokens(clientId, secret);
}

async function handleRefreshTokenGrant(params: URLSearchParams, secret: string) {
  const refreshToken = params.get("refresh_token");
  const clientId = params.get("client_id");
  if (!refreshToken || !clientId) {
    return json({ error: "invalid_request", error_description: "Missing refresh_token or client_id" }, 400);
  }

  const store = refreshTokensStore();
  const record = await store.get(refreshToken, { type: "json" });
  if (!record || record.expires_at < Date.now() || record.client_id !== clientId) {
    return json(
      { error: "invalid_grant", error_description: "Refresh token is invalid, expired, or does not match client" },
      400
    );
  }

  // Rotate the refresh token on every use.
  await store.delete(refreshToken);

  return issueTokens(clientId, secret);
}

async function issueTokens(clientId: string, secret: string) {
  const accessToken = signJWT({ sub: clientId, scope: "mcp" }, secret, ACCESS_TOKEN_TTL_SECONDS);

  const refreshToken = randomBytes(32).toString("base64url");
  await refreshTokensStore().setJSON(refreshToken, {
    client_id: clientId,
    created_at: Date.now(),
    expires_at: Date.now() + REFRESH_TOKEN_TTL_MS,
  });

  return json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: "mcp",
    },
    200
  );
}

function json(payload: any, status: number) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}
