"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { WindowsDialog } from "@/components/windows-dialog";
import {
  getOrCreateIdentity,
  saveRoomSession,
  updateIdentityDisplayName
} from "@/features/session/storage";
import { createRoom, fetchRoom, joinRoom, listRooms } from "@/lib/api/rooms";
import { ApiClientError } from "@/lib/api/http-client";
import type { RoomListItem } from "@/types/game";

const LAST_ROOM_KEY = "dfgf:last-room:v1";

function normalizeRoomCode(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (trimmed.startsWith("DFGF-")) return trimmed;
  if (/^\d{4}$/.test(trimmed)) return `DFGF-${trimmed}`;
  return trimmed;
}

function formatRoomStatus(status: RoomListItem["status"]): string {
  if (status === "waiting_guest") return "Aguardando convidado";
  if (status === "ready") return "Pronta para entrar";
  if (status === "playing") return "Em andamento";
  return "Encerrada";
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--/-- --:--";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

export function RoomPageClient() {
  const router = useRouter();
  const [hostName, setHostName] = useState("Estagiário(a) Host");
  const [guestName, setGuestName] = useState("Estagiário(a) Convidado");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);
  const [isRefreshingRooms, setIsRefreshingRooms] = useState(false);
  const [availableRooms, setAvailableRooms] = useState<RoomListItem[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorDialog, setErrorDialog] = useState<{ title: string; message: string } | null>(null);

  const normalizedJoinCode = useMemo(() => normalizeRoomCode(joinCodeInput), [joinCodeInput]);
  const canJoin = /^DFGF-\d{4}$/.test(normalizedJoinCode);

  const selectedRoom = useMemo(
    () => availableRooms.find((room) => room.roomCode === normalizedJoinCode) ?? null,
    [availableRooms, normalizedJoinCode]
  );

  const refreshRooms = async () => {
    setIsRefreshingRooms(true);
    try {
      const response = await listRooms({ available: true, limit: 30 });
      setAvailableRooms(response.items);
    } catch {
      // Keep UI usable when listing fails.
    } finally {
      setIsRefreshingRooms(false);
    }
  };

  useEffect(() => {
    const hostIdentity = getOrCreateIdentity("room_host", "Estagiário(a) Host");
    const guestIdentity = getOrCreateIdentity("room_guest", "Estagiário(a) Convidado");
    setHostName(hostIdentity.displayName);
    setGuestName(guestIdentity.displayName);

    const raw = window.localStorage.getItem(LAST_ROOM_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { roomCode?: string };
        if (parsed.roomCode) {
          setJoinCodeInput(parsed.roomCode);
          setActiveRoomCode(parsed.roomCode);
        }
      } catch {
        // Ignore invalid cache.
      }
    }

    void refreshRooms();
    const interval = window.setInterval(() => {
      void refreshRooms();
    }, 12000);

    return () => window.clearInterval(interval);
  }, []);

  const persistLastRoom = (roomCode: string) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      LAST_ROOM_KEY,
      JSON.stringify({
        roomCode,
        hostName,
        guestName,
        updatedAt: new Date().toISOString()
      })
    );
  };

  const duplicateNameWithHost = (candidateGuestName: string, roomHostName: string | null): boolean => {
    if (!roomHostName) return false;
    const guestNormalized = normalizeName(candidateGuestName);
    const hostNormalized = normalizeName(roomHostName);
    if (!guestNormalized || !hostNormalized) return false;
    return guestNormalized === hostNormalized;
  };

  return (
    <main
      className={`space-y-4 ${isCreatingRoom || isJoiningRoom || isRefreshingRooms ? "cursor-progress" : ""}`}
      aria-busy={isCreatingRoom || isJoiningRoom || isRefreshingRooms}
    >
      <section className="paper-sheet !rotate-[-0.18deg]">
        <header className="paper-header">
          <div className="paper-emblem" aria-hidden="true">
            <svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 20H20M7 20V9L12 5L17 9V20M10 13H14" strokeWidth="1.2" />
            </svg>
          </div>
          <div>
            <p className="paper-headline">Salas Remotas - Emissao de Protocolo</p>
            <p className="paper-meta">Criação e adesão por código oficial DFGF-0000</p>
          </div>
          <div className="protocol-box">
            <div className="window-controls window-controls-inline" aria-hidden="true">
              <span className="window-control">_</span>
              <span className="window-control">[]</span>
              <span className="window-control">x</span>
            </div>
            <div>Status de sala</div>
            <div className="protocol-code">{activeRoomCode ?? "SEM SALA"}</div>
          </div>
        </header>

        <div className="form-lines space-y-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="mode-card space-y-2">
              <h2 className="mode-title">Criar sala</h2>
              <p className="mode-text">Gera um código de protocolo para partida remota entre dois estagiários.</p>

              <label className="block text-xs uppercase" htmlFor="host-name">
                Nome do host
              </label>
              <input
                id="host-name"
                className="win-input"
                value={hostName}
                onChange={(event) => setHostName(event.target.value)}
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="action-btn"
                  data-win-tooltip="Gerar novo protocolo remoto"
                  disabled={isCreatingRoom}
                  onClick={async () => {
                    if (isCreatingRoom) return;
                    setFeedback(null);
                    setIsCreatingRoom(true);

                    try {
                      const hostIdentity = updateIdentityDisplayName("room_host", hostName);
                      const response = await createRoom({
                        hostPlayerId: hostIdentity.playerId,
                        hostDisplayName: hostIdentity.displayName
                      });

                      const roomCode = response.room.roomCode;
                      setActiveRoomCode(roomCode);
                      setJoinCodeInput(roomCode);
                      persistLastRoom(roomCode);
                      saveRoomSession({
                        roomCode,
                        role: "host",
                        playerId: hostIdentity.playerId,
                        displayName: hostIdentity.displayName,
                        session: response.session,
                        updatedAt: new Date().toISOString()
                      });

                      setFeedback(`Sala ${roomCode} criada com sucesso. Compartilhe exatamente este código com o convidado.`);
                      void refreshRooms();
                      router.push(`/jogo?mode=pvp_remote&room=${roomCode}&role=host`);
                    } catch (error) {
                      if (error instanceof ApiClientError) {
                        setFeedback(`Falha ao criar sala: ${error.message}`);
                        setErrorDialog({
                          title: "Falha ao criar sala",
                          message: error.message
                        });
                      } else {
                        setFeedback("Falha ao criar sala: erro inesperado.");
                        setErrorDialog({
                          title: "Falha ao criar sala",
                          message: "Erro inesperado ao criar a sala de protocolo."
                        });
                      }
                    } finally {
                      setIsCreatingRoom(false);
                    }
                  }}
                >
                  {isCreatingRoom ? "Criando..." : "Criar protocolo"}
                </button>
              </div>

              {activeRoomCode ? (
                <div className="status-strip">
                  Convidado deve inserir este código: <strong>{activeRoomCode}</strong>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="action-btn"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(activeRoomCode);
                          setFeedback(`Código ${activeRoomCode} copiado para a área de transferência.`);
                        } catch {
                          setFeedback("Não foi possível copiar automaticamente. Copie manualmente o código exibido.");
                        }
                      }}
                    >
                      Copiar código
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mode-card space-y-2">
              <h2 className="mode-title">Entrar em sala</h2>
              <p className="mode-text">Informe o código recebido (exemplo: DFGF-4872) para sincronizar o processo.</p>

              <label className="block text-xs uppercase" htmlFor="guest-name">
                Nome do convidado
              </label>
              <input
                id="guest-name"
                className="win-input"
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
              />

              <label className="block text-xs uppercase" htmlFor="room-code">
                Código de protocolo
              </label>
              <input
                id="room-code"
                className="win-input"
                placeholder="DFGF-0000"
                value={joinCodeInput}
                onChange={(event) => setJoinCodeInput(event.target.value)}
              />

              {selectedRoom ? (
                <div className="status-strip">
                  Host da sala selecionada: <strong>{selectedRoom.hostDisplayName}</strong>
                </div>
              ) : null}

              <button
                type="button"
                className="action-btn"
                data-win-tooltip="Entrar em sala existente"
                disabled={!canJoin || isJoiningRoom}
                style={{ opacity: canJoin && !isJoiningRoom ? 1 : 0.45 }}
                onClick={async () => {
                  if (!canJoin || isJoiningRoom) return;
                  setFeedback(null);

                  if (duplicateNameWithHost(guestName, selectedRoom?.hostDisplayName ?? null)) {
                    setFeedback("Entrada bloqueada: o host já está usando este nome. Escolha outro nome de convidado.");
                    setErrorDialog({
                      title: "Entrada bloqueada",
                      message: "Não foi possível entrar: o host já está usando esse nome. Escolha outro nome de convidado."
                    });
                    return;
                  }

                  setIsJoiningRoom(true);
                  try {
                    const roomInfo = await fetchRoom(normalizedJoinCode);
                    if (duplicateNameWithHost(guestName, roomInfo.hostDisplayName)) {
                      setFeedback("Entrada bloqueada: o host já está usando este nome. Escolha outro nome de convidado.");
                      setErrorDialog({
                        title: "Entrada bloqueada",
                        message: "Não foi possível entrar: o host já está usando esse nome. Escolha outro nome de convidado."
                      });
                      return;
                    }

                    const guestIdentity = updateIdentityDisplayName("room_guest", guestName);
                    const response = await joinRoom(normalizedJoinCode, {
                      playerId: guestIdentity.playerId,
                      displayName: guestIdentity.displayName
                    });

                    persistLastRoom(normalizedJoinCode);
                    setActiveRoomCode(normalizedJoinCode);
                    saveRoomSession({
                      roomCode: normalizedJoinCode,
                      role: "guest",
                      playerId: guestIdentity.playerId,
                      displayName: guestIdentity.displayName,
                      session: response.session,
                      updatedAt: new Date().toISOString()
                    });

                    void refreshRooms();
                    router.push(`/jogo?mode=pvp_remote&room=${normalizedJoinCode}&role=guest`);
                  } catch (error) {
                    if (error instanceof ApiClientError) {
                      setFeedback(`Falha ao entrar na sala: ${error.message}`);
                      setErrorDialog({
                        title: "Falha ao entrar na sala",
                        message: error.message
                      });
                    } else {
                      setFeedback("Falha ao entrar na sala: erro inesperado.");
                      setErrorDialog({
                        title: "Falha ao entrar na sala",
                        message: "Erro inesperado ao entrar na sala de protocolo."
                      });
                    }
                  } finally {
                    setIsJoiningRoom(false);
                  }
                }}
              >
                {isJoiningRoom ? "Entrando..." : "Entrar com protocolo"}
              </button>
            </div>
          </div>

          <div className="mode-card space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="mode-title">Salas disponíveis</h2>
              <button type="button" className="action-btn" onClick={() => void refreshRooms()} disabled={isRefreshingRooms}>
                {isRefreshingRooms ? "Atualizando..." : "Atualizar lista"}
              </button>
            </div>

            {availableRooms.length === 0 ? (
              <p className="mode-text">Nenhuma sala disponivel no momento.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="archive-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Host</th>
                      <th>Status</th>
                      <th>Última atividade</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableRooms.map((room) => (
                      <tr key={room.roomCode}>
                        <td>{room.roomCode}</td>
                        <td>{room.hostDisplayName}</td>
                        <td>{formatRoomStatus(room.status)}</td>
                        <td>{formatShortDate(room.lastActivityAt)}</td>
                        <td>
                          <button
                            type="button"
                            className="action-btn"
                            onClick={() => {
                              setJoinCodeInput(room.roomCode);
                              setFeedback(`Código ${room.roomCode} selecionado para entrada.`);
                            }}
                          >
                            Usar código
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {feedback ? <div className="status-strip">{feedback}</div> : null}
        </div>

        <footer className="official-footer">
          Regra interna: o nome da sala em modo remoto segue numeração DFGF-0000
        </footer>
      </section>

      <WindowsDialog
        open={Boolean(errorDialog)}
        title={errorDialog?.title ?? "Aviso"}
        message={errorDialog?.message ?? ""}
        confirmLabel="Entendi"
        cancelLabel="Fechar"
        onConfirm={() => setErrorDialog(null)}
        onCancel={() => setErrorDialog(null)}
      />
    </main>
  );
}
