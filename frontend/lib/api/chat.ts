import {
  API_ROUTES,
  type ListMatchMessagesResponse,
  type SendChatMessageRequest,
  type SendChatMessageResponse
} from "@/lib/api/contracts";
import { apiRequest } from "@/lib/api/http-client";

export interface ListChatMessagesParams {
  cursor?: string;
  limit?: number;
}

export function listMatchMessages(
  matchId: string,
  params: ListChatMessagesParams = {}
): Promise<ListMatchMessagesResponse> {
  return apiRequest<ListMatchMessagesResponse>(API_ROUTES.matchChatMessages(matchId), {
    method: "GET",
    query: {
      cursor: params.cursor,
      limit: params.limit
    }
  });
}

export function sendChatMessage(matchId: string, payload: SendChatMessageRequest): Promise<SendChatMessageResponse> {
  return apiRequest<SendChatMessageResponse, SendChatMessageRequest>(API_ROUTES.matchChatMessages(matchId), {
    method: "POST",
    body: payload
  });
}
