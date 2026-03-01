"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { SendChatMessageRequest } from "@/lib/api/contracts";
import { listMatchMessages, sendChatMessage } from "@/lib/api/chat";
import { apiQueryKeys } from "@/lib/api/query-keys";

const DEFAULT_PAGE_SIZE = 50;

export function useMatchMessagesQuery(matchId?: string, limit = DEFAULT_PAGE_SIZE) {
  return useQuery({
    queryKey: apiQueryKeys.matchChatPage(matchId ?? "unknown", limit),
    enabled: Boolean(matchId),
    queryFn: async () => {
      if (!matchId) throw new Error("matchId is required");
      return listMatchMessages(matchId, { limit });
    },
    refetchOnWindowFocus: false
  });
}

export function useSendChatMessageMutation(matchId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SendChatMessageRequest) => sendChatMessage(matchId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiQueryKeys.matchChatRoot(matchId) });
    }
  });
}
