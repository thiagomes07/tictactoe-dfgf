"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { WindowsDialog } from "@/components/windows-dialog";
import { getRoomSession, removeRoomSessions } from "@/features/session/storage";
import { ApiClientError } from "@/lib/api/http-client";
import { closeRoom } from "@/lib/api/rooms";

const GAME_PROGRESS_STORAGE_KEY = "dfgf:game-progress:v1";
const MODE_SWITCH_APPROVAL_KEY = "dfgf:mode-switch-approval:v1";

const NAV_ITEMS = [
  { href: "/", label: "Abertura de Processo" },
  { href: "/jogo", label: "Formulário 3x3-B" },
  { href: "/jogo?mode=pvp_local", label: "PVP Local" },
  { href: "/sala", label: "Salas de Protocolo" },
  { href: "/arquivo-morto", label: "Arquivo Morto" }
];

export function DepartmentHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [blockingError, setBlockingError] = useState<string | null>(null);

  const currentHref = `${pathname}${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`;
  const roomCode = searchParams.get("room")?.toUpperCase() ?? null;
  const role = searchParams.get("role");
  const isRemoteHostContext = pathname === "/jogo" && mode === "pvp_remote" && role !== "guest" && Boolean(roomCode);

  const hasInProgressMatch = (): boolean => {
    if (typeof window === "undefined") return false;
    const raw = window.localStorage.getItem(GAME_PROGRESS_STORAGE_KEY);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as { inProgress?: boolean };
      return Boolean(parsed.inProgress);
    } catch {
      return false;
    }
  };

  const shouldConfirmNavigation = (targetHref: string): boolean => {
    if (typeof window === "undefined") return false;
    if (pathname !== "/jogo") return false;
    if (targetHref === currentHref) return false;
    if (isRemoteHostContext) return true;
    return hasInProgressMatch();
  };

  const dialogMessage = isRemoteHostContext
    ? `Você está saindo da sala ${roomCode}. Como host, a sala será encerrada e deletada para todos.`
    : "Você está no meio de uma partida. Se sair agora, o jogo e o chat serão limpos e o processo parcial será enviado ao Arquivo Morto.";
  const dialogConfirmLabel = isRemoteHostContext ? "Sair e deletar sala" : "Continuar";

  return (
    <>
      <header className="dfgf-topline">
        <div className="dfgf-topline-titlebar">
          <p className="dfgf-title">Burocracia S.A. - DFGF.EXE</p>
          <div className="window-controls" aria-hidden="true">
            <span className="window-control">_</span>
            <span className="window-control">[]</span>
            <span className="window-control">x</span>
          </div>
        </div>

        <div className="dfgf-topline-content">
          <p className="dfgf-subtitle">Departamento Federal de Gestão de Formulários - módulo operacional 3x3-B</p>

          <nav className="gov-tabs" aria-label="Navegação principal">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === "/jogo?mode=pvp_local"
                  ? pathname === "/jogo" && mode === "pvp_local"
                  : item.href === "/sala"
                    ? pathname === "/sala" || (pathname === "/jogo" && mode === "pvp_remote")
                  : item.href === "/jogo"
                    ? pathname === "/jogo" && mode !== "pvp_local" && mode !== "pvp_remote"
                    : pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-win-tooltip={`Abrir ${item.label}`}
                  onClick={(event) => {
                    if (!shouldConfirmNavigation(item.href)) return;
                    event.preventDefault();
                    setPendingHref(item.href);
                  }}
                  className={`gov-tab ${isActive ? "gov-tab-active" : ""}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <WindowsDialog
        open={Boolean(pendingHref)}
        title="DFGF - Confirmação"
        message={dialogMessage}
        confirmLabel={dialogConfirmLabel}
        cancelLabel="Cancelar"
        onCancel={() => setPendingHref(null)}
        onConfirm={async () => {
          if (!pendingHref) return;
          const href = pendingHref;
          setPendingHref(null);

          if (isRemoteHostContext && roomCode) {
            const hostSession = getRoomSession(roomCode, "host");
            if (hostSession?.playerId) {
              try {
                await closeRoom(roomCode, { hostPlayerId: hostSession.playerId });
              } catch (error) {
                if (!(error instanceof ApiClientError) || error.code !== "NOT_FOUND") {
                  setBlockingError("Não foi possível encerrar a sala remota agora. Tente novamente em alguns segundos.");
                  return;
                }
              }
            }
            removeRoomSessions(roomCode);
          }

          if (hasInProgressMatch()) {
            window.sessionStorage.setItem(MODE_SWITCH_APPROVAL_KEY, href);
          }
          router.push(href);
        }}
      />

      <WindowsDialog
        open={Boolean(blockingError)}
        title="Não foi possível sair"
        message={blockingError ?? ""}
        confirmLabel="Entendi"
        cancelLabel="Fechar"
        onConfirm={() => setBlockingError(null)}
        onCancel={() => setBlockingError(null)}
      />
    </>
  );
}
