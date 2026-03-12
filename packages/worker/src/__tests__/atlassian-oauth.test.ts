import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleAtlassianConnect, disconnectAtlassian } from "../api/atlassian-oauth";

const mockKV = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

const mockEnv = {
  PLANBOT_CONFIG: mockKV,
  ATLASSIAN_CLIENT_ID: "test-client-id",
  ATLASSIAN_CLIENT_SECRET: "test-client-secret",
  ATLASSIAN_REDIRECT_URI: "https://example.com/api/auth/atlassian/callback",
} as any;

beforeEach(() => {
  vi.restoreAllMocks();
  mockKV.put.mockResolvedValue(undefined);
  mockKV.delete.mockResolvedValue(undefined);
});

describe("handleAtlassianConnect", () => {
  it("returns JSON with an Atlassian authorize URL", async () => {
    const request = new Request("https://example.com/api/auth/atlassian/connect");
    const response = await handleAtlassianConnect(request, mockEnv, "user-123");

    expect(response.status).toBe(200);
    const body = await response.json() as { url: string };
    expect(body.url).toContain("https://auth.atlassian.com/authorize");
    expect(body.url).toContain("client_id=test-client-id");
    expect(body.url).toContain("response_type=code");
    expect(body.url).toContain("offline_access");
  });

  it("stores the CSRF nonce in KV before returning", async () => {
    const request = new Request("https://example.com/api/auth/atlassian/connect");
    await handleAtlassianConnect(request, mockEnv, "user-123");

    expect(mockKV.put).toHaveBeenCalledOnce();
    const [key, value, opts] = mockKV.put.mock.calls[0];
    expect(key).toMatch(/^atlassian_nonce:/);
    expect(value).toBe("user-123");
    expect(opts).toEqual({ expirationTtl: 600 });
  });

  it("encodes the userId in the state param", async () => {
    const request = new Request("https://example.com/api/auth/atlassian/connect");
    const response = await handleAtlassianConnect(request, mockEnv, "user-abc");

    const body = await response.json() as { url: string };
    const url = new URL(body.url);
    const state = JSON.parse(atob(url.searchParams.get("state")!));
    expect(state.userId).toBe("user-abc");
    expect(state.nonce).toBeTruthy();
  });
});

describe("disconnectAtlassian", () => {
  it("deletes the token KV entry for the user", async () => {
    await disconnectAtlassian("user-123", mockEnv);

    expect(mockKV.delete).toHaveBeenCalledOnce();
    expect(mockKV.delete).toHaveBeenCalledWith("atlassian_token:user-123");
  });
});
