"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function clockLabel(date: Date): string {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function routeLabel(pathname: string): string {
  if (pathname === "/jogo") return "Formulário 3x3-B";
  if (pathname === "/sala") return "Salas de Protocolo";
  if (pathname === "/arquivo-morto") return "Arquivo Morto";
  return "Abertura de Processo";
}

function routeIcon(pathname: string): string {
  if (pathname === "/jogo") return "taskbar-icon-board";
  if (pathname === "/sala") return "taskbar-icon-network";
  if (pathname === "/arquivo-morto") return "taskbar-icon-folder";
  return "taskbar-icon-home";
}

export function DesktopTaskbar() {
  const pathname = usePathname();
  const [clock, setClock] = useState(() => clockLabel(new Date()));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(clockLabel(new Date()));
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const activeLabel = useMemo(() => routeLabel(pathname), [pathname]);
  const activeIcon = useMemo(() => routeIcon(pathname), [pathname]);

  return (
    <footer className="taskbar" role="contentinfo" aria-label="Barra de tarefas DFGF">
      <Link href="/" className="taskbar-start" data-win-tooltip="Retornar ao inicio">
        DFGF
      </Link>

      <div className="taskbar-active" aria-live="polite">
        <span className={`taskbar-icon ${activeIcon}`} aria-hidden="true" />
        <span>{activeLabel}</span>
      </div>

      <div className="taskbar-clock">{clock}</div>
    </footer>
  );
}
