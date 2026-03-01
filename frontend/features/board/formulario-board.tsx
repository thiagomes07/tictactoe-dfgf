"use client";

import type { CellMark } from "@/types/game";

interface FormulárioBoardProps {
  protocolCode: string;
  modeLabel: string;
  statusLabel: string;
  currentTurnLabel: string;
  elapsedLabel: string;
  board: CellMark[];
  winningLine: number[] | null;
  onCellClick: (index: number) => void;
  disableBoard: boolean;
  paperKey: number;
}

function Stamp({ mark }: { mark: Exclude<CellMark, null> }) {
  const isDeferido = mark === "x";

  return (
    <div className={`stamp-mark ${isDeferido ? "stamp-red" : "stamp-blue"}`}>
      <span>{isDeferido ? "Deferido" : "Indeferido"}</span>
    </div>
  );
}

export function FormulárioBoard({
  protocolCode,
  modeLabel,
  statusLabel,
  currentTurnLabel,
  elapsedLabel,
  board,
  winningLine,
  onCellClick,
  disableBoard,
  paperKey
}: FormulárioBoardProps) {
  return (
    <article key={paperKey} className="paper-sheet">
      <header className="paper-header">
        <div className="paper-emblem" aria-hidden="true">
          <svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 20H20M6 20V8L12 4L18 8V20M9 12H15" strokeWidth="1.2" />
          </svg>
        </div>

        <div>
          <p className="paper-headline">Formulário 3x3-B - Controle de Demanda</p>
          <p className="paper-meta">Departamento Federal de Gestão de Formulários</p>
        </div>

        <div className="protocol-box">
          <div className="window-controls window-controls-inline" aria-hidden="true">
            <span className="window-control">_</span>
            <span className="window-control">[]</span>
            <span className="window-control">x</span>
          </div>
          <div>Processo Ativo</div>
          <div className="protocol-code">{protocolCode}</div>
        </div>
      </header>

      <div className="form-lines">
        <div className="form-kv">
          <span>Modalidade:</span>
          <strong>{modeLabel}</strong>
        </div>
        <div className="form-kv">
          <span>Status:</span>
          <strong>{statusLabel}</strong>
        </div>
        <div className="form-kv">
          <span>Responsável da vez:</span>
          <strong>{currentTurnLabel}</strong>
        </div>
        <div className="form-kv">
          <span>Duracão do processo:</span>
          <strong>{elapsedLabel}</strong>
        </div>

        <div className="board-grid" role="grid" aria-label="Formulário 3x3-B">
          {board.map((mark, index) => {
            const isHighlighted = Boolean(winningLine?.includes(index));

            return (
              <button
                key={index}
                type="button"
                className="board-cell"
                style={{
                  background: isHighlighted ? "#fff1cf" : undefined
                }}
                onClick={() => onCellClick(index)}
                disabled={disableBoard || mark !== null}
                aria-label={`Campo ${index + 1}`}
              >
                {mark ? <Stamp mark={mark} /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <footer className="official-footer">
        Formulário 3x3-B - Revisao 1987 - Proibida reproducao sem autorizacao da chefia imediata
      </footer>
    </article>
  );
}
