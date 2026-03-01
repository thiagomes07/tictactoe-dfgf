import type { ActorId, ChatChannel, MatchMode } from "@/types/game";

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
    name: "Estagiário(a)",
    role: "Analista Temporário",
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
    name: "Túlio",
    role: "Analista Júnior (ex-estagiário)",
    initials: "TU",
    avatarColor: "#4e7e86"
  },
  patricia: {
    id: "patricia",
    name: "Patrícia de RH",
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
  actorDisplayName?: string;
  text: string;
  createdAt: string;
  channel: ChatChannel;
  kind: "reply" | "game_commentary" | "general";
}

const GERALDO_BROADCASTS_VS_AI = [
  "Sr. Geraldo: minha estratégia exige paciência burocrática e uma caneta azul confiável.",
  "Sr. Geraldo: não confundam meu silêncio com falta de visão; estou planejando em camadas.",
  "Sr. Geraldo: essa jogada foi intencional para desenvolvimento de equipe e reputação.",
  "Sr. Geraldo: peguei essa metodologia num seminário de liderança em VHS.",
  "Sr. Geraldo: desempenho técnico é importante, mas postura no corredor também conta.",
  "Sr. Geraldo: o plano está sob controle desde antes de vocês perceberem o risco."
];

const GERALDO_BROADCASTS_PVP = [
  "Sr. Geraldo: estou avaliando os dois estagiários com critério técnico subjetivo avançado.",
  "Sr. Geraldo: o vencedor será citado no relatório trimestral que talvez eu assine.",
  "Sr. Geraldo: disputa local é prova de maturidade departamental e resistência emocional.",
  "Sr. Geraldo: promoções poderão ser discutidas no café, se o café for aprovado.",
  "Sr. Geraldo: ambiente competitivo saudável, desde que eu esteja vencendo na narrativa.",
  "Sr. Geraldo: rivalidade bem conduzida gera produtividade e fofoca de qualidade."
];

const AMBIENT_VS_AI: Array<{ actorId: ActorId; text: string }> = [
  { actorId: "marlene", text: "Se o Sr. Geraldo concordar, já considero essa rodada histórica." },
  { actorId: "marlene", text: "Que leitura estratégica brilhante da chefia, mesmo sem contexto completo." },
  { actorId: "tulio", text: "A planilha diz que está tudo sob controle, então claramente não está." },
  { actorId: "tulio", text: "Se der errado, chamam de aprendizado. Se der certo, chamam de liderança." },
  { actorId: "patricia", text: "Pessoal, lembrete: formulário de clima fecha hoje às 17h." },
  { actorId: "patricia", text: "RH informa: comentários passivo-agressivos devem ser registrados no canal adequado." },
  { actorId: "sistema_dfgf", text: "PROTOCOLO INTERNO REENCAMINHADO PARA SETOR INEXISTENTE." },
  { actorId: "sistema_dfgf", text: "PRAZO REVISADO PARA 180 DIAS ÚTEIS. MOTIVO: AJUSTE DE RITO." },
  { actorId: "geraldo", text: "Estou guiando pedagogicamente este processo sem alarde institucional." }
];

const AMBIENT_PVP: Array<{ actorId: ActorId; text: string }> = [
  { actorId: "geraldo", text: "Observação da chefia: ambos estão sob avaliação especial hoje." },
  { actorId: "geraldo", text: "Vou analisar desempenho técnico e postura em reunião improvisada." },
  { actorId: "marlene", text: "Disputa incrível sob a supervisão impecável do Sr. Geraldo." },
  { actorId: "marlene", text: "É impressionante como a chefia consegue elevar o nível da competição." },
  { actorId: "tulio", text: "Rivalidade instalada. RH vai chamar isso de integração competitiva." },
  { actorId: "tulio", text: "Dois estagiários, um formulário e nenhum plano de contingência." },
  { actorId: "patricia", text: "Já reservei formulários de feedback para os dois participantes." },
  { actorId: "patricia", text: "RH reforça: rivalidade é saudável até virar ata de conflito." },
  { actorId: "sistema_dfgf", text: "PROCESSO PVP REGISTRADO. PROMOÇÃO SUJEITA À DISPONIBILIDADE ORÇAMENTÁRIA." }
];

const USER_REPLY_VS_AI: Array<{ actorId: ActorId; text: string }> = [
  { actorId: "marlene", text: "Excelente ponto. O Sr. Geraldo antecipou essa leitura ontem no corredor." },
  { actorId: "marlene", text: "Contribuição muito alinhada com a visão estratégica da chefia." },
  { actorId: "tulio", text: "Concordo em partes; a outra parte eu encaminho para auditoria emocional." },
  { actorId: "tulio", text: "Essa sugestão é boa. Só falta sobreviver ao crivo da chefia." },
  { actorId: "patricia", text: "Obrigada pela mensagem. Não esqueça de registrar no portal interno." },
  { actorId: "patricia", text: "RH agradece o posicionamento. Se necessário, abrimos mediação com café." },
  { actorId: "geraldo", text: "Boa colocação. Vou registrar como alinhamento prévio com a liderança." },
  { actorId: "geraldo", text: "Perfeito. Era exatamente isso que eu estava prestes a dizer." },
  { actorId: "sistema_dfgf", text: "MENSAGEM RECEBIDA. PRAZO DE RETORNO: 12 DIAS ÚTEIS." }
];

const USER_REPLY_PVP: Array<{ actorId: ActorId; text: string }> = [
  { actorId: "geraldo", text: "Excelente postura competitiva. Vou considerar no quadro de talentos." },
  { actorId: "geraldo", text: "Essa energia é promissora para futuras reuniões longas e improdutivas." },
  { actorId: "marlene", text: "A chefia valoriza muito esse nível de comprometimento." },
  { actorId: "marlene", text: "Que atitude profissional! O Sr. Geraldo certamente observou esse detalhe." },
  { actorId: "tulio", text: "Continuem assim. O caos está organizado de forma elegante." },
  { actorId: "tulio", text: "Ritmo ótimo. Só falta alguém fingir que isso é benchmarking." },
  { actorId: "patricia", text: "RH apoia a competição saudável, com laudo e assinatura." },
  { actorId: "patricia", text: "Excelente diálogo. Depois preencham a autoavaliação sem ironia, por favor." },
  { actorId: "sistema_dfgf", text: "INTERAÇÃO RECEBIDA. COMITÊ DE ACOMPANHAMENTO FOI NOTIFICADO." }
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

  if (normalized.includes("cafe") || normalized.includes("café")) {
    return { actorId: "patricia", text: "Sobre café: já abrimos chamado com prioridade média-alta." };
  }

  if (normalized.includes("geraldo")) {
    return { actorId: "geraldo", text: "Referências à minha liderança serão devidamente registradas." };
  }

  if (normalized.includes("promoc")) {
    return { actorId: "tulio", text: "Promoção depende de KPI, humor da chefia e alinhamento astrológico." };
  }

  return profile === "vs_ai" ? pickRandom(USER_REPLY_VS_AI) : pickRandom(USER_REPLY_PVP);
}

export function nowLabel(date = new Date()): string {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}


