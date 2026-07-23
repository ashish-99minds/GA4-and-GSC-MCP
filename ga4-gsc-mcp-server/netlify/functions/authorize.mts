import type { Context, Config } from "@netlify/functions";
import { randomBytes } from "node:crypto";
import { clientsStore, codesStore } from "./lib/oauth-store.mts";
import { safeCompare } from "./lib/safe-compare.mts";

declare const Netlify: { env: { get(key: string): string | undefined } };

const CODE_TTL_MS = 5 * 60 * 1000;

type AuthParams = {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
};

export default async (req: Request, _context: Context) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const params: AuthParams = {
      response_type: url.searchParams.get("response_type") || "",
      client_id: url.searchParams.get("client_id") || "",
      redirect_uri: url.searchParams.get("redirect_uri") || "",
      state: url.searchParams.get("state") || "",
      code_challenge: url.searchParams.get("code_challenge") || "",
      code_challenge_method: url.searchParams.get("code_challenge_method") || "",
      scope: url.searchParams.get("scope") || "",
    };

    const validation = await validateClientAndRedirect(params.client_id, params.redirect_uri);
    if (!validation.ok) {
      return new Response(validation.message, { status: 400 });
    }
    if (params.response_type !== "code" || !params.code_challenge || params.code_challenge_method !== "S256") {
      return new Response(
        "Unsupported request. This server only supports the authorization code flow with S256 PKCE.",
        { status: 400 }
      );
    }

    return html(loginPage(params));
  }

  if (req.method === "POST") {
    const form = await req.formData();
    const params: AuthParams = {
      response_type: "code",
      client_id: String(form.get("client_id") || ""),
      redirect_uri: String(form.get("redirect_uri") || ""),
      state: String(form.get("state") || ""),
      code_challenge: String(form.get("code_challenge") || ""),
      code_challenge_method: String(form.get("code_challenge_method") || ""),
      scope: String(form.get("scope") || ""),
    };
    const password = String(form.get("password") || "");

    const validation = await validateClientAndRedirect(params.client_id, params.redirect_uri);
    if (!validation.ok) {
      return new Response(validation.message, { status: 400 });
    }

    const expectedPassword = Netlify.env.get("MCP_LOGIN_PASSWORD");
    if (!expectedPassword) {
      return new Response("Server misconfigured: MCP_LOGIN_PASSWORD is not set.", { status: 500 });
    }

    if (!password || !safeCompare(password, expectedPassword)) {
      return html(loginPage(params, "Incorrect password, try again."), 401);
    }

    const code = randomBytes(32).toString("base64url");
    await codesStore().setJSON(code, {
      client_id: params.client_id,
      redirect_uri: params.redirect_uri,
      code_challenge: params.code_challenge,
      code_challenge_method: params.code_challenge_method,
      scope: params.scope,
      created_at: Date.now(),
      expires_at: Date.now() + CODE_TTL_MS,
    });

    const redirect = new URL(params.redirect_uri);
    redirect.searchParams.set("code", code);
    if (params.state) redirect.searchParams.set("state", params.state);

    return new Response(null, { status: 302, headers: { Location: redirect.toString() } });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/authorize",
};

async function validateClientAndRedirect(clientId: string, redirectUri: string) {
  if (!clientId || !redirectUri) {
    return { ok: false, message: "Missing client_id or redirect_uri." };
  }
  const record = await clientsStore().get(clientId, { type: "json" });
  if (!record) {
    return { ok: false, message: "Unknown client_id. The client needs to register first." };
  }
  if (!record.redirect_uris?.includes(redirectUri)) {
    return { ok: false, message: "redirect_uri does not match what this client registered." };
  }
  return { ok: true, message: "" };
}

function htmlEscape(s: string) {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[c];
  });
}

function loginPage(params: AuthParams, error?: string) {
  const hiddenFields = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${htmlEscape(k)}" value="${htmlEscape(v)}">`)
    .join("\n    ");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#f5f5f7; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
  .card { background:#fff; padding: 32px; border-radius: 12px; box-shadow: 0 2px 16px rgba(0,0,0,0.08); width: 320px; }
  h1 { font-size: 18px; margin: 0 0 4px; color: #1a1a1a; }
  p.sub { color:#666; font-size: 13px; margin: 0 0 20px; }
  input[type=password] { width:100%; padding:10px 12px; border:1px solid #d0d0d5; border-radius:8px; font-size:14px; box-sizing:border-box; }
  button { width:100%; margin-top:14px; padding:10px 12px; border:none; border-radius:8px; background:#6c47ff; color:#fff; font-size:14px; cursor:pointer; }
  button:hover { background:#5a3ad6; }
  .error { color:#c0392b; font-size:13px; margin-top:10px; }
</style>
</head>
<body>
  <form class="card" method="POST">
    <h1>GA4 + Search Console MCP</h1>
    <p class="sub">Sign in to let Claude connect</p>
    ${hiddenFields}
    <input type="password" name="password" placeholder="Password" autofocus required>
    ${error ? `<div class="error">${htmlEscape(error)}</div>` : ""}
    <button type="submit">Sign in</button>
  </form>
</body>
</html>`;
}

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
