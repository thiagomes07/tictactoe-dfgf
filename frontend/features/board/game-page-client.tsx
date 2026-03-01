"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { chooseAiMove, formatElapsed, generateProtocolCode, resolveBoard } from "@/features/board/engine";
import { FormularioBoard } from "@/features/board/formulario-board";
import {
  ACTORS,
  modeToChatProfile,
  nowLabel,
  randomAmbientChat,
  randomBroadcastMessage,
  randomReplyToUser,
  type UiChatMessage
} from "@/features/chat/actors";
import { DepartmentChat } from "@/features/chat/department-chat";
import { saveArchiveItem } from "@/features/history/storage";
import type { AiDifficulty, MatchMode, MatchOutcome, PlayerSide } from "@/types/game";

const CHAT_SEND_COOLDOWN_MS = 2600;
const MAX_PENDING_REPLIES = 2;
const GAME_PROGRESS_STORAGE_KEY = "dfgf:game-progress:v1";

function normalizeMode(value: string | null): MatchMode {
  if (value === "pvp_local" || value === "pvp_remote" || value === "vs_ai") return value;
  return "vs_ai";
}

function normalizeDifficulty(value: string | null): AiDifficulty {
  if (value === "pre_almoco" || value === "avaliacao_anual") return value;
  return "pre_almoco";
}

function modeToLabel(mode: MatchMode, difficulty: AiDifficulty): string {
  if (mode === "vs_ai") {
    const diff = difficulty === "pre_almoco" ? "Geraldo Pre-Almoco" : "Geraldo Modo Avaliacao Anual";
    return `Estagiario vs Sr. Geraldo (${diff})`;
  }

  if (mode === "pvp_remote") return "Player vs Player Remoto - Sala";
  return "Player vs Player Local";
}

function playerLabelForSide(mode: MatchMode, side: PlayerSide): string {
  if (mode === "vs_ai") return side === "x" ? "Estagiario(a)" : "Sr. Geraldo";
  if (mode === "pvp_remote") return side === "x" ? "Host" : "Convidado Remoto";
  return side === "x" ? "Estagiario A" : "Estagiario B";
}

function winnerLabel(mode: MatchMode, outcome: MatchOutcome): string {
  if (!outcome) return "Partida em andamento";
  if (outcome === "draw") return "Empate - Processo arquivado";

  if (mode === "vs_ai") return outcome === "x" ? "Vencedor: Estagiario(a)" : "Vencedor: Sr. Geraldo";
  if (mode === "pvp_remote") return outcome === "x" ? "Vencedor: Host" : "Vencedor: Convidado Remoto";
  return outcome === "x" ? "Vencedor: Estagiario A" : "Vencedor: Estagiario B";
}

function statusFromOutcome(outcome: MatchOutcome): string {
  if (!outcome) return "Em andamento";
  if (outcome === "draw") return "Empate administrativo";
  if (outcome === "x") return "Demanda deferida";
  return "Demanda indeferida";
}

interface MoveContext {
  source: "player" | "ai" | "alt_player";
  index: number;
  side: PlayerSide;
}

interface GameConfig {
  mode: MatchMode;
  difficulty: AiDifficulty;
  roomCode: string | null;
}

function initialChat(protocolCode: string): UiChatMessage[] {
  return [
    {
      id: `msg-${Date.now()}`,
      actorId: "sistema_dfgf",
      text: `PROCESSO ${protocolCode} ABERTO. AGUARDANDO PREENCHIMENTO DO FORMULARIO 3x3-B.`,
      createdAt: nowLabel()
    }
  ];
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
  return `/jogo?${query.toString()}`;
}

export function GamePageClient() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = normalizeMode(params.get("mode"));
  const difficulty = normalizeDifficulty(params.get("difficulty"));
  const roomCodeParam = params.get("room")?.toUpperCase() ?? null;
  const chatProfile = modeToChatProfile(mode);
  const initialProtocolRef = useRef<string>(roomCodeParam ?? generateProtocolCode());

  const [protocolCode, setProtocolCode] = useState<string>(initialProtocolRef.current);
  const [board, setBoard] = useState<Array<PlayerSide | null>>(() => Array(9).fill(null));
  const [turn, setTurn] = useState<PlayerSide>("x");
  const [outcome, setOutcome] = useState<MatchOutcome>(null);
  const [winningLine, setWinningLine] = useState<number[] | null>(null);
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [paperKey, setPaperKey] = useState(1);
  const [broadcast, setBroadcast] = useState<string>(() => randomBroadcastMessage(chatProfile));
  const [messages, setMessages] = useState<UiChatMessage[]>(() => initialChat(initialProtocolRef.current));
  const [lastInteractionAt, setLastInteractionAt] = useState<number>(() => Date.now());
  const [pendingReplies, setPendingReplies] = useState(0);

  const sequenceRef = useRef(1);
  const configRef = useRef<GameConfig>({ mode, difficulty, roomCode: roomCodeParam });

  const appendMessage = useCallback((actorId: keyof typeof ACTORS, text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}-${sequenceRef.current++}`,
        actorId,
        text,
        createdAt: nowLabel()
      }
    ]);
  }, []);

  const resetState = useCallback((nextProtocol: string) => {
    setProtocolCode(nextProtocol);
    setBoard(Array(9).fill(null));
    setTurn("x");
    setOutcome(null);
    setWinningLine(null);
    setStartedAt(Date.now());
    setFinishedAt(null);
    setElapsedSeconds(0);
    setPaperKey((prev) => prev + 1);
    setBroadcast(randomBroadcastMessage(chatProfile));
    setMessages(initialChat(nextProtocol));
    setLastInteractionAt(Date.now());
    setPendingReplies(0);
  }, [chatProfile]);

  const writeArchive = useCallback(
    (result: MatchOutcome, durationSeconds: number) => {
      const status = result === "draw" ? "ARQUIVADO" : result === "x" ? "DEFERIDO" : "INDEFERIDO";
      const resultLabel = winnerLabel(mode, result).toUpperCase();

      saveArchiveItem({
        id: `${protocolCode}-${startedAt}`,
        protocolCode,
        mode,
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationSeconds,
        status,
        resultLabel
      });
    },
    [mode, protocolCode, startedAt]
  );

  const finishMatch = useCallback(
    (result: MatchOutcome, line: number[] | null) => {
      if (outcome) return;

      const finishTime = Date.now();
      const durationSeconds = Math.max(1, Math.floor((finishTime - startedAt) / 1000));

      setOutcome(result);
      setWinningLine(line);
      setFinishedAt(finishTime);
      setElapsedSeconds(durationSeconds);
      writeArchive(result, durationSeconds);

      if (result === "draw") {
        appendMessage("sistema_dfgf", "PROCESSO ENVIADO A INSTANCIA SUPERIOR. PRAZO: 180 DIAS UTEIS.");
        setBroadcast("Sr. Geraldo: empate tambem e lideranca, em alguns cenarios.");
        return;
      }

      if (mode === "vs_ai") {
        if (result === "x") {
          appendMessage("geraldo", "Bom, eu queria esse resultado. Desenvolvimento de equipe.");
          setBroadcast("Sr. Geraldo: vitoria pedagogica. sem panico, eu aprovei esse desfecho.");
        } else {
          appendMessage("marlene", "IMPRESSIONANTE. 27 ANOS DE EXPERIENCIA FALAM POR SI SO.");
          setBroadcast("Sr. Geraldo: performance entregue conforme meu plano macroestrategico.");
        }
        return;
      }

      appendMessage("sistema_dfgf", `${winnerLabel(mode, result).toUpperCase()}. PROCESSO ENCERRADO.`);
      appendMessage("geraldo", "Analise concluida. Vou registrar esta performance no meu caderno tatico.");
      setBroadcast(`Sr. Geraldo: ${winnerLabel(mode, result)}.`);
    },
    [appendMessage, mode, outcome, startedAt, writeArchive]
  );

  const applyMove = useCallback(
    ({ source, index, side }: MoveContext) => {
      if (outcome || board[index] !== null || side !== turn) {
        if (source !== "ai" && board[index] !== null) {
          appendMessage("patricia", "Oi! O campo ja foi preenchido. RH segue acompanhando.");
        }
        return false;
      }

      const nextBoard = [...board];
      nextBoard[index] = side;

      setBoard(nextBoard);
      setLastInteractionAt(Date.now());

      if (source === "player") {
        appendMessage("tulio", "Boa escolha... dependendo do que o Sr. Geraldo achar, claro.");
      }

      if (source === "alt_player") {
        const crowd = randomAmbientChat("pvp");
        appendMessage(crowd.actorId, crowd.text);
      }

      if (source === "ai") {
        const marleneLine = Math.random() > 0.38
          ? "QUE VISAO ESTRATEGICA, SR. GERALDO!!"
          : "Ousado! Quebrando paradigmas como sempre!!";
        appendMessage("marlene", marleneLine);
      }

      const resolution = resolveBoard(nextBoard);
      if (resolution.winner) {
        finishMatch(resolution.winner, resolution.winningLine);
        return true;
      }

      if (resolution.isDraw) {
        finishMatch("draw", null);
        return true;
      }

      const nextTurn: PlayerSide = side === "x" ? "o" : "x";
      setTurn(nextTurn);

      if (mode === "vs_ai" && nextTurn === "o" && Math.random() > 0.63) {
        appendMessage("geraldo", "To deixando ganhar pra ver como voce se comporta sob pressao.");
      }

      if ((mode === "pvp_local" || mode === "pvp_remote") && Math.random() > 0.52) {
        appendMessage("sistema_dfgf", `TURNO REGISTRADO. PROXIMO RESPONSAVEL: ${playerLabelForSide(mode, nextTurn).toUpperCase()}.`);
      }

      return true;
    },
    [appendMessage, board, finishMatch, mode, outcome, turn]
  );

  const onCellClick = useCallback(
    (index: number) => {
      if (outcome) return;
      if (mode === "vs_ai" && turn === "o") return;

      applyMove({
        source: mode === "vs_ai" ? "player" : "alt_player",
        index,
        side: turn
      });
    },
    [applyMove, mode, outcome, turn]
  );

  useEffect(() => {
    const previous = configRef.current;
    const changed =
      previous.mode !== mode ||
      previous.difficulty !== difficulty ||
      previous.roomCode !== roomCodeParam;

    if (!changed) return;

    const hasActiveMatch = board.some((cell) => cell !== null) && !outcome;
    if (hasActiveMatch) {
      const confirmed = window.confirm(
        "Trocar de modo vai resetar a partida atual e limpar o chat. Deseja continuar?"
      );
      if (!confirmed) {
        router.replace(buildGameHref(previous));
        return;
      }
    }

    resetState(roomCodeParam ?? generateProtocolCode());
    configRef.current = { mode, difficulty, roomCode: roomCodeParam };
  }, [board, difficulty, mode, outcome, resetState, roomCodeParam, router]);

  useEffect(() => {
    if (outcome || mode !== "vs_ai" || turn !== "o") return;

    const delay = 700 + Math.floor(Math.random() * 650);
    const timeoutId = window.setTimeout(() => {
      const aiIndex = chooseAiMove(board, "o", difficulty);
      if (aiIndex >= 0) {
        applyMove({
          source: "ai",
          index: aiIndex,
          side: "o"
        });
      }
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [applyMove, board, difficulty, mode, outcome, turn]);

  useEffect(() => {
    if (finishedAt) return;

    const intervalId = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [finishedAt, startedAt]);

  useEffect(() => {
    if (outcome) return;

    let timeoutId = 0;
    const schedule = () => {
      const delay = 15000 + Math.floor(Math.random() * 45000);
      timeoutId = window.setTimeout(() => {
        const line = randomAmbientChat(chatProfile);
        appendMessage(line.actorId, line.text);
        schedule();
      }, delay);
    };

    schedule();
    return () => window.clearTimeout(timeoutId);
  }, [appendMessage, chatProfile, outcome]);

  useEffect(() => {
    if (outcome) return;

    let timeoutId = 0;
    const schedule = () => {
      const delay = 15000 + Math.floor(Math.random() * 45000);
      timeoutId = window.setTimeout(() => {
        setBroadcast(randomBroadcastMessage(chatProfile));
        schedule();
      }, delay);
    };

    schedule();
    return () => window.clearTimeout(timeoutId);
  }, [chatProfile, outcome]);

  useEffect(() => {
    if (outcome) return;

    const intervalId = window.setInterval(() => {
      const now = Date.now();
      if (now - lastInteractionAt > 30000) {
        appendMessage("patricia", "Oi! Tudo bem? So checando.");
        setLastInteractionAt(now);
      }
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [appendMessage, lastInteractionAt, outcome]);

  useEffect(() => {
    const inProgress = board.some((cell) => cell !== null) && !outcome;
    const payload = {
      inProgress,
      mode,
      difficulty,
      roomCode: roomCodeParam,
      updatedAt: new Date().toISOString()
    };

    window.localStorage.setItem(GAME_PROGRESS_STORAGE_KEY, JSON.stringify(payload));
    return () => {
      window.localStorage.removeItem(GAME_PROGRESS_STORAGE_KEY);
    };
  }, [board, difficulty, mode, outcome, roomCodeParam]);

  const handleChatSend = useCallback(
    (text: string) => {
      if (pendingReplies >= MAX_PENDING_REPLIES) {
        appendMessage("sistema_dfgf", "FILA DE MENSAGENS LOTADA. AGUARDE O RETORNO DO DEPARTAMENTO.");
        return false;
      }

      appendMessage("estagiario", text);
      setLastInteractionAt(Date.now());
      setPendingReplies((prev) => prev + 1);

      const delay = 1800 + Math.floor(Math.random() * 4200);
      window.setTimeout(() => {
        const reply = randomReplyToUser(chatProfile, text);
        appendMessage(reply.actorId, reply.text);
        setPendingReplies((prev) => Math.max(0, prev - 1));
      }, delay);

      return true;
    },
    [appendMessage, chatProfile, pendingReplies]
  );

  const resetMatch = useCallback(() => {
    resetState(roomCodeParam ?? generateProtocolCode());
  }, [resetState, roomCodeParam]);

  const modeLabel = useMemo(() => modeToLabel(mode, difficulty), [difficulty, mode]);
  const currentTurnLabel = useMemo(() => playerLabelForSide(mode, turn), [mode, turn]);
  const elapsedLabel = useMemo(() => formatElapsed(elapsedSeconds), [elapsedSeconds]);
  const statusLabel = useMemo(() => statusFromOutcome(outcome), [outcome]);
  const resultHighlight = useMemo(() => winnerLabel(mode, outcome), [mode, outcome]);

  return (
    <div className="panel-grid">
      <section className="space-y-3">
        <div className="status-strip">
          Processo {protocolCode} - {statusLabel} - tempo atual: {elapsedLabel}
        </div>

        <div className="turn-spotlight">Jogador da vez: {currentTurnLabel}</div>
        {outcome ? <div className="result-spotlight">{resultHighlight}</div> : null}
        {outcome ? (
          <div className="post-match-panel">
            <p className="post-match-text">
              Resultado computado no Arquivo Morto. Voce pode iniciar uma nova partida agora.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="action-btn post-match-new-btn" onClick={resetMatch}>
                Iniciar nova partida
              </button>
              <Link className="action-btn" href="/arquivo-morto">
                Ver no Arquivo Morto
              </Link>
            </div>
          </div>
        ) : null}

        <FormularioBoard
          protocolCode={protocolCode}
          modeLabel={modeLabel}
          statusLabel={statusLabel}
          currentTurnLabel={currentTurnLabel}
          elapsedLabel={elapsedLabel}
          board={board}
          winningLine={winningLine}
          onCellClick={onCellClick}
          disableBoard={Boolean(outcome)}
          paperKey={paperKey}
        />

        <div className="broadcast-box">{broadcast}</div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="action-btn" onClick={resetMatch}>
            Abrir novo formulario
          </button>

          <Link className="action-btn" href="/arquivo-morto">
            Consultar arquivo morto
          </Link>

          <Link className="action-btn" href="/sala">
            Ir para salas remotas
          </Link>

          {mode === "vs_ai" ? (
            <Link
              className="action-btn"
              href={`/jogo?mode=vs_ai&difficulty=${difficulty === "pre_almoco" ? "avaliacao_anual" : "pre_almoco"}`}
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
  );
}
