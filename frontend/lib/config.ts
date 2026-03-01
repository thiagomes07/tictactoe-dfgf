const DEFAULT_API_BASE_URL = "http://localhost:8080";
const DEFAULT_CLIENT_BACKEND_PORT = "8080";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  const explicitValue = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (explicitValue) return trimTrailingSlash(explicitValue);

  if (typeof window !== "undefined") {
    const port = process.env.NEXT_PUBLIC_BACKEND_PORT ?? DEFAULT_CLIENT_BACKEND_PORT;
    return trimTrailingSlash(`${window.location.protocol}//${window.location.hostname}:${port}`);
  }

  const serverValue = process.env.BACKEND_INTERNAL_URL;
  if (serverValue) return trimTrailingSlash(serverValue);

  return DEFAULT_API_BASE_URL;
}

export function buildWebSocketUrl(path: string, query?: Record<string, string | undefined>): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const httpBase = new URL(getApiBaseUrl());
  httpBase.protocol = httpBase.protocol === "https:" ? "wss:" : "ws:";

  const wsUrl = new URL(normalizedPath, httpBase.toString());
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value) wsUrl.searchParams.set(key, value);
    }
  }

  return wsUrl.toString();
}
