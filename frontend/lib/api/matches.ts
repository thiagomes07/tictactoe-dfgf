import {
  API_ROUTES,
  type CreateMatchRequest,
  type CreateMatchResponse,
  type GetMatchResponse,
  type SubmitMoveRequest,
  type SubmitMoveResponse
} from "@/lib/api/contracts";
import { apiRequest } from "@/lib/api/http-client";

export function createMatch(payload: CreateMatchRequest): Promise<CreateMatchResponse> {
  return apiRequest<CreateMatchResponse, CreateMatchRequest>(API_ROUTES.matches, {
    method: "POST",
    body: payload
  });
}

export function fetchMatch(matchId: string): Promise<GetMatchResponse> {
  return apiRequest<GetMatchResponse>(API_ROUTES.matchById(matchId), { method: "GET" });
}

export function submitMove(matchId: string, payload: SubmitMoveRequest): Promise<SubmitMoveResponse> {
  return apiRequest<SubmitMoveResponse, SubmitMoveRequest>(API_ROUTES.matchMoves(matchId), {
    method: "POST",
    body: payload
  });
}
