"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatElapsed, generateProtocolCode, resolveBoard, chooseAiMove, classifyAiMove } from "@/features/board/engine";
import { FormularioBoard } from "@/features/board/formulario-board";
import {
  ACTORS,
  nowLabel,
  randomAmbientChat,
  randomBroadcastMessage,
  randomReplyToUser,
  type UiChatMessage
} from "@/features/chat/actors";
import { DepartmentChat } from "@/features/chat/department-chat";
import { saveArchiveItem } from "@/features/history/storage";
import type { AiDifficulty, MatchMode, MatchOutcome, PlayerSide } from "@/types/game";

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

function turnToLabel(mode: MatchMode, turn: PlayerSide): string {
  if (mode === "vs_ai") return turn === "x" ? "Estagiario(a)" : "Sr. Geraldo";
  if (mode === "pvp_remote") return turn === "x" ? "Host" : "Convidado Remoto";
  return turn === "x" ? "Estagiario A" : "Estagiario B";
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

export function GamePageClient() {
  const params = useSearchParams();
  const mode = normalizeMode(params.get("mode"));
  const difficulty = normalizeDifficulty(params.get("difficulty"));
  const roomCodeParam = params.get("room")?.toUpperCase() ?? null;
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
  const [broadcast, setBroadcast] = useState<string>(() => randomBroadcastMessage());
  const [messages, setMessages] = useState<UiChatMessage[]>(() => initialChat(initialProtocolRef.current));
  const [lastInteractionAt, setLastInteractionAt] = useState<number>(() => Date.now());

  const sequenceRef = useRef(1);

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

  const writeArchive = useCallback(
    (result: MatchOutcome, durationSeconds: number) => {
      const status = result === "draw" ? "ARQUIVADO" : result === "x" ? "DEFERIDO" : "INDEFERIDO";
      const resultLabel =
        result === "draw"
          ? "PROCESSO ENCAMINHADO PARA INSTANCIA SUPERIOR"
          : result === "x"
            ? "ESTAGIARIO FECHOU O PROCESSO"
            : "GERALDO MANTEVE O PROCESSO SOB CONTROLE";

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

      if (result === "x") {
        appendMessage("geraldo", "Bom, eu queria esse resultado. Desenvolvimento de equipe.");
        setBroadcast("Sr. Geraldo: vitoria pedagogica. sem panico, eu aprovei esse desfecho.");
        return;
      }

      if (result === "o") {
        appendMessage("marlene", "IMPRESSIONANTE. 27 ANOS DE EXPERIENCIA FALAM POR SI SO.");
        setBroadcast("Sr. Geraldo: performance entregue conforme meu plano macroestrategico.");
        return;
      }

      appendMessage("sistema_dfgf", "PROCESSO ENVIADO A INSTANCIA SUPERIOR. PRAZO: 180 DIAS UTEIS.");
      setBroadcast("Sr. Geraldo: empate tambem e lideranca, em alguns cenarios.");
    },
    [appendMessage, outcome, startedAt, writeArchive]
  );

  const applyMove = useCallback(
    ({ source, index, side }: MoveContext) => {
      if (outcome || board[index] !== null || side !== turn) {
        if (source === "player" && board[index] !== null) {
          appendMessage("patricia", "Oi! O campo ja foi preenchido. RH segue acompanhando.");
        }
        return false;
      }

      const boardBefore = [...board];
      const nextBoard = [...board];
      nextBoard[index] = side;

      setBoard(nextBoard);
      setLastInteractionAt(Date.now());

      if (source === "player") {
        appendMessage("tulio", "Boa escolha... dependendo do que o Sr. Geraldo achar, claro.");
      }

      if (source === "ai") {
        const quality = classifyAiMove(boardBefore, index, side);
        appendMessage(
          "marlene",
          quality === "good"
            ? "QUE VISAO ESTRATEGICA, SR. GERALDO!!"
            : "Ousado! Quebrando paradigmas como sempre!!"
        );
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

      return true;
    },
    [appendMessage, board, finishMatch, mode, outcome, turn]
  );

  const onCellClick = useCallback(
    (index: number) => {
      if (outcome) return;
      if (mode === "vs_ai" && turn === "o") return;

      applyMove({
        source: mode === "pvp_local" || mode === "pvp_remote" ? "alt_player" : "player",
        index,
        side: turn
      });
    },
    [applyMove, mode, outcome, turn]
  );

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
        const line = randomAmbientChat();
        appendMessage(line.actorId, line.text);
        schedule();
      }, delay);
    };

    schedule();
    return () => window.clearTimeout(timeoutId);
  }, [appendMessage, outcome]);

  useEffect(() => {
    if (outcome) return;

    let timeoutId = 0;
    const schedule = () => {
      const delay = 15000 + Math.floor(Math.random() * 45000);
      timeoutId = window.setTimeout(() => {
        setBroadcast(randomBroadcastMessage());
        schedule();
      }, delay);
    };

    schedule();
    return () => window.clearTimeout(timeoutId);
  }, [outcome]);

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

  const handleChatSend = useCallback(
    (text: string) => {
      appendMessage("estagiario", text);
      setLastInteractionAt(Date.now());

      const delay = 900 + Math.floor(Math.random() * 1400);
      window.setTimeout(() => {
        const reply = randomReplyToUser(text);
        appendMessage(reply.actorId, reply.text);
      }, delay);
    },
    [appendMessage]
  );

  const resetMatch = useCallback(() => {
    const nextProtocol = roomCodeParam ?? generateProtocolCode();
    setProtocolCode(nextProtocol);
    setBoard(Array(9).fill(null));
    setTurn("x");
    setOutcome(null);
    setWinningLine(null);
    setStartedAt(Date.now());
    setFinishedAt(null);
    setElapsedSeconds(0);
    setPaperKey((prev) => prev + 1);
    setBroadcast(randomBroadcastMessage());
    setMessages(initialChat(nextProtocol));
    setLastInteractionAt(Date.now());
  }, [roomCodeParam]);

  const modeLabel = useMemo(() => modeToLabel(mode, difficulty), [difficulty, mode]);
  const currentTurnLabel = useMemo(() => turnToLabel(mode, turn), [mode, turn]);
  const elapsedLabel = useMemo(() => formatElapsed(elapsedSeconds), [elapsedSeconds]);
  const statusLabel = useMemo(() => statusFromOutcome(outcome), [outcome]);

  return (
    <div className="panel-grid">
      <section className="space-y-3">
        <div className="status-strip">
          Processo {protocolCode} - {statusLabel} - tempo atual: {elapsedLabel}
        </div>

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

      <DepartmentChat protocolCode={protocolCode} messages={messages} onSendMessage={handleChatSend} />
    </div>
  );
}
