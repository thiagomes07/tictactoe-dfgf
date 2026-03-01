"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { chooseAiMove, formatElapsed, generateProtocolCode, resolveBoard } from "@/features/board/engine";
import { FormulárioBoard } from "@/features/board/formulario-board";
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
import { WindowsDialog } from "@/components/windows-dialog";
import type { AiDifficulty, MatchMode, MatchOutcome, PlayerSide } from "@/types/game";

const CHAT_SEND_COOLDOWN_MS = 2600;
const MAX_PENDING_REPLIES = 2;
const GAME_PROGRESS_STORAGE_KEY = "dfgf:game-progress:v1";
const MODE_SWITCH_APPROVAL_KEY = "dfgf:mode-switch-approval:v1";
const INTERRUPTED_RESULT_LABEL = "PROCESSO ENCERRADO ANTES DO RESULTADO FINAL";

function normalizeMode(value: string | null): MatchMode {
  if (value === "pvp_local" || value === "pvp_remote" || value === "vs_ai") return value;
  return "vs_ai";
}

function normalizeDifficulty(value: string | null): AiDifficulty {
  if (value === "pre_almoco" || value === "avaliação_anual") return value;
  return "pre_almoco";
}

function modeToLabel(mode: MatchMode, difficulty: AiDifficulty): string {
  if (mode === "vs_ai") {
    const diff = difficulty === "pre_almoco" ? "Geraldo Pre-Almoco" : "Geraldo Modo Avaliacao Anual";
    return `Estagiário vs Sr. Geraldo (${diff})`;
  }

  if (mode === "pvp_remote") return "Player vs Player Remoto - Sala";
  return "Player vs Player Local";
}

function playerLabelForSide(mode: MatchMode, side: PlayerSide): string {
  if (mode === "vs_ai") return side === "x" ? "Estagiário(a)" : "Sr. Geraldo";
  if (mode === "pvp_remote") return side === "x" ? "Host" : "Convidado Remoto";
  return side === "x" ? "Estagiário A" : "Estagiário B";
}

function winnerLabel(mode: MatchMode, outcome: MatchOutcome): string {
  if (!outcome) return "Partida em andamento";
  if (outcome === "draw") return "Empate - Processo arquivado";

  if (mode === "vs_ai") return outcome === "x" ? "Vencedor: Estagiário(a)" : "Vencedor: Sr. Geraldo";
  if (mode === "pvp_remote") return outcome === "x" ? "Vencedor: Host" : "Vencedor: Convidado Remoto";
  return outcome === "x" ? "Vencedor: Estagiário A" : "Vencedor: Estagiário B";
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
      text: `PROCESSO ${protocolCode} ABERTO. AGUARDANDO PREENCHIMENTO DO FORMULÁRIO 3x3-B.`,
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
  const [showSwitchDialog, setShowSwitchDialog] = useState(false);
  const [pendingConfig, setPendingConfig] = useState<GameConfig | null>(null);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingLeaveHref, setPendingLeaveHref] = useState<string | null>(null);

  const sequenceRef = useRef(1);
  const configRef = useRef<GameConfig>({ mode, difficulty, roomCode: roomCodeParam });
  const inProgressRef = useRef(false);
  const interruptedArchiveSavedRef = useRef(false);

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
    interruptedArchiveSavedRef.current = false;
  }, [chatProfile]);

  const saveInterruptedArchive = useCallback(() => {
    const hasStarted = board.some((cell) => cell !== null);
    if (!hasStarted || outcome || interruptedArchiveSavedRef.current) return;

    const durationSeconds = Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
    saveArchiveItem({
      id: `${protocolCode}-${startedAt}`,
      protocolCode,
      mode,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      durationSeconds,
      status: "ARQUIVADO",
      resultLabel: INTERRUPTED_RESULT_LABEL
    });
    interruptedArchiveSavedRef.current = true;
  }, [board, mode, outcome, protocolCode, startedAt]);

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
        appendMessage("sistema_dfgf", `TURNO REGISTRADO. PROXIMO RESPONSÁVEL: ${playerLabelForSide(mode, nextTurn).toUpperCase()}.`);
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
    const nextConfig: GameConfig = { mode, difficulty, roomCode: roomCodeParam };

      const hasActiveMatch = board.some((cell) => cell !== null) && !outcome;
    if (hasActiveMatch) {
      const nextHref = buildGameHref(nextConfig);
      const approvedHref = window.sessionStorage.getItem(MODE_SWITCH_APPROVAL_KEY);
      if (approvedHref === nextHref) {
        window.sessionStorage.removeItem(MODE_SWITCH_APPROVAL_KEY);
        saveInterruptedArchive();
        resetState(roomCodeParam ?? generateProtocolCode());
        configRef.current = nextConfig;
        return;
      }

      setPendingConfig(nextConfig);
      setShowSwitchDialog(true);
      router.replace(buildGameHref(previous));
      return;
    }

    resetState(roomCodeParam ?? generateProtocolCode());
    configRef.current = nextConfig;
  }, [board, difficulty, mode, outcome, resetState, roomCodeParam, router, saveInterruptedArchive]);

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
    inProgressRef.current = inProgress;
    const payload = {
      inProgress,
      mode,
      difficulty,
      roomCode: roomCodeParam,
      protocolCode,
      startedAt,
      updatedAt: new Date().toISOString()
    };

    window.localStorage.setItem(GAME_PROGRESS_STORAGE_KEY, JSON.stringify(payload));
    return () => {
      window.localStorage.removeItem(GAME_PROGRESS_STORAGE_KEY);
    };
  }, [board, difficulty, mode, outcome, protocolCode, roomCodeParam, startedAt]);

  useEffect(() => {
    return () => {
      if (!inProgressRef.current) return;
      const approvedHref = window.sessionStorage.getItem(MODE_SWITCH_APPROVAL_KEY);
      if (!approvedHref) return;
      saveInterruptedArchive();
      window.sessionStorage.removeItem(MODE_SWITCH_APPROVAL_KEY);
    };
  }, [saveInterruptedArchive]);

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

  const navigateWithGuard = useCallback(
    (href: string) => {
      const inProgress = board.some((cell) => cell !== null) && !outcome;
      if (!inProgress) {
        router.push(href);
        return;
      }
      setPendingLeaveHref(href);
      setShowLeaveDialog(true);
    },
    [board, outcome, router]
  );

  const modeLabel = useMemo(() => modeToLabel(mode, difficulty), [difficulty, mode]);
  const currentTurnLabel = useMemo(() => playerLabelForSide(mode, turn), [mode, turn]);
  const elapsedLabel = useMemo(() => formatElapsed(elapsedSeconds), [elapsedSeconds]);
  const statusLabel = useMemo(() => statusFromOutcome(outcome), [outcome]);
  const resultHighlight = useMemo(() => winnerLabel(mode, outcome), [mode, outcome]);

  return (
    <>
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

        <FormulárioBoard
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

        <div className="broadcast-box">
          <span className="broadcast-segment">CHEFIA</span>
          <span className="broadcast-message">{broadcast}</span>
          <span className="broadcast-segment">PROTOCOLO: {protocolCode}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="action-btn" onClick={resetMatch}>
            Abrir novo formulario
          </button>

          <button type="button" className="action-btn" onClick={() => navigateWithGuard("/arquivo-morto")}>
            Consultar arquivo morto
          </button>

          <button type="button" className="action-btn" onClick={() => navigateWithGuard("/sala")}>
            Ir para salas remotas
          </button>

          {mode === "vs_ai" ? (
            <Link
              className="action-btn"
              href={`/jogo?mode=vs_ai&difficulty=${difficulty === "pre_almoco" ? "avaliação_anual" : "pre_almoco"}`}
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
        message="Trocar de modo vai limpar o jogo e o chat atuais. O processo parcial sera registrado no Arquivo Morto."
        confirmLabel="Trocar modo"
        cancelLabel="Permanecer"
        onCancel={() => {
          setShowSwitchDialog(false);
          setPendingConfig(null);
        }}
        onConfirm={() => {
          if (!pendingConfig) {
            setShowSwitchDialog(false);
            return;
          }
          saveInterruptedArchive();
          configRef.current = pendingConfig;
          resetState(pendingConfig.roomCode ?? generateProtocolCode());
          router.replace(buildGameHref(pendingConfig));
          setPendingConfig(null);
          setShowSwitchDialog(false);
        }}
      />

      <WindowsDialog
        open={showLeaveDialog}
        title="DFGF - Saida do Processo"
        message="Ao sair agora, a partida em andamento sera encerrada e registrada como ARQUIVADO no Arquivo Morto."
        confirmLabel="Sair e arquivar"
        cancelLabel="Continuar jogando"
        onCancel={() => {
          setShowLeaveDialog(false);
          setPendingLeaveHref(null);
        }}
        onConfirm={() => {
          if (!pendingLeaveHref) {
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
