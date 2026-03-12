import { getToken } from "./auth";

const API_BASE = import.meta.env.VITE_API_URL || "";

export async function apiFetch(
  path: string,
  options?: RequestInit
): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!headers["Content-Type"] && options?.method !== "GET" && !(options?.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}
