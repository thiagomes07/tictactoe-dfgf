import {
  API_ROUTES,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type GetRoomResponse,
  type JoinRoomRequest,
  type JoinRoomResponse
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

export function joinRoom(roomCode: string, payload: JoinRoomRequest): Promise<JoinRoomResponse> {
  return apiRequest<JoinRoomResponse, JoinRoomRequest>(API_ROUTES.roomJoin(roomCode), {
    method: "POST",
    body: payload
  });
}
