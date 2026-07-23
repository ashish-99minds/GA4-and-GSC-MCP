import type { Context, Config } from "@netlify/functions";

export default async (req: Request, _context: Context) => {
  const origin = new URL(req.url).origin;
  return new Response(
    JSON.stringify({
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config: Config = {
  path: "/.well-known/oauth-protected-resource",
};
