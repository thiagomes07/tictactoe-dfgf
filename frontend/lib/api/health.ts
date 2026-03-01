import { API_ROUTES, type HealthResponse } from "@/lib/api/contracts";
import { apiRequest } from "@/lib/api/http-client";

export function fetchHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>(API_ROUTES.health, { method: "GET" });
}
