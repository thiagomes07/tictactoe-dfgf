"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const GAME_PROGRESS_STORAGE_KEY = "dfgf:game-progress:v1";

const NAV_ITEMS = [
  { href: "/", label: "Abertura de Processo" },
  { href: "/jogo", label: "Formulario 3x3-B" },
  { href: "/jogo?mode=pvp_local", label: "PVP Local" },
  { href: "/sala", label: "Salas de Protocolo" },
  { href: "/arquivo-morto", label: "Arquivo Morto" }
];

export function DepartmentHeader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode");

  const resolveModeFromHref = (href: string): string => {
    const queryIndex = href.indexOf("?");
    if (queryIndex < 0) return "vs_ai";
    const query = new URLSearchParams(href.slice(queryIndex + 1));
    return query.get("mode") ?? "vs_ai";
  };

  const shouldConfirmModeSwitch = (targetHref: string): boolean => {
    if (typeof window === "undefined") return false;
    if (pathname !== "/jogo") return false;
    if (!targetHref.startsWith("/jogo")) return false;

    const currentMode = mode ?? "vs_ai";
    const targetMode = resolveModeFromHref(targetHref);
    if (targetMode === currentMode) return false;

    const raw = window.localStorage.getItem(GAME_PROGRESS_STORAGE_KEY);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as { inProgress?: boolean };
      return Boolean(parsed.inProgress);
    } catch {
      return false;
    }
  };

  return (
    <header className="dfgf-topline">
      <p className="dfgf-title">Burocracia S.A. - Departamento Federal de Gestao de Formularios</p>
      <p className="dfgf-subtitle">Manual Operacional do Formulario 3x3-B - revisao interna sem publicidade externa</p>

      <nav className="gov-tabs" aria-label="Navegacao principal">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/jogo?mode=pvp_local"
              ? pathname === "/jogo" && mode === "pvp_local"
              : item.href === "/jogo"
                ? pathname === "/jogo" && mode !== "pvp_local"
                : pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(event) => {
                if (!shouldConfirmModeSwitch(item.href)) return;
                const confirmed = window.confirm(
                  "Voce esta no meio de uma partida. Trocar de modo vai resetar o jogo e limpar o chat. Deseja continuar?"
                );
                if (!confirmed) event.preventDefault();
              }}
              className="gov-tab"
              style={{
                background: isActive ? "#d9ccb0" : undefined,
                borderLeftWidth: isActive ? "3px" : undefined
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
