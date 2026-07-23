import type { Context, Config } from "@netlify/functions";

export default async (req: Request, _context: Context) => {
  const origin = new URL(req.url).origin;
  return new Response(
    JSON.stringify({
      issuer: origin,
      authorization_endpoint: `${origin}/authorize`,
      token_endpoint: `${origin}/token`,
      registration_endpoint: `${origin}/register`,
      scopes_supported: ["mcp"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config: Config = {
  path: "/.well-known/oauth-authorization-server",
};
