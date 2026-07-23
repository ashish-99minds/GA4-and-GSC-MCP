import { createHmac, timingSafeEqual } from "node:crypto";

function base64url(input: Buffer | string) {
  return Buffer.from(input as any).toString("base64url");
}

export function signJWT(payload: Record<string, any>, secret: string, expiresInSeconds: number): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds };
  const headerPart = base64url(JSON.stringify(header));
  const payloadPart = base64url(JSON.stringify(fullPayload));
  const data = `${headerPart}.${payloadPart}`;
  const signature = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${signature}`;
}

export function verifyJWT(token: string, secret: string): Record<string, any> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");
  const [headerPart, payloadPart, signaturePart] = parts;
  const data = `${headerPart}.${payloadPart}`;
  const expectedSig = createHmac("sha256", secret).update(data).digest("base64url");

  const sigBuf = Buffer.from(signaturePart);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf-8"));
  if (typeof payload.exp === "number" && Math.floor(Date.now() / 1000) > payload.exp) {
    throw new Error("Token expired");
  }
  return payload;
}
