"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ACTORS, type UiChatMessage } from "@/features/chat/actors";

interface DepartmentChatProps {
  protocolCode: string;
  messages: UiChatMessage[];
  onSendMessage: (text: string) => void;
}

export function DepartmentChat({ protocolCode, messages, onSendMessage }: DepartmentChatProps) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const orderedMessages = useMemo(() => messages, [messages]);

  return (
    <section className="chat-panel">
      <header className="chat-header">
        <p className="chat-title">DFGF Interno</p>
        <p className="chat-subtitle">Canal de processo ativo - {protocolCode}</p>
      </header>

      <div className="chat-stream" role="log" aria-live="polite">
        {orderedMessages.map((message) => {
          const actor = ACTORS[message.actorId];
          const isSystem = actor.system;

          return (
            <article key={message.id} className="chat-item">
              <div className="chat-avatar" style={{ backgroundColor: actor.avatarColor }} aria-hidden="true">
                {actor.initials}
              </div>

              <div>
                <div className="chat-meta">
                  {message.createdAt} - {actor.name}
                </div>
                <div className={`chat-body ${isSystem ? "chat-system" : ""}`}>{message.text}</div>
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
          const trimmed = draft.trim();
          if (!trimmed) return;
          onSendMessage(trimmed);
          setDraft("");
        }}
      >
        <input
          className="chat-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Enviar mensagem ao departamento..."
          maxLength={280}
          aria-label="Mensagem para o chat interno"
        />
      </form>
    </section>
  );
}
