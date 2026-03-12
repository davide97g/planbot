import type { Env } from "../types";

// ---------------------------------------------------------------------------
// JWT helpers (Web Crypto API — CF Workers compatible)
// ---------------------------------------------------------------------------

const ALGORITHM = { name: "HMAC", hash: "SHA-256" } as const;
const TOKEN_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours

const encoder = new TextEncoder();

function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    ALGORITHM,
    false,
    ["sign", "verify"],
  );
}

interface JWTPayload {
  userId: string;
  iat: number;
  exp: number;
}

async function signJWT(payload: JWTPayload, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await getSigningKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signingInput),
  );

  const signatureB64 = base64UrlEncode(new Uint8Array(signature));
  return `${signingInput}.${signatureB64}`;
}

async function verifyJWT(
  token: string,
  secret: string,
): Promise<JWTPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await getSigningKey(secret);
  const signature = base64UrlDecode(signatureB64);

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(signingInput),
  );

  if (!valid) return null;

  try {
    const payload: JWTPayload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payloadB64)),
    );

    // Check expiry
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Handle POST /api/auth/login
 * Body: { password: string }
 */
export async function handleLogin(
  request: Request,
  env: Env,
): Promise<Response> {
  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.password || body.password !== env.AUTH_TEAM_PASSWORD) {
    return Response.json({ error: "Invalid password" }, { status: 401 });
  }

  // Generate a deterministic userId from the password so the same password
  // always maps to the same user (simple team auth model).
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(body.password),
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const userId = hashArray
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const now = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    userId,
    iat: now,
    exp: now + TOKEN_EXPIRY_SECONDS,
  };

  const token = await signJWT(payload, env.AUTH_SECRET);

  return Response.json({ token, userId, expiresIn: TOKEN_EXPIRY_SECONDS });
}

/**
 * Verify the Authorization: Bearer <token> header.
 * Returns { userId } on success, null on failure.
 */
export async function verifyAuth(
  request: Request,
  env: Env,
): Promise<{ userId: string } | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const payload = await verifyJWT(token, env.AUTH_SECRET);
  if (!payload) return null;

  return { userId: payload.userId };
}
