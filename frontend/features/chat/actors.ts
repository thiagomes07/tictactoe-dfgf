import type { ActorId, MatchMode } from "@/types/game";

export type ChatProfile = "vs_ai" | "pvp";

export interface ActorProfile {
  id: ActorId;
  name: string;
  role: string;
  initials: string;
  avatarColor: string;
  system?: boolean;
}

export const ACTORS: Record<ActorId, ActorProfile> = {
  estagiario: {
    id: "estagiario",
    name: "Estagiario(a)",
    role: "Analista Temporario",
    initials: "ES",
    avatarColor: "#596673"
  },
  geraldo: {
    id: "geraldo",
    name: "Sr. Geraldo",
    role: "Chefe do Departamento",
    initials: "SG",
    avatarColor: "#8b5e3c"
  },
  marlene: {
    id: "marlene",
    name: "Marlene",
    role: "Assistente da Chefia",
    initials: "MA",
    avatarColor: "#934f7f"
  },
  tulio: {
    id: "tulio",
    name: "Tulio",
    role: "Analista Junior (ex-estagiario)",
    initials: "TU",
    avatarColor: "#4e7e86"
  },
  patricia: {
    id: "patricia",
    name: "Patricia de RH",
    role: "Recursos Humanos",
    initials: "RH",
    avatarColor: "#779151"
  },
  sistema_dfgf: {
    id: "sistema_dfgf",
    name: "Sistema DFGF",
    role: "Bot Oficial de Protocolo",
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

const GERALDO_BROADCASTS_VS_AI = [
  "Sr. Geraldo: minha estrategia exige paciencia burocratica.",
  "Sr. Geraldo: nao confundam silencio com falta de visao.",
  "Sr. Geraldo: essa jogada foi para desenvolvimento da equipe.",
  "Sr. Geraldo: peguei essa ideia num video motivacional de 2009."
];

const GERALDO_BROADCASTS_PVP = [
  "Sr. Geraldo: estou avaliando os dois estagiarios com criterio tecnico subjetivo.",
  "Sr. Geraldo: o vencedor sera lembrado no relatorio trimestral que talvez eu leia.",
  "Sr. Geraldo: jogo local e prova de maturidade departamental.",
  "Sr. Geraldo: promocoes poderao ser discutidas no cafe, sem garantia de cafe."
];

const AMBIENT_VS_AI: Array<{ actorId: ActorId; text: string }> = [
  { actorId: "marlene", text: "Se o Sr. Geraldo concordar, ja considero essa rodada historica." },
  { actorId: "tulio", text: "A planilha diz que tudo esta sob controle, o que e preocupante." },
  { actorId: "patricia", text: "Pessoal, lembrete: formulario de clima fecha hoje as 17h." },
  { actorId: "sistema_dfgf", text: "PROTOCOLO INTERNO REENCAMINHADO PARA SETOR INEXISTENTE." },
  { actorId: "geraldo", text: "Estou guiando pedagogicamente este processo, sem que percebam." }
];

const AMBIENT_PVP: Array<{ actorId: ActorId; text: string }> = [
  { actorId: "geraldo", text: "Observacao da chefia: ambos sob avaliacao especial hoje." },
  { actorId: "marlene", text: "Que disputas incriveis sob a supervisao impecavel do Sr. Geraldo." },
  { actorId: "tulio", text: "Rivalidade instalada. RH vai chamar de integracao competitiva." },
  { actorId: "patricia", text: "Ja reservei formularios de feedback para os dois participantes." },
  { actorId: "sistema_dfgf", text: "PROCESSO PVP REGISTRADO. PROMOCAO SUJEITA A DISPONIBILIDADE ORCAMENTARIA." }
];

const USER_REPLY_VS_AI: Array<{ actorId: ActorId; text: string }> = [
  { actorId: "marlene", text: "Excelente ponto. O Sr. Geraldo chegou na mesma conclusao ontem." },
  { actorId: "tulio", text: "Concordo parcialmente, o restante vai para auditoria emocional." },
  { actorId: "patricia", text: "Obrigada pela mensagem. Nao esquece de registrar no portal interno." },
  { actorId: "geraldo", text: "Boa colocacao. Vou fingir que foi alinhada comigo antes." },
  { actorId: "sistema_dfgf", text: "MENSAGEM RECEBIDA. PRAZO DE RETORNO: 12 DIAS UTEIS." }
];

const USER_REPLY_PVP: Array<{ actorId: ActorId; text: string }> = [
  { actorId: "geraldo", text: "Excelente postura competitiva. Vou considerar no quadro de talentos." },
  { actorId: "marlene", text: "A chefia valoriza muito esse nivel de comprometimento." },
  { actorId: "tulio", text: "Continuem assim. O caos esta organizado de forma elegante." },
  { actorId: "patricia", text: "RH apoia a competicao saudavel, com laudo e assinatura." },
  { actorId: "sistema_dfgf", text: "INTERACAO RECEBIDA. COMITE DE ACOMPANHAMENTO FOI NOTIFICADO." }
];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function modeToChatProfile(mode: MatchMode): ChatProfile {
  return mode === "vs_ai" ? "vs_ai" : "pvp";
}

export function randomBroadcastMessage(profile: ChatProfile): string {
  return profile === "vs_ai" ? pickRandom(GERALDO_BROADCASTS_VS_AI) : pickRandom(GERALDO_BROADCASTS_PVP);
}

export function randomAmbientChat(profile: ChatProfile): { actorId: ActorId; text: string } {
  return profile === "vs_ai" ? pickRandom(AMBIENT_VS_AI) : pickRandom(AMBIENT_PVP);
}

export function randomReplyToUser(profile: ChatProfile, input: string): { actorId: ActorId; text: string } {
  const normalized = input.toLowerCase();

  if (normalized.includes("cafe")) {
    return { actorId: "patricia", text: "Sobre cafe: ja abrimos chamado com prioridade media-alta." };
  }

  if (normalized.includes("geraldo")) {
    return { actorId: "geraldo", text: "Referencias a minha lideranca serao devidamente registradas." };
  }

  if (normalized.includes("promoc")) {
    return { actorId: "tulio", text: "Promocao depende de KPI, humor da chefia e alinhamento astrologico." };
  }

  return profile === "vs_ai" ? pickRandom(USER_REPLY_VS_AI) : pickRandom(USER_REPLY_PVP);
}

export function nowLabel(date = new Date()): string {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}
