import type { Context, Config } from "@netlify/functions";
import { randomBytes } from "node:crypto";
import { clientsStore } from "./lib/oauth-store.mts";

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return json({ error: "invalid_request", error_description: "Only POST is supported" }, 405);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_client_metadata", error_description: "Body must be JSON" }, 400);
  }

  const redirectUris = body?.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris must be a non-empty array" },
      400
    );
  }
  for (const uri of redirectUris) {
    try {
      new URL(uri);
    } catch {
      return json({ error: "invalid_redirect_uri", error_description: `Not a valid URL: ${uri}` }, 400);
    }
  }

  const clientId = randomBytes(16).toString("hex");
  const createdAt = Date.now();
  const clientName = typeof body?.client_name === "string" ? body.client_name : undefined;

  await clientsStore().setJSON(clientId, {
    client_id: clientId,
    redirect_uris: redirectUris,
    client_name: clientName,
    created_at: createdAt,
  });

  return json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(createdAt / 1000),
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      ...(clientName ? { client_name: clientName } : {}),
    },
    201
  );
};

export const config: Config = {
  path: "/register",
};

function json(payload: any, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
