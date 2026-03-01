import {
  API_ROUTES,
  type CloseRoomRequest,
  type CloseRoomResponse,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type GetRoomResponse,
  type JoinRoomRequest,
  type JoinRoomResponse,
  type ListRoomsResponse
} from "@/lib/api/contracts";
import { apiRequest } from "@/lib/api/http-client";

export function createRoom(payload: CreateRoomRequest): Promise<CreateRoomResponse> {
  return apiRequest<CreateRoomResponse, CreateRoomRequest>(API_ROUTES.rooms, {
    method: "POST",
    body: payload
  });
}

export function fetchRoom(roomCode: string): Promise<GetRoomResponse> {
  return apiRequest<GetRoomResponse>(API_ROUTES.roomByCode(roomCode), {
    method: "GET"
  });
}

export function listRooms(params?: { available?: boolean; limit?: number }): Promise<ListRoomsResponse> {
  const query = new URLSearchParams();
  if (typeof params?.available === "boolean") {
    query.set("available", String(params.available));
  }
  if (typeof params?.limit === "number" && params.limit > 0) {
    query.set("limit", String(params.limit));
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";

  return apiRequest<ListRoomsResponse>(`${API_ROUTES.rooms}${suffix}`, {
    method: "GET"
  });
}

export function joinRoom(roomCode: string, payload: JoinRoomRequest): Promise<JoinRoomResponse> {
  return apiRequest<JoinRoomResponse, JoinRoomRequest>(API_ROUTES.roomJoin(roomCode), {
    method: "POST",
    body: payload
  });
}

export function closeRoom(roomCode: string, payload: CloseRoomRequest): Promise<CloseRoomResponse> {
  return apiRequest<CloseRoomResponse, CloseRoomRequest>(API_ROUTES.roomClose(roomCode), {
    method: "POST",
    body: payload
  });
}
