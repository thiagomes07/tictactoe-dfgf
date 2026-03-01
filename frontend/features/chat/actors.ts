import type { ActorId } from "@/types/game";

export interface ActorProfile {
  id: ActorId;
  name: string;
  initials: string;
  avatarColor: string;
  system?: boolean;
}

export const ACTORS: Record<ActorId, ActorProfile> = {
  estagiario: {
    id: "estagiario",
    name: "Estagiario(a)",
    initials: "ES",
    avatarColor: "#596673"
  },
  geraldo: {
    id: "geraldo",
    name: "Sr. Geraldo",
    initials: "SG",
    avatarColor: "#8b5e3c"
  },
  marlene: {
    id: "marlene",
    name: "Marlene",
    initials: "MA",
    avatarColor: "#934f7f"
  },
  tulio: {
    id: "tulio",
    name: "Tulio",
    initials: "TU",
    avatarColor: "#4e7e86"
  },
  patricia: {
    id: "patricia",
    name: "Patricia de RH",
    initials: "RH",
    avatarColor: "#779151"
  },
  sistema_dfgf: {
    id: "sistema_dfgf",
    name: "Sistema DFGF",
    initials: "SI",
    avatarColor: "#3a4f8f",
    system: true
  }
};

export interface UiChatMessage {
  id: string;
  actorId: ActorId;
  text: string;
  createdAt: string;
}

const GERALDO_BROADCASTS = [
  "Sr. Geraldo: minha estrategia exige paciencia burocratica.",
  "Sr. Geraldo: nao confundam silencio com falta de visao.",
  "Sr. Geraldo: hoje promovemos meritocracia por ordem alfabetica.",
  "Sr. Geraldo: essa jogada foi para desenvolvimento da equipe.",
  "Sr. Geraldo: peguei essa ideia num video motivacional de 2009."
];

const CHAT_CHITCHAT: Array<{ actorId: ActorId; text: string }> = [
  { actorId: "marlene", text: "Se o Sr. Geraldo concordar, ja considero essa rodada historica." },
  { actorId: "tulio", text: "A planilha diz que tudo esta sob controle, o que e preocupante." },
  { actorId: "patricia", text: "Pessoal, lembrete: formulario de clima fecha hoje as 17h." },
  { actorId: "sistema_dfgf", text: "PROTOCOLO INTERNO REENCAMINHADO PARA SETOR INEXISTENTE." },
  { actorId: "marlene", text: "Que leitura de cenario impecavel, chefe." },
  { actorId: "tulio", text: "Se der empate, a culpa vai para o comite. Ja sei o roteiro." },
  { actorId: "patricia", text: "Acabou o cafe na copa. RH esta ciente e emotivo." }
];

const USER_REPLY_LIBRARY: Array<{ actorId: ActorId; text: string }> = [
  { actorId: "marlene", text: "Excelente ponto. O Sr. Geraldo chegou na mesma conclusao ontem." },
  { actorId: "tulio", text: "Concordo parcialmente, o restante vai para auditoria emocional." },
  { actorId: "patricia", text: "Obrigada pela mensagem. Nao esquece de registrar no portal interno." },
  { actorId: "sistema_dfgf", text: "MENSAGEM RECEBIDA. PRAZO DE RETORNO: 12 DIAS UTEIS." }
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function randomBroadcastMessage(): string {
  return pickRandom(GERALDO_BROADCASTS);
}

export function randomAmbientChat(): { actorId: ActorId; text: string } {
  return pickRandom(CHAT_CHITCHAT);
}

export function randomReplyToUser(input: string): { actorId: ActorId; text: string } {
  const normalized = input.toLowerCase();

  if (normalized.includes("cafe")) {
    return { actorId: "patricia", text: "Sobre cafe: ja abrimos chamado com prioridade media-alta." };
  }

  if (normalized.includes("geraldo")) {
    return { actorId: "marlene", text: "O Sr. Geraldo aprecia quando citam a lideranca de forma espontanea." };
  }

  if (normalized.includes("promoc")) {
    return { actorId: "tulio", text: "Promocao depende de KPI, humor da chefia e alinhamento astrologico." };
  }

  return pickRandom(USER_REPLY_LIBRARY);
}

export function nowLabel(date = new Date()): string {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}
