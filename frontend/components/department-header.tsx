"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Abertura de Processo" },
  { href: "/jogo", label: "Formulario 3x3-B" },
  { href: "/sala", label: "Salas de Protocolo" },
  { href: "/arquivo-morto", label: "Arquivo Morto" }
];

export function DepartmentHeader() {
  const pathname = usePathname();

  return (
    <header className="dfgf-topline">
      <p className="dfgf-title">Burocracia S.A. - Departamento Federal de Gestao de Formularios</p>
      <p className="dfgf-subtitle">Manual Operacional do Formulario 3x3-B - revisao interna sem publicidade externa</p>

      <nav className="gov-tabs" aria-label="Navegacao principal">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
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
