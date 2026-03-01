"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { clearArchive, loadArchive } from "@/features/history/storage";
import type { MatchArchiveItem } from "@/types/game";

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

function statusColor(status: MatchArchiveItem["status"]): string {
  if (status === "DEFERIDO") return "var(--stamp-red)";
  if (status === "INDEFERIDO") return "var(--stamp-blue)";
  return "var(--graphite)";
}

export function ArchivePageClient() {
  const [items, setItems] = useState<MatchArchiveItem[]>([]);

  useEffect(() => {
    setItems(loadArchive());
  }, []);

  const hasItems = useMemo(() => items.length > 0, [items.length]);

  return (
    <main className="space-y-4">
      <section className="paper-sheet !rotate-[0.16deg]">
        <header className="paper-header">
          <div className="paper-emblem" aria-hidden="true">
            <svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 20H20M8 20V6H16V20M10 10H14M10 14H14" strokeWidth="1.2" />
            </svg>
          </div>
          <div>
            <p className="paper-headline">Arquivo Morto de Processos</p>
            <p className="paper-meta">Historico local armazenado no frontend</p>
          </div>
          <div className="protocol-box">
            <div className="window-controls window-controls-inline" aria-hidden="true">
              <span className="window-control">_</span>
              <span className="window-control">[]</span>
              <span className="window-control">x</span>
            </div>
            <div>Registros</div>
            <div className="protocol-code">{items.length.toString().padStart(2, "0")}</div>
          </div>
        </header>

        <div className="form-lines space-y-4">
          {!hasItems ? (
            <p className="text-sm uppercase text-graphite">
              Nenhum processo registrado. Finalize uma partida para alimentar o arquivo morto.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="archive-table">
                <thead>
                  <tr>
                    <th>Protocolo</th>
                    <th>Modalidade</th>
                    <th>Status</th>
                    <th>Duracão</th>
                    <th>Encerrado em</th>
                    <th>Parecer</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.protocolCode}</td>
                      <td>{item.mode}</td>
                      <td>
                        <span className="archive-status" style={{ color: statusColor(item.status) }}>
                          {item.status}
                        </span>
                      </td>
                      <td>{formatDuration(item.durationSeconds)}</td>
                      <td>{formatDate(item.finishedAt)}</td>
                      <td>{item.resultLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Link className="action-btn" href="/jogo?mode=vs_ai&difficulty=pre_almoco">
              Abrir novo processo
            </Link>

            <button
              type="button"
              className="action-btn action-btn-danger"
              onClick={() => {
                clearArchive();
                setItems([]);
              }}
              disabled={!hasItems}
              style={{ opacity: hasItems ? 1 : 0.45 }}
            >
              Esvaziar arquivo morto
            </button>
          </div>
        </div>

        <footer className="official-footer">
          Arquivo Morto - statuses possiveis: DEFERIDO / INDEFERIDO / ARQUIVADO
        </footer>
      </section>
    </main>
  );
}
