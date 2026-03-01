"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CreateMatchRequest, SubmitMoveRequest } from "@/lib/api/contracts";
import { createMatch, fetchMatch, submitMove } from "@/lib/api/matches";
import { apiQueryKeys } from "@/lib/api/query-keys";

export function useCreateMatchMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateMatchRequest) => createMatch(payload),
    onSuccess: (response) => {
      queryClient.setQueryData(apiQueryKeys.match(response.match.matchId), response.match);
      if (response.room) {
        queryClient.setQueryData(apiQueryKeys.room(response.room.roomCode), response.room);
      }
    }
  });
}

export function useMatchQuery(matchId?: string) {
  return useQuery({
    queryKey: apiQueryKeys.match(matchId ?? "unknown"),
    enabled: Boolean(matchId),
    queryFn: async () => {
      if (!matchId) throw new Error("matchId is required");
      const response = await fetchMatch(matchId);
      return response.match;
    },
    refetchOnWindowFocus: false
  });
}

export function useSubmitMoveMutation(matchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SubmitMoveRequest) => submitMove(matchId, payload),
    onSuccess: (response) => {
      queryClient.setQueryData(apiQueryKeys.match(matchId), response.match);
      queryClient.invalidateQueries({ queryKey: apiQueryKeys.matchChatRoot(matchId) });
    }
  });
}
