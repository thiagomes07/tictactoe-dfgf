"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchHealth } from "@/lib/api/health";
import { apiQueryKeys } from "@/lib/api/query-keys";

export function useBackendHealthQuery(refetchIntervalMs = 30000) {
  return useQuery({
    queryKey: apiQueryKeys.health,
    queryFn: fetchHealth,
    refetchInterval: refetchIntervalMs,
    refetchOnWindowFocus: false
  });
}
