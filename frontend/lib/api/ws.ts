import { buildWebSocketUrl } from "@/lib/config";
import { WS_ROUTES } from "@/lib/api/contracts";

export interface MatchSocketUrlParams {
  matchId: string;
  playerId: string;
  sessionId: string;
  reconnectToken?: string;
}

export function createMatchSocketUrl(params: MatchSocketUrlParams): string {
  return buildWebSocketUrl(WS_ROUTES.matchSocket(params.matchId), {
    playerId: params.playerId,
    sessionId: params.sessionId,
    reconnectToken: params.reconnectToken
  });
}
