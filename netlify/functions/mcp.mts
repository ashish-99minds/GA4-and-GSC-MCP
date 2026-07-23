import type { Context, Config } from "@netlify/functions";
import { listTools, callTool } from "./lib/tools.mts";
import { verifyJWT } from "./lib/jwt.mts";

declare const Netlify: { env: { get(key: string): string | undefined } };

const PROTOCOL_VERSION = "2025-06-18";

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const secret = Netlify.env.get("MCP_JWT_SECRET");

  if (!secret) {
    return new Response("Server misconfigured: MCP_JWT_SECRET is not set.", { status: 500 });
  }

  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return unauthorized(url.origin);
  }
  try {
    verifyJWT(match[1], secret);
  } catch {
    return unauthorized(url.origin);
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed. This endpoint only accepts POST.", { status: 405 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(jsonRpcError(null, -32700, "Parse error: request body was not valid JSON"));
  }

  const messages = Array.isArray(body) ? body : [body];
  const responses: any[] = [];

  for (const msg of messages) {
    const response = await handleMessage(msg);
    if (response) responses.push(response);
  }

  if (responses.length === 0) {
    // Pure notification(s), no response body expected per JSON-RPC spec.
    return new Response(null, { status: 202 });
  }

  return json(Array.isArray(body) ? responses : responses[0]);
};

export const config: Config = {
  path: "/mcp",
};

async function handleMessage(msg: any) {
  const isNotification = !("id" in msg);
  const { id, method, params } = msg;

  try {
    if (method === "initialize") {
      return jsonRpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "ga4-gsc-mcp-server", version: "1.0.0" },
      });
    }

    if (method === "notifications/initialized" || method?.startsWith("notifications/")) {
      return null;
    }

    if (method === "tools/list") {
      return jsonRpcResult(id, { tools: listTools() });
    }

    if (method === "tools/call") {
      const { name, arguments: args } = params || {};
      try {
        const result = await callTool(name, args || {});
        return jsonRpcResult(id, {
          content: [
            {
              type: "text",
              text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
            },
          ],
        });
      } catch (toolErr: any) {
        // Tool-level errors go back as a successful JSON-RPC response with
        // isError set, so the model sees the failure and can react to it.
        return jsonRpcResult(id, {
          isError: true,
          content: [{ type: "text", text: toolErr?.message || "Tool execution failed" }],
        });
      }
    }

    if (isNotification) return null;
    return jsonRpcError(id, -32601, `Method not found: ${method}`);
  } catch (err: any) {
    if (isNotification) return null;
    return jsonRpcError(id, -32000, err?.message || "Internal error");
  }
}

function jsonRpcResult(id: any, result: any) {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id: any, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function json(payload: any) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function unauthorized(origin: string) {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer realm="mcp", resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
    },
  });
}
