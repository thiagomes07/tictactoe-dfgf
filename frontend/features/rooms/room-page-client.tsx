"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { generateProtocolCode } from "@/features/board/engine";

const LAST_ROOM_KEY = "dfgf:last-room:v1";

function normalizeRoomCode(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (trimmed.startsWith("DFGF-")) return trimmed;
  if (/^\d{4}$/.test(trimmed)) return `DFGF-${trimmed}`;
  return trimmed;
}

export function RoomPageClient() {
  const router = useRouter();
  const [hostName, setHostName] = useState("Estagiario(a) Host");
  const [guestName, setGuestName] = useState("Estagiario(a) Convidado");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);

  const normalizedJoinCode = useMemo(() => normalizeRoomCode(joinCodeInput), [joinCodeInput]);
  const canJoin = /^DFGF-\d{4}$/.test(normalizedJoinCode);

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

  return (
    <main className="space-y-4">
      <section className="paper-sheet !rotate-[-0.18deg]">
        <header className="paper-header">
          <div className="paper-emblem" aria-hidden="true">
            <svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 20H20M7 20V9L12 5L17 9V20M10 13H14" strokeWidth="1.2" />
            </svg>
          </div>
          <div>
            <p className="paper-headline">Salas Remotas - Emissao de Protocolo</p>
            <p className="paper-meta">Criacao e adesao por codigo oficial DFGF-0000</p>
          </div>
          <div className="protocol-box">
            <div>Status de sala</div>
            <div className="protocol-code">{activeRoomCode ?? "SEM SALA"}</div>
          </div>
        </header>

        <div className="form-lines space-y-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="mode-card space-y-2">
              <h2 className="mode-title">Criar sala</h2>
              <p className="mode-text">Gera um codigo de protocolo para partida remota entre dois estagiarios.</p>

              <label className="block text-xs uppercase" htmlFor="host-name">
                Nome do host
              </label>
              <input
                id="host-name"
                className="chat-input !bg-[#f7f1e4] !text-inkBlack !border-[#7b7a74]"
                value={hostName}
                onChange={(event) => setHostName(event.target.value)}
              />

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => {
                    const roomCode = generateProtocolCode();
                    setActiveRoomCode(roomCode);
                    setJoinCodeInput(roomCode);
                    persistLastRoom(roomCode);
                  }}
                >
                  Criar protocolo
                </button>

                {activeRoomCode ? (
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => router.push(`/jogo?mode=pvp_remote&room=${activeRoomCode}`)}
                  >
                    Abrir sala no jogo
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mode-card space-y-2">
              <h2 className="mode-title">Entrar em sala</h2>
              <p className="mode-text">Informe o codigo recebido (exemplo: DFGF-4872) para sincronizar o processo.</p>

              <label className="block text-xs uppercase" htmlFor="guest-name">
                Nome do convidado
              </label>
              <input
                id="guest-name"
                className="chat-input !bg-[#f7f1e4] !text-inkBlack !border-[#7b7a74]"
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
              />

              <label className="block text-xs uppercase" htmlFor="room-code">
                Codigo de protocolo
              </label>
              <input
                id="room-code"
                className="chat-input !bg-[#f7f1e4] !text-inkBlack !border-[#7b7a74]"
                placeholder="DFGF-0000"
                value={joinCodeInput}
                onChange={(event) => setJoinCodeInput(event.target.value)}
              />

              <button
                type="button"
                className="action-btn"
                disabled={!canJoin}
                style={{ opacity: canJoin ? 1 : 0.45 }}
                onClick={() => {
                  if (!canJoin) return;
                  persistLastRoom(normalizedJoinCode);
                  router.push(`/jogo?mode=pvp_remote&room=${normalizedJoinCode}`);
                }}
              >
                Entrar com protocolo
              </button>
            </div>
          </div>
        </div>

        <footer className="official-footer">
          Regra interna: o nome da sala em modo remoto segue numeracao DFGF-0000
        </footer>
      </section>
    </main>
  );
}
