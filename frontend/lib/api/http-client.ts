import { getApiBaseUrl } from "@/lib/config";
import type { ApiErrorEnvelope, ApiErrorPayload } from "@/types/api";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type QueryValue = string | number | boolean | undefined | null;
type QueryParams = Record<string, QueryValue>;

export interface ApiRequestOptions<TBody = unknown> {
  method?: HttpMethod;
  body?: TBody;
  query?: QueryParams;
  headers?: HeadersInit;
  signal?: AbortSignal;
  cache?: RequestCache;
}

export class ApiClientError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly requestId?: string;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiClientError";
    this.statusCode = payload.statusCode;
    this.code = payload.code;
    this.details = payload.details;
    this.requestId = payload.requestId;
  }
}

function buildUrl(path: string, query?: QueryParams): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(normalizedPath, `${getApiBaseUrl()}/`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

function isJsonResponse(contentType: string | null): boolean {
  return Boolean(contentType && contentType.includes("application/json"));
}

async function parseError(response: Response): Promise<ApiErrorPayload> {
  const contentType = response.headers.get("Content-Type");
  const fallbackMessage = `Request failed with status ${response.status}`;

  if (isJsonResponse(contentType)) {
    const payload = (await response.json().catch(() => null)) as ApiErrorEnvelope | null;
    if (payload?.error) {
      return {
        statusCode: response.status,
        code: payload.error.code || "API_ERROR",
        message: payload.error.message || fallbackMessage,
        details: payload.error.details,
        requestId: payload.error.requestId
      };
    }
  }

  const bodyText = await response.text().catch(() => "");
  return {
    statusCode: response.status,
    code: "HTTP_ERROR",
    message: bodyText || fallbackMessage
  };
}

export async function apiRequest<TResponse, TBody = unknown>(
  path: string,
  options: ApiRequestOptions<TBody> = {}
): Promise<TResponse> {
  const method = options.method ?? "GET";
  const headers = new Headers(options.headers);
  const requestInit: RequestInit = {
    method,
    headers,
    signal: options.signal,
    cache: options.cache ?? "no-store"
  };

  if (options.body !== undefined && options.body !== null) {
    headers.set("Content-Type", "application/json");
    requestInit.body = JSON.stringify(options.body);
  }

  const response = await fetch(buildUrl(path, options.query), requestInit);

  if (!response.ok) {
    throw new ApiClientError(await parseError(response));
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  const contentType = response.headers.get("Content-Type");
  if (!isJsonResponse(contentType)) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}
