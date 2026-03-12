import type { AtlassianTokenData, Env } from "../types";

const KV_PREFIX = "atlassian_token:";

function kvKey(userId: string): string {
  return `${KV_PREFIX}${userId}`;
}

/**
 * Redirects user to Atlassian authorization page.
 * GET /api/auth/atlassian/connect
 */
export async function handleAtlassianConnect(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  const nonce = crypto.randomUUID();
  const state = btoa(JSON.stringify({ userId, nonce }));

  // Store nonce in KV for CSRF verification at callback time (10-minute TTL)
  await env.PLANBOT_CONFIG.put(`atlassian_nonce:${nonce}`, userId, { expirationTtl: 600 });

  const authUrl = new URL("https://auth.atlassian.com/authorize");
  authUrl.searchParams.set("audience", "api.atlassian.com");
  authUrl.searchParams.set("client_id", env.ATLASSIAN_CLIENT_ID);
  authUrl.searchParams.set("scope", "read:jira-work read:confluence-content.all offline_access");
  authUrl.searchParams.set("redirect_uri", env.ATLASSIAN_REDIRECT_URI);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("prompt", "consent");

  return Response.json({ url: authUrl.toString() });
}

/**
 * Handles the OAuth callback from Atlassian.
 * GET /api/auth/atlassian/callback
 */
export async function handleAtlassianCallback(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(`Authorization failed: ${error}`, { status: 400 });
  }

  if (!code || !state) {
    return new Response("Missing code or state parameter", { status: 400 });
  }

  // Decode state to get userId and nonce
  let userId: string;
  let nonce: string;
  try {
    const decoded = JSON.parse(atob(state));
    userId = decoded.userId;
    nonce = decoded.nonce;
    if (!userId) throw new Error("missing userId");
  } catch {
    return new Response("Invalid state parameter", { status: 400 });
  }

  // Verify CSRF nonce before doing anything with the code
  if (!nonce) return new Response("Invalid state parameter", { status: 400 });
  const storedUserId = await env.PLANBOT_CONFIG.get(`atlassian_nonce:${nonce}`);
  if (!storedUserId || storedUserId !== userId) {
    return new Response("Invalid or expired state parameter", { status: 400 });
  }
  // Delete nonce (one-time use)
  await env.PLANBOT_CONFIG.delete(`atlassian_nonce:${nonce}`);

  // Exchange code for tokens
  const tokenRes = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: env.ATLASSIAN_CLIENT_ID,
      client_secret: env.ATLASSIAN_CLIENT_SECRET,
      code,
      redirect_uri: env.ATLASSIAN_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    await tokenRes.text(); // consume body (don't forward to client)
    return new Response("Token exchange failed. Please try connecting again.", { status: 502 });
  }

  const tokenData = await tokenRes.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Get cloudId from accessible resources
  const resourcesRes = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!resourcesRes.ok) {
    return new Response("Failed to fetch accessible resources", { status: 502 });
  }

  const resources = await resourcesRes.json() as { id: string }[];
  if (!resources.length) {
    return new Response("No accessible Atlassian resources found", { status: 400 });
  }

  // Use the first accessible resource as the cloud instance.
  // For teams with multiple Atlassian cloud instances, change this selection logic.
  const cloudId = resources[0].id;
  const expiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in;

  const stored: AtlassianTokenData = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt,
    cloudId,
  };

  await env.PLANBOT_CONFIG.put(kvKey(userId), JSON.stringify(stored));

  // Redirect back to app
  return new Response(
    `<html><head><meta http-equiv="refresh" content="0;url=/"></head><body>Atlassian connected! Redirecting...</body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } },
  );
}

/**
 * Returns a valid access token for the user, auto-refreshing if expired.
 * Throws if the user has not connected their Atlassian account.
 */
export async function getAtlassianAccessToken(
  userId: string,
  env: Env,
): Promise<{ accessToken: string; cloudId: string }> {
  const raw = await env.PLANBOT_CONFIG.get(kvKey(userId));
  if (!raw) {
    throw new Error(
      "Atlassian account not connected. Please visit /api/auth/atlassian/connect",
    );
  }

  const data: AtlassianTokenData = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);

  // Refresh if expires within 60 seconds
  if (data.expiresAt <= now + 60) {
    const refreshRes = await fetch("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: env.ATLASSIAN_CLIENT_ID,
        client_secret: env.ATLASSIAN_CLIENT_SECRET,
        refresh_token: data.refreshToken,
      }),
    });

    if (!refreshRes.ok) {
      throw new Error("Failed to refresh Atlassian token. Please reconnect your account.");
    }

    const refreshed = await refreshRes.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const updated: AtlassianTokenData = {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + refreshed.expires_in,
      cloudId: data.cloudId,
    };

    await env.PLANBOT_CONFIG.put(kvKey(userId), JSON.stringify(updated));
    return { accessToken: updated.accessToken, cloudId: updated.cloudId };
  }

  return { accessToken: data.accessToken, cloudId: data.cloudId };
}

/**
 * Returns whether a user has a stored Atlassian token.
 */
export async function hasAtlassianToken(userId: string, env: Env): Promise<boolean> {
  const raw = await env.PLANBOT_CONFIG.get(kvKey(userId));
  return raw !== null;
}

/**
 * Removes the stored Atlassian token for a user.
 * Called by the DELETE /api/auth/atlassian/token route in router.ts.
 */
export async function disconnectAtlassian(userId: string, env: Env): Promise<void> {
  await env.PLANBOT_CONFIG.delete(kvKey(userId));
}
