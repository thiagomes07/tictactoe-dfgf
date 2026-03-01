export const apiQueryKeys = {
  health: ["health"] as const,
  match: (matchId: string) => ["match", matchId] as const,
  matchChatRoot: (matchId: string) => ["match-chat", matchId] as const,
  matchChatPage: (matchId: string, limit: number) => ["match-chat", matchId, limit] as const,
  room: (roomCode: string) => ["room", roomCode] as const
} as const;
