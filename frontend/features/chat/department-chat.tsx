"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ACTORS, type UiChatMessage } from "@/features/chat/actors";

interface DepartmentChatProps {
  protocolCode: string;
  messages: UiChatMessage[];
  onSendMessage: (text: string) => boolean;
  sendCooldownMs?: number;
}

function initialsFromName(name: string, fallback: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function DepartmentChat({
  protocolCode,
  messages,
  onSendMessage,
  sendCooldownMs = 0
}: DepartmentChatProps) {
  const [draft, setDraft] = useState("");
  const [cooldownLeftMs, setCooldownLeftMs] = useState(0);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (cooldownLeftMs <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownLeftMs((prev) => Math.max(0, prev - 250));
    }, 250);

    return () => window.clearInterval(timer);
  }, [cooldownLeftMs]);

  const orderedMessages = useMemo(() => messages, [messages]);
  const canSend = cooldownLeftMs <= 0;

  return (
    <section className="chat-panel">
      <header className="chat-header">
        <p className="chat-title">DFGF Interno</p>
        <p className="chat-subtitle">Canal de processo ativo - {protocolCode}</p>
      </header>

      <div className="chat-stream" role="log" aria-live="polite">
        {orderedMessages.map((message) => {
          const actor = ACTORS[message.actorId];
          const displayName = message.actorDisplayName?.trim() ? message.actorDisplayName : actor.name;
          const avatarInitials =
            message.actorId === "estagiario" ? initialsFromName(displayName, actor.initials) : actor.initials;
          const isSystem = actor.system;
          const isBoss = actor.id === "geraldo";
          const intentLabel =
            message.kind === "reply"
              ? "RESPONDENDO VOCE"
              : message.kind === "game_commentary"
                ? "COMENTARIO DE JOGO"
                : "TRAMITE INTERNO";
          const intentClass =
            message.kind === "reply"
              ? "chat-intent-reply"
              : message.kind === "game_commentary"
                ? "chat-intent-game"
                : "chat-intent-general";

          return (
            <article key={message.id} className="chat-item">
              <div className="chat-avatar" style={{ backgroundColor: actor.avatarColor }} aria-hidden="true">
                {avatarInitials}
              </div>

              <div>
                <div className="chat-meta">
                  {message.createdAt} - {displayName} <span className="chat-role">({actor.role})</span>
                </div>
                <div className={`chat-intent-badge ${intentClass}`}>{intentLabel}</div>
                <div className={`chat-body ${isSystem ? "chat-system" : ""} ${isBoss ? "chat-boss" : ""}`}>
                  {message.text}
                </div>
              </div>
            </article>
          );
        })}
        <div ref={endRef} />
      </div>

      <form
        className="chat-input-wrap"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSend) return;

          const trimmed = draft.trim();
          if (!trimmed) return;
          const accepted = onSendMessage(trimmed);
          if (!accepted) return;

          setDraft("");
          setCooldownLeftMs(sendCooldownMs);
        }}
      >
        <div className="chat-send-row">
          <input
            className="chat-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Enviar mensagem ao departamento..."
            maxLength={280}
            aria-label="Mensagem para o chat interno"
            disabled={!canSend}
          />
          <button type="submit" className="action-btn chat-send-btn" disabled={!canSend}>
            Enviar
          </button>
        </div>
        {!canSend ? (
          <p className="chat-cooldown">Aguarde {Math.ceil(cooldownLeftMs / 1000)}s para nova mensagem.</p>
        ) : null}
      </form>
    </section>
  );
}
