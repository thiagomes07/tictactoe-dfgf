"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { CreateRoomRequest, JoinRoomRequest } from "@/lib/api/contracts";
import { apiQueryKeys } from "@/lib/api/query-keys";
import { createRoom, fetchRoom, joinRoom } from "@/lib/api/rooms";

export function useCreateRoomMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateRoomRequest) => createRoom(payload),
    onSuccess: (response) => {
      queryClient.setQueryData(apiQueryKeys.room(response.room.roomCode), response.room);
    }
  });
}

export function useRoomQuery(roomCode?: string) {
  return useQuery({
    queryKey: apiQueryKeys.room(roomCode ?? "unknown"),
    enabled: Boolean(roomCode),
    queryFn: async () => {
      if (!roomCode) throw new Error("roomCode is required");
      const response = await fetchRoom(roomCode);
      return response;
    },
    refetchOnWindowFocus: false
  });
}

export function useJoinRoomMutation(roomCode: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: JoinRoomRequest) => joinRoom(roomCode, payload),
    onSuccess: (response) => {
      queryClient.setQueryData(apiQueryKeys.room(roomCode), response.room);
    }
  });
}
