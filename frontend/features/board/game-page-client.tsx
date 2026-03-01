"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { WindowsDialog } from "@/components/windows-dialog";
import { FormulárioBoard } from "@/features/board/formulario-board";
import { ACTORS, modeToChatProfile, randomBroadcastMessage, type UiChatMessage } from "@/features/chat/actors";
import { DepartmentChat } from "@/features/chat/department-chat";
import { saveArchiveItem } from "@/features/history/storage";
import {
  getAnyRoomSession,
  getOrCreateIdentity,
  getRoomSession,
  removeRoomSessions,
  saveRoomSession,
  updateIdentityDisplayName,
  type RoomRole
} from "@/features/session/storage";
import { useMatchSocket } from "@/hooks/use-match-socket";
import { listMatchMessages, sendChatMessage } from "@/lib/api/chat";
import type { CreateMatchRequest, SessionTicket } from "@/lib/api/contracts";
import { createMatch, fetchMatch, submitMove } from "@/lib/api/matches";
import { ApiClientError } from "@/lib/api/http-client";
import { closeRoom, fetchRoom, joinRoom } from "@/lib/api/rooms";
import type {
  AiDifficulty,
  ActorId,
  ChatMessage,
  MatchMode,
  MatchOutcome,
  MatchParticipant,
  MatchSnapshot,
  PlayerSide
} from "@/types/game";
import { formatElapsed, generateProtocolCode } from "@/features/board/engine";

const CHAT_SEND_COOLDOWN_MS = 2600;
const MAX_PENDING_CHAT_REQUESTS = 2;
const GAME_PROGRESS_STORAGE_KEY = "dfgf:game-progress:v1";
const MODE_SWITCH_APPROVAL_KEY = "dfgf:mode-switch-approval:v1";
const INTERRUPTED_RESULT_LABEL = "PROCESSO ENCERRADO ANTES DO RESULTADO FINAL";

const PRE_ALMOCO_DIFFICULTY = "pre_almoco" as AiDifficulty;
const HARD_DIFFICULTY = "avaliacao_anual" as AiDifficulty;

interface GameConfig {
  mode: MatchMode;
  difficulty: AiDifficulty;
  roomCode: string | null;
  role: RoomRole;
}

function normalizeMode(value: string | null): MatchMode {
  if (value === "pvp_local" || value === "pvp_remote" || value === "vs_ai") return value;
  return "vs_ai";
}

function normalizeDifficulty(value: string | null): AiDifficulty {
  if (value === PRE_ALMOCO_DIFFICULTY) return PRE_ALMOCO_DIFFICULTY;
  if (value === "avaliacao_anual" || value === "avaliação_anual") return value as AiDifficulty;
  return PRE_ALMOCO_DIFFICULTY;
}

function normalizeRole(value: string | null): RoomRole {
  return value === "guest" ? "guest" : "host";
}

function buildGameHref(config: GameConfig): string {
  const query = new URLSearchParams();
  query.set("mode", config.mode);
  if (config.mode === "vs_ai") {
    query.set("difficulty", config.difficulty);
  }
  if (config.roomCode) {
    query.set("room", config.roomCode);
  }
  if (config.mode === "pvp_remote") {
    query.set("role", config.role);
  }
  return `/jogo?${query.toString()}`;
}

function sameConfig(a: GameConfig, b: GameConfig): boolean {
  return a.mode === b.mode && a.difficulty === b.difficulty && a.roomCode === b.roomCode && a.role === b.role;
}

function actorFromValue(value: string): ActorId {
  return Object.prototype.hasOwnProperty.call(ACTORS, value) ? (value as ActorId) : "sistema_dfgf";
}

function formatClockLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function toUiMessage(message: ChatMessage): UiChatMessage {
  const kind =
    message.channel === "chat_reply"
      ? "reply"
      : message.channel === "game_commentary"
        ? "game_commentary"
        : "general";

  return {
    id: message.messageId,
    actorId: actorFromValue(message.actorId),
    actorDisplayName: message.actorDisplayName?.trim() ? message.actorDisplayName : undefined,
    text: message.body,
    createdAt: formatClockLabel(message.createdAt),
    channel: message.channel,
    kind
  };
}

function mergeMessages(current: UiChatMessage[], incoming: UiChatMessage[]): UiChatMessage[] {
  if (incoming.length === 0) return current;
  const known = new Set(current.map((item) => item.id));
  const next = [...current];
  for (const message of incoming) {
    if (known.has(message.id)) continue;
    known.add(message.id);
    next.push(message);
  }
  return next;
}

async function waitForRemoteMatch(roomCode: string, timeoutMs = 30000, intervalMs = 1200): Promise<string | null> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const room = await fetchRoom(roomCode);
    if (room.activeMatchId) {
      return room.activeMatchId;
    }
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, intervalMs);
    });
  }
  return null;
}

function deriveModeLabel(snapshot: MatchSnapshot | null, difficulty: AiDifficulty): string {
  if (!snapshot) return "Processo em inicializacao";
  if (snapshot.mode === "vs_ai") {
    const hard = snapshot.aiDifficulty && snapshot.aiDifficulty !== PRE_ALMOCO_DIFFICULTY;
    const label = hard ? "Geraldo Modo Avaliacao Anual" : "Geraldo Pre-Almoco";
    return `Estagiario vs Sr. Geraldo (${label})`;
  }
  if (snapshot.mode === "pvp_remote") return "Player vs Player Remoto - Sala";
  if (snapshot.mode === "pvp_local") return "Player vs Player Local";
  return difficulty === PRE_ALMOCO_DIFFICULTY
    ? "Estagiario vs Sr. Geraldo (Geraldo Pre-Almoco)"
    : "Estagiario vs Sr. Geraldo (Geraldo Modo Avaliacao Anual)";
}

function resultStatus(snapshot: MatchSnapshot | null): string {
  if (!snapshot) return "Aguardando inicializacao";
  if (snapshot.state === "waiting_room") return "Aguardando entrada do convidado";
  if (snapshot.state === "in_progress") return "Em andamento";
  if (!snapshot.result) return "Processo encerrado";
  if (snapshot.result === "draw") return "Empate administrativo";
  if (snapshot.result === "x") return "Demanda deferida";
  return "Demanda indeferida";
}

function winnerLabel(snapshot: MatchSnapshot | null): string {
  if (!snapshot || snapshot.state !== "finished") return "Partida em andamento";
  if (!snapshot.result || snapshot.result === "draw") return "Empate - Processo arquivado";

  const winner = snapshot.participants.find((participant) => participant.side === snapshot.result);
  if (winner) return `Vencedor: ${winner.displayName}`;
  return snapshot.result === "x" ? "Vencedor: Lado X" : "Vencedor: Lado O";
}

function participantBySide(snapshot: MatchSnapshot | null, side: PlayerSide): MatchParticipant | null {
  if (!snapshot) return null;
  return snapshot.participants.find((participant) => participant.side === side) ?? null;
}

function resolveMovePlayerId(snapshot: MatchSnapshot | null, mode: MatchMode, playerId: string | null): string | null {
  if (!snapshot || snapshot.state !== "in_progress") return null;

  if (mode === "pvp_local") {
    return snapshot.participants.find((participant) => participant.side === snapshot.turn)?.playerId ?? null;
  }

  if (!playerId) return null;
  const player = snapshot.participants.find((participant) => participant.playerId === playerId);
  if (!player || player.side !== snapshot.turn) return null;
  return player.playerId;
}

function boardFromSnapshot(snapshot: MatchSnapshot | null): Array<PlayerSide | null> {
  if (!snapshot) return Array(9).fill(null);
  return snapshot.board.cells.map((cell) => (cell === "x" || cell === "o" ? cell : null));
}

function archiveStatusFromOutcome(outcome: MatchOutcome): "DEFERIDO" | "INDEFERIDO" | "ARQUIVADO" {
  if (outcome === "draw") return "ARQUIVADO";
  if (outcome === "x") return "DEFERIDO";
  return "INDEFERIDO";
}

export function GamePageClient() {
  const router = useRouter();
  const params = useSearchParams();

  const mode = normalizeMode(params.get("mode"));
  const difficulty = normalizeDifficulty(params.get("difficulty"));
  const roomCodeParam = params.get("room")?.toUpperCase() ?? null;
  const remoteRole = normalizeRole(params.get("role"));

  const currentConfig = useMemo<GameConfig>(
    () => ({
      mode,
      difficulty,
      roomCode: roomCodeParam,
      role: remoteRole
    }),
    [difficulty, mode, remoteRole, roomCodeParam]
  );

  const configRef = useRef<GameConfig>(currentConfig);
  const snapshotRef = useRef<MatchSnapshot | null>(null);
  const archiveWrittenRef = useRef<Set<string>>(new Set());
  const inProgressRef = useRef(false);
  const loadSequenceRef = useRef(0);

  const [paperKey, setPaperKey] = useState(1);
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [sessionTicket, setSessionTicket] = useState<SessionTicket | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiChatMessage[]>([]);
  const [broadcast, setBroadcast] = useState<string>(() => randomBroadcastMessage(modeToChatProfile(mode)));
  const [elapsedNow, setElapsedNow] = useState<number>(() => Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [isSubmittingMove, setIsSubmittingMove] = useState(false);
  const [pendingChatRequests, setPendingChatRequests] = useState(0);
  const [showSwitchDialog, setShowSwitchDialog] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<GameConfig | null>(null);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingLeaveHref, setPendingLeaveHref] = useState<string | null>(null);

  useEffect(() => {
    snapshotRef.current = snapshot;
    inProgressRef.current = Boolean(snapshot && snapshot.state === "in_progress" && snapshot.moveCount > 0);
  }, [snapshot]);

  const appendUiMessages = useCallback((incoming: UiChatMessage[]) => {
    setMessages((prev) => mergeMessages(prev, incoming));
  }, []);

  const appendSystemMessage = useCallback(
    (text: string) => {
      appendUiMessages([
        {
          id: `sys-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
          actorId: "sistema_dfgf",
          text,
          createdAt: formatClockLabel(new Date().toISOString()),
          channel: "internal_chat",
          kind: "general"
        }
      ]);
    },
    [appendUiMessages]
  );

  const recordFinishedArchive = useCallback((nextSnapshot: MatchSnapshot) => {
    if (nextSnapshot.state !== "finished" || !nextSnapshot.result) return;
    if (archiveWrittenRef.current.has(nextSnapshot.matchId)) return;

    const finishedAt = nextSnapshot.finishedAt ?? new Date().toISOString();
    const durationSeconds = nextSnapshot.durationSeconds ?? Math.max(1, Math.floor((Date.now() - Date.parse(nextSnapshot.startedAt)) / 1000));
    const resultLabel = winnerLabel(nextSnapshot).toUpperCase();

    saveArchiveItem({
      id: nextSnapshot.matchId,
      protocolCode: nextSnapshot.protocolCode,
      mode: nextSnapshot.mode,
      startedAt: nextSnapshot.startedAt,
      finishedAt,
      durationSeconds,
      status: archiveStatusFromOutcome(nextSnapshot.result),
      resultLabel
    });

    archiveWrittenRef.current.add(nextSnapshot.matchId);
  }, []);

  const saveInterruptedArchive = useCallback(() => {
    const current = snapshotRef.current;
    if (!current || current.state !== "in_progress") return;
    if (archiveWrittenRef.current.has(current.matchId)) return;

    const durationSeconds = Math.max(1, Math.floor((Date.now() - Date.parse(current.startedAt)) / 1000));
    saveArchiveItem({
      id: current.matchId,
      protocolCode: current.protocolCode,
      mode: current.mode,
      startedAt: current.startedAt,
      finishedAt: new Date().toISOString(),
      durationSeconds,
      status: "ARQUIVADO",
      resultLabel: INTERRUPTED_RESULT_LABEL
    });

    archiveWrittenRef.current.add(current.matchId);
  }, []);

  const hydrateMessages = useCallback(async (nextMatchId: string): Promise<UiChatMessage[]> => {
    const response = await listMatchMessages(nextMatchId, { limit: 200 });
    return response.items.map(toUiMessage);
  }, []);

  const initializeMatch = useCallback(
    async (config: GameConfig, options: { forceNew?: boolean } = {}) => {
      const sequence = ++loadSequenceRef.current;
      setIsLoading(true);
      setInitError(null);
      setIsSubmittingMove(false);
      setPendingChatRequests(0);
      setBroadcast(randomBroadcastMessage(modeToChatProfile(config.mode)));

      try {
        let nextSnapshot: MatchSnapshot;
        let nextSession: SessionTicket;
        let nextPlayerId: string;

        if (config.mode === "pvp_remote") {
          if (!config.roomCode) {
            throw new Error("Codigo de sala ausente para modo remoto.");
          }

          const identitySlot = config.role === "guest" ? "room_guest" : "room_host";
          const defaultName = config.role === "guest" ? "Estagiario(a) Convidado" : "Estagiario(a) Host";
          const identity = getOrCreateIdentity(identitySlot, defaultName);
          const resolvedIdentity = updateIdentityDisplayName(identitySlot, identity.displayName);

          let roomSession = getRoomSession(config.roomCode, config.role);
          if (config.role === "guest") {
            const joinResponse = await joinRoom(config.roomCode, {
              playerId: resolvedIdentity.playerId,
              displayName: resolvedIdentity.displayName
            });

            roomSession = {
              roomCode: config.roomCode,
              role: "guest",
              playerId: resolvedIdentity.playerId,
              displayName: resolvedIdentity.displayName,
              session: joinResponse.session,
              updatedAt: new Date().toISOString()
            };
            saveRoomSession(roomSession);
          }

          if (!roomSession && config.role === "host") {
            const fallbackRoomSession = getAnyRoomSession(config.roomCode);
            if (fallbackRoomSession && fallbackRoomSession.playerId === resolvedIdentity.playerId) {
              roomSession = fallbackRoomSession;
            }
          }

          if (!roomSession) {
            throw new Error("Sessao da sala nao encontrada. Abra a tela de Salas de Protocolo para entrar novamente.");
          }

          let activeMatchId: string | null = null;
          if (!options.forceNew || config.role === "guest") {
            const roomResponse = await fetchRoom(config.roomCode);
            activeMatchId = roomResponse.activeMatchId;
          }

          if (!activeMatchId && config.role === "guest") {
            activeMatchId = await waitForRemoteMatch(config.roomCode, 30000, 1200);
          }

          if (activeMatchId) {
            const matchResponse = await fetchMatch(activeMatchId);
            nextSnapshot = matchResponse.match;
            nextSession = roomSession.session;
          } else if (config.role === "host") {
            const createPayload: CreateMatchRequest = {
              mode: "pvp_remote",
              hostPlayerId: roomSession.playerId,
              hostDisplayName: roomSession.displayName,
              roomCode: config.roomCode,
              guestDisplayName: getOrCreateIdentity("room_guest", "Convidado(a)").displayName
            };

            const created = await createMatch(createPayload);
            nextSnapshot = created.match;
            nextSession = config.role === "host" ? created.session : roomSession.session;

            if (config.role === "host") {
              saveRoomSession({
                roomCode: config.roomCode,
                role: "host",
                playerId: roomSession.playerId,
                displayName: roomSession.displayName,
                session: created.session,
                updatedAt: new Date().toISOString()
              });
            }
          } else {
            throw new Error("O host ainda nao abriu o formulario da sala. Aguarde alguns segundos e tente novamente.");
          }

          nextPlayerId = roomSession.playerId;
        } else {
          const identity = updateIdentityDisplayName("default", getOrCreateIdentity("default", "Estagiario(a)").displayName);
          const createPayload: CreateMatchRequest = {
            mode: config.mode,
            hostPlayerId: identity.playerId,
            hostDisplayName: identity.displayName,
            guestDisplayName: config.mode === "pvp_local" ? "Estagiario B" : undefined,
            aiDifficulty: config.mode === "vs_ai" ? config.difficulty : undefined
          };

          const created = await createMatch(createPayload);
          nextSnapshot = created.match;
          nextSession = created.session;
          nextPlayerId = identity.playerId;
        }

        const chatItems = await hydrateMessages(nextSnapshot.matchId);
        if (loadSequenceRef.current !== sequence) return;

        configRef.current = config;
        setMatchId(nextSnapshot.matchId);
        setSnapshot(nextSnapshot);
        setSessionTicket(nextSession);
        setPlayerId(nextPlayerId);
        setMessages(chatItems);
        setPaperKey((prev) => prev + 1);
        setElapsedNow(Date.now());
        setIsLoading(false);
        recordFinishedArchive(nextSnapshot);
      } catch (error) {
        if (loadSequenceRef.current !== sequence) return;

        const message =
          error instanceof ApiClientError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Erro inesperado ao inicializar a partida.";

        setInitError(message);
        setMatchId(null);
        setSnapshot(null);
        setSessionTicket(null);
        setPlayerId(null);
        setMessages([]);
        setIsLoading(false);
      }
    },
    [hydrateMessages, recordFinishedArchive]
  );

  useEffect(() => {
    void initializeMatch(configRef.current);
  }, [initializeMatch]);

  useEffect(() => {
    const previous = configRef.current;
    if (sameConfig(previous, currentConfig)) return;

    const hasActiveMatch = Boolean(
      snapshotRef.current &&
        snapshotRef.current.state === "in_progress" &&
        snapshotRef.current.moveCount > 0
    );
    const hostRemoteRoomActive = previous.mode === "pvp_remote" && previous.role === "host" && Boolean(previous.roomCode);

    if (hasActiveMatch || hostRemoteRoomActive) {
      const nextHref = buildGameHref(currentConfig);
      const approvedHref = window.sessionStorage.getItem(MODE_SWITCH_APPROVAL_KEY);
      if (approvedHref === nextHref) {
        window.sessionStorage.removeItem(MODE_SWITCH_APPROVAL_KEY);
        saveInterruptedArchive();
        void initializeMatch(currentConfig);
        return;
      }

      setPendingConfig(currentConfig);
      setShowSwitchDialog(true);
      router.replace(buildGameHref(previous));
      return;
    }

    void initializeMatch(currentConfig);
  }, [currentConfig, initializeMatch, router, saveInterruptedArchive]);

  useEffect(() => {
    if (!snapshot || snapshot.state === "finished") return;

    const timer = window.setInterval(() => {
      setElapsedNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [snapshot?.matchId, snapshot?.state, snapshot]);

  useEffect(() => {
    const inProgress = Boolean(snapshot && snapshot.state === "in_progress" && snapshot.moveCount > 0);
    const payload = {
      inProgress,
      mode: currentConfig.mode,
      difficulty: currentConfig.difficulty,
      roomCode: currentConfig.roomCode,
      matchId: snapshot?.matchId ?? null,
      protocolCode: snapshot?.protocolCode ?? null,
      startedAt: snapshot?.startedAt ?? null,
      updatedAt: new Date().toISOString()
    };

    window.localStorage.setItem(GAME_PROGRESS_STORAGE_KEY, JSON.stringify(payload));
    return () => {
      window.localStorage.removeItem(GAME_PROGRESS_STORAGE_KEY);
    };
  }, [currentConfig.difficulty, currentConfig.mode, currentConfig.roomCode, snapshot]);

  useEffect(() => {
    return () => {
      if (!inProgressRef.current) return;
      const approvedHref = window.sessionStorage.getItem(MODE_SWITCH_APPROVAL_KEY);
      if (!approvedHref) return;
      saveInterruptedArchive();
      window.sessionStorage.removeItem(MODE_SWITCH_APPROVAL_KEY);
    };
  }, [saveInterruptedArchive]);

  const { status: socketStatus, sendEvent } = useMatchSocket({
    matchId: matchId ?? undefined,
    playerId: playerId ?? undefined,
    sessionId: sessionTicket?.sessionId,
    reconnectToken: sessionTicket?.reconnectToken,
    enabled: Boolean(matchId && playerId && sessionTicket),
    onEvent: (event) => {
      switch (event.type) {
        case "match.snapshot": {
          const nextSnapshot = event.payload.match;
          setSnapshot(nextSnapshot);
          recordFinishedArchive(nextSnapshot);
          break;
        }
        case "match.move.applied": {
          const nextSnapshot = event.payload.match;
          setSnapshot(nextSnapshot);
          recordFinishedArchive(nextSnapshot);
          break;
        }
        case "match.finished": {
          const nextSnapshot = event.payload.match;
          setSnapshot(nextSnapshot);
          recordFinishedArchive(nextSnapshot);
          break;
        }
        case "chat.message.created":
          appendUiMessages([toUiMessage(event.payload.message)]);
          break;
        case "announcement.created":
          setBroadcast(event.payload.announcement.body);
          break;
        case "room.closed": {
          appendSystemMessage(event.payload.message || "A sala foi encerrada pelo host.");
          if (currentConfig.mode === "pvp_remote") {
            if (currentConfig.roomCode) {
              removeRoomSessions(currentConfig.roomCode);
            }
            router.replace("/sala");
          }
          break;
        }
        case "error":
          appendSystemMessage(event.payload.message);
          break;
        default:
          break;
      }
    }
  });

  useEffect(() => {
    if (socketStatus !== "open" || !sessionTicket) return;

    sendEvent({
      type: "match.request_snapshot",
      payload: { sessionId: sessionTicket.sessionId },
      emittedAt: new Date().toISOString()
    });

    const heartbeat = window.setInterval(() => {
      sendEvent({
        type: "presence.ping",
        payload: { sessionId: sessionTicket.sessionId },
        emittedAt: new Date().toISOString()
      });
    }, Math.max(5000, sessionTicket.heartbeatIntervalMs || 15000));

    return () => window.clearInterval(heartbeat);
  }, [sendEvent, sessionTicket, socketStatus]);

  useEffect(() => {
    if (!matchId) return;

    const pollMessages = async () => {
      try {
        const response = await listMatchMessages(matchId, { limit: 200 });
        appendUiMessages(response.items.map(toUiMessage));
      } catch (error) {
        if (
          error instanceof ApiClientError &&
          error.code === "NOT_FOUND" &&
          currentConfig.mode === "pvp_remote"
        ) {
          appendSystemMessage("A sala remota foi encerrada. Retornando para Salas de Protocolo.");
          if (currentConfig.roomCode) {
            removeRoomSessions(currentConfig.roomCode);
          }
          router.replace("/sala");
          return;
        }
        // Keep UI resilient when websocket reconnects or backend temporarily fails.
      }
    };

    const intervalMs = socketStatus === "open" ? 9000 : 3000;
    const intervalId = window.setInterval(() => {
      void pollMessages();
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [appendSystemMessage, appendUiMessages, currentConfig.mode, currentConfig.roomCode, matchId, router, socketStatus]);

  const onCellClick = useCallback(
    (index: number) => {
      if (!snapshot || !matchId || isSubmittingMove) return;
      if (snapshot.state !== "in_progress") return;

      const board = boardFromSnapshot(snapshot);
      if (board[index] !== null) {
        appendSystemMessage("Campo ja preenchido. Selecione outra celula.");
        return;
      }

      const movePlayerId = resolveMovePlayerId(snapshot, currentConfig.mode, playerId);
      if (!movePlayerId) return;

      setIsSubmittingMove(true);
      void submitMove(matchId, { playerId: movePlayerId, cellIndex: index })
        .then((response) => {
          setSnapshot(response.match);
          appendUiMessages(response.generatedMessages.map(toUiMessage));
          if (response.announcement) {
            setBroadcast(response.announcement.body);
          }
          recordFinishedArchive(response.match);
        })
        .catch((error) => {
          if (error instanceof ApiClientError) {
            appendSystemMessage(error.message);
            return;
          }
          appendSystemMessage("Falha ao enviar jogada para o backend.");
        })
        .finally(() => {
          setIsSubmittingMove(false);
        });
    },
    [
      appendSystemMessage,
      appendUiMessages,
      currentConfig.mode,
      isSubmittingMove,
      matchId,
      playerId,
      recordFinishedArchive,
      snapshot
    ]
  );

  const handleChatSend = useCallback(
    (text: string) => {
      if (!matchId || !playerId) {
        appendSystemMessage("Partida nao inicializada. Aguarde o carregamento.");
        return false;
      }

      if (pendingChatRequests >= MAX_PENDING_CHAT_REQUESTS) {
        appendSystemMessage("Fila de mensagens lotada. Aguarde o retorno do departamento.");
        return false;
      }

      setPendingChatRequests((prev) => prev + 1);
      void sendChatMessage(matchId, { playerId, body: text })
        .then((response) => {
          appendUiMessages([toUiMessage(response.message)]);
        })
        .catch((error) => {
          if (error instanceof ApiClientError) {
            const retryAfterMs =
              typeof error.details?.retryAfterMs === "number" ? Number(error.details.retryAfterMs) : null;
            if (error.code === "RATE_LIMITED" && retryAfterMs && retryAfterMs > 0) {
              appendSystemMessage(`Aguarde ${Math.ceil(retryAfterMs / 1000)}s para enviar nova mensagem.`);
              return;
            }
            appendSystemMessage(error.message);
            return;
          }
          appendSystemMessage("Falha ao enviar mensagem para o backend.");
        })
        .finally(() => {
          setPendingChatRequests((prev) => Math.max(0, prev - 1));
        });

      return true;
    },
    [appendSystemMessage, appendUiMessages, matchId, pendingChatRequests, playerId]
  );

  const resetMatch = useCallback(() => {
    if (snapshotRef.current?.state === "in_progress" && snapshotRef.current.moveCount > 0) {
      saveInterruptedArchive();
    }
    void initializeMatch(configRef.current, { forceNew: true });
  }, [initializeMatch, saveInterruptedArchive]);

  const closeHostRoomIfNeeded = useCallback(async (): Promise<boolean> => {
    if (currentConfig.mode !== "pvp_remote" || currentConfig.role !== "host" || !currentConfig.roomCode) {
      return true;
    }

    const roomCode = currentConfig.roomCode;
    const hostSession = getRoomSession(roomCode, "host");
    const hostPlayerId = hostSession?.playerId ?? playerId;
    if (!hostPlayerId) {
      removeRoomSessions(roomCode);
      return true;
    }

    try {
      await closeRoom(roomCode, { hostPlayerId });
      removeRoomSessions(roomCode);
      return true;
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "NOT_FOUND") {
        removeRoomSessions(roomCode);
        return true;
      }

      appendSystemMessage("Nao foi possivel encerrar a sala remota agora. Tente novamente.");
      return false;
    }
  }, [appendSystemMessage, currentConfig.mode, currentConfig.role, currentConfig.roomCode, playerId]);

  const navigateWithGuard = useCallback(
    (href: string) => {
      const isRemoteHost = currentConfig.mode === "pvp_remote" && currentConfig.role === "host" && Boolean(currentConfig.roomCode);
      if (!inProgressRef.current && !isRemoteHost) {
        router.push(href);
        return;
      }
      setPendingLeaveHref(href);
      setShowLeaveDialog(true);
    },
    [currentConfig.mode, currentConfig.role, currentConfig.roomCode, router]
  );

  const board = useMemo(() => boardFromSnapshot(snapshot), [snapshot]);
  const winningLine = useMemo(() => snapshot?.board.winningLine ?? null, [snapshot]);
  const protocolCode = snapshot?.protocolCode ?? roomCodeParam ?? generateProtocolCode();
  const modeLabel = useMemo(() => deriveModeLabel(snapshot, currentConfig.difficulty), [currentConfig.difficulty, snapshot]);
  const statusLabel = useMemo(() => resultStatus(snapshot), [snapshot]);
  const outcome = snapshot?.result ?? null;
  const resultHighlight = useMemo(() => winnerLabel(snapshot), [snapshot]);
  const canRequestNewMatch = currentConfig.mode !== "pvp_remote" || currentConfig.role === "host";
  const isRemoteHost = currentConfig.mode === "pvp_remote" && currentConfig.role === "host" && Boolean(currentConfig.roomCode);
  const leaveDialogMessage = isRemoteHost
    ? "Voce esta saindo como host. A sala de protocolo sera encerrada e deletada para todos os participantes."
    : "Ao sair agora, a partida em andamento sera encerrada e registrada como ARQUIVADO no Arquivo Morto.";
  const leaveDialogConfirmLabel = isRemoteHost ? "Sair e deletar sala" : "Sair e arquivar";
  const switchDialogMessage = isRemoteHost
    ? "Trocar de modo vai encerrar e deletar a sala remota atual, alem de limpar jogo e chat."
    : "Trocar de modo vai limpar o jogo e o chat atuais. O processo parcial sera registrado no Arquivo Morto.";
  const elapsedSeconds = useMemo(() => {
    if (!snapshot) return 0;
    if (typeof snapshot.durationSeconds === "number") return snapshot.durationSeconds;
    const startedAt = Date.parse(snapshot.startedAt);
    if (Number.isNaN(startedAt)) return 0;
    return Math.max(0, Math.floor((elapsedNow - startedAt) / 1000));
  }, [elapsedNow, snapshot]);
  const elapsedLabel = useMemo(() => formatElapsed(elapsedSeconds), [elapsedSeconds]);
  const turnParticipant = useMemo(() => participantBySide(snapshot, snapshot?.turn ?? "x"), [snapshot]);
  const currentTurnLabel = turnParticipant?.displayName ?? "Aguardando";
  const canCurrentPlayerMove = useMemo(
    () => resolveMovePlayerId(snapshot, currentConfig.mode, playerId) !== null,
    [currentConfig.mode, playerId, snapshot]
  );

  return (
    <>
      <div
        className={`panel-grid ${isLoading || isSubmittingMove || pendingChatRequests > 0 ? "cursor-progress" : ""}`}
        aria-busy={isLoading || isSubmittingMove || pendingChatRequests > 0}
      >
        <section className="space-y-3">
          <div className="status-strip">
            Processo {protocolCode} - {statusLabel} - tempo atual: {elapsedLabel}
          </div>

          <div className="turn-spotlight">Jogador da vez: {currentTurnLabel}</div>
          {snapshot?.state === "finished" ? <div className="result-spotlight">{resultHighlight}</div> : null}

          {initError ? <div className="result-spotlight">{initError}</div> : null}

          {snapshot?.state === "finished" ? (
            <div className="post-match-panel">
              <p className="post-match-text">
                Resultado computado no Arquivo Morto. Voce pode iniciar uma nova partida agora.
              </p>
              <div className="flex flex-wrap gap-2">
                {canRequestNewMatch ? (
                  <button type="button" className="action-btn post-match-new-btn" onClick={resetMatch}>
                    Iniciar nova partida
                  </button>
                ) : (
                  <span className="status-strip">Apenas o host pode abrir nova partida nesta sala remota.</span>
                )}
                <Link className="action-btn" href="/arquivo-morto">
                  Ver no Arquivo Morto
                </Link>
              </div>
            </div>
          ) : null}

          <FormulárioBoard
            protocolCode={protocolCode}
            modeLabel={modeLabel}
            statusLabel={statusLabel}
            currentTurnLabel={currentTurnLabel}
            elapsedLabel={elapsedLabel}
            board={board}
            winningLine={winningLine}
            onCellClick={onCellClick}
            disableBoard={isLoading || isSubmittingMove || !canCurrentPlayerMove}
            paperKey={paperKey}
          />

          <div className="broadcast-box">
            <span className="broadcast-segment">CHEFIA</span>
            <span className="broadcast-message">{broadcast}</span>
            <span className="broadcast-segment">SOCKET: {socketStatus.toUpperCase()}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {canRequestNewMatch ? (
              <button type="button" className="action-btn" onClick={resetMatch} disabled={isLoading}>
                Abrir novo formulario
              </button>
            ) : (
              <span className="status-strip">Somente o host pode abrir um novo formulario da sala.</span>
            )}

            <button type="button" className="action-btn" onClick={() => navigateWithGuard("/arquivo-morto")}>
              Consultar arquivo morto
            </button>

            <button type="button" className="action-btn" onClick={() => navigateWithGuard("/sala")}>
              Ir para salas remotas
            </button>

            {currentConfig.mode === "vs_ai" ? (
              <Link
                className="action-btn"
                href={`/jogo?mode=vs_ai&difficulty=${
                  currentConfig.difficulty === PRE_ALMOCO_DIFFICULTY ? HARD_DIFFICULTY : PRE_ALMOCO_DIFFICULTY
                }`}
              >
                Trocar dificuldade
              </Link>
            ) : null}
          </div>
        </section>

        <DepartmentChat
          protocolCode={protocolCode}
          messages={messages}
          onSendMessage={handleChatSend}
          sendCooldownMs={CHAT_SEND_COOLDOWN_MS}
        />
      </div>

      <WindowsDialog
        open={showSwitchDialog}
        title="DFGF - Confirmacao de Troca"
        message={switchDialogMessage}
        confirmLabel="Trocar modo"
        cancelLabel="Permanecer"
        onCancel={() => {
          setShowSwitchDialog(false);
          setPendingConfig(null);
        }}
        onConfirm={async () => {
          if (!pendingConfig) {
            setShowSwitchDialog(false);
            return;
          }
          const canLeave = await closeHostRoomIfNeeded();
          if (!canLeave) {
            setShowSwitchDialog(false);
            return;
          }
          window.sessionStorage.setItem(MODE_SWITCH_APPROVAL_KEY, buildGameHref(pendingConfig));
          setShowSwitchDialog(false);
          setPendingConfig(null);
          router.replace(buildGameHref(pendingConfig));
        }}
      />

      <WindowsDialog
        open={showLeaveDialog}
        title="DFGF - Saida do Processo"
        message={leaveDialogMessage}
        confirmLabel={leaveDialogConfirmLabel}
        cancelLabel="Continuar jogando"
        onCancel={() => {
          setShowLeaveDialog(false);
          setPendingLeaveHref(null);
        }}
        onConfirm={async () => {
          if (!pendingLeaveHref) {
            setShowLeaveDialog(false);
            return;
          }
          const canLeave = await closeHostRoomIfNeeded();
          if (!canLeave) {
            setShowLeaveDialog(false);
            return;
          }
          const href = pendingLeaveHref;
          saveInterruptedArchive();
          setPendingLeaveHref(null);
          setShowLeaveDialog(false);
          router.push(href);
        }}
      />
    </>
  );
}
