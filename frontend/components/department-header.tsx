"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { WindowsDialog } from "@/components/windows-dialog";

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

  const currentHref = `${pathname}${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`;

  const shouldConfirmNavigation = (targetHref: string): boolean => {
    if (typeof window === "undefined") return false;
    if (pathname !== "/jogo") return false;
    if (targetHref === currentHref) return false;

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
          <p className="dfgf-subtitle">Departamento Federal de Gestão de Formulários - modulo operacional 3x3-B</p>

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
        title="DFGF - Confirmacao"
        message="Voce esta no meio de uma partida. Se sair agora, o jogo e o chat serao limpos e o processo parcial sera enviado ao Arquivo Morto."
        confirmLabel="Continuar"
        cancelLabel="Cancelar"
        onCancel={() => setPendingHref(null)}
        onConfirm={() => {
          if (!pendingHref) return;
          const href = pendingHref;
          setPendingHref(null);
          window.sessionStorage.setItem(MODE_SWITCH_APPROVAL_KEY, href);
          router.push(href);
        }}
      />
    </>
  );
}
