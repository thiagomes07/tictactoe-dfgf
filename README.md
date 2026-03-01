# Formulário 3x3-B
### Departamento Federal de Gestão de Formulários - DFGF
> "Todo processo precisa ser preenchido. Todo campo precisa ser ocupado."
> - Sr. Geraldo, Gerente de Operações, 27 anos de casa

---

## Visão Geral
Projeto de jogo da velha temático (Burocracia S.A.) em que cada partida representa uma demanda interna do DFGF (Departamento Federal de Gestão de Formulários).

Principais elementos da experiência:
- **Contexto narrativo**: o jogador atua como estagiário(a) em um escritório burocrático, com o Sr. Geraldo e colegas acompanhando tudo.
- **Modos de jogo**:
  - `vs_ai`: Estagiário(a) vs Sr. Geraldo (chefia),
  - `pvp_local`: dois jogadores na mesma máquina,
  - `pvp_remote`: host/convidado em sala de protocolo compartilhada.
- **Chat vivo do departamento**: mensagens em tempo real com personagens fixos (Marlene, Tulio, Patrícia de RH, Sistema DFGF e Geraldo), incluindo respostas via LLM e comentários automáticos de partida.
- **Identidade visual retrô**: interface inspirada em software corporativo anos 90 (janelas estilo Win95, barra de tarefas, tipografia e densidade visual de sistema legado).
- **Elementos de ambientação**: cursores antigos, trilha sonora de fundo, microdetalhes visuais e interações no estilo desktop clássico.
- **Apps extras in-page**: calculadora funcional e minigame Snake funcional, ambos em janelas arrastáveis/minimizáveis com estética retrô.

O objetivo desta base foi entregar uma demo funcional de ponta a ponta em pouco tempo de desenvolvimento (2 dias), priorizando velocidade de entrega, clareza de código e facilidade de operação.

---

## Arquitetura (Resumo)

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS |
| Backend | Go (`net/http`) |
| Tempo real | WebSocket (`gorilla/websocket`) |
| IA do chat | AWS Bedrock (Claude) via IAM |
| IA do jogo | Lógica nativa no backend (heurística/minimax por dificuldade) |
| Orquestração | Docker Compose |

---

## Responsabilidades por Camada

### Frontend (`frontend/`)
- Renderização de páginas, componentes e identidade visual.
- Estado de UI, navegação entre modos e guardas de confirmação de saída.
- Consumo das APIs HTTP do backend (`/v1/*`).
- Assinatura de eventos WebSocket da partida (snapshot, jogadas, chat, anúncios, fechamento de sala).
- Persistência local de histórico do usuário (*Arquivo Morto*) em `localStorage`.
- Persistência local de identidades/sessões de sala remota (host/guest) para reconexão rápida.

### Backend (`backend/`)
- Fonte da verdade do estado de partidas e salas remotas.
- API HTTP para criar/consultar partida, enviar jogada, enviar/listar chat, criar/entrar/listar/fechar salas.
- Hub WebSocket para sincronização em tempo real entre clientes.
- Regras de domínio (validação de turno, jogada válida, encerramento, limite de 2 jogadores por sala).
- Integração com Bedrock para respostas de chat e fallback local quando indisponível.
- Geração de comentários automáticos e anúncios do "departamento".

### Estratégia de Persistência

#### Sem banco de dados (intencional para demo)
Este projeto **não usa banco** por decisão consciente de escopo:
- desenvolvimento de 2 dias,
- objetivo de demo navegável e divertida,
- foco em fluxo de jogo e experiência, não em retenção permanente.

#### Onde os dados ficam
- **Backend**: memória do processo (match store / room store / sessões).
  - reiniciar o container limpa estado do servidor.
- **Frontend**: `localStorage` para:
  - histórico local (*Arquivo Morto*),
  - identidade de jogador,
  - sessão de sala remota.

Essa combinação foi suficiente para demo multiusuário básica sem overhead de modelagem de banco, migrações, cache distribuído e observabilidade mais pesada.

### Por que essa arquitetura foi escolhida
- **Go no backend**: baixo overhead, WebSocket simples, boa performance para estado em memória.
- **Next.js no frontend**: produtividade alta para UI complexa e rotas.
- **Compose**: operação extremamente simples para demo/deploy manual.
- **AWS Bedrock via IAM**: evita segredo hardcoded, funciona em dev e produção.

Poderia ser muito mais sofisticado (PostgreSQL/Redis, fila assíncrona, métricas avançadas, autoscaling, auth robusta), mas essas decisões simplistas foram tomadas pelo tempo curto de desenvolvimento e pela proposta de demonstração.

---

## Justificativa Técnica (Desafio)

### 1) Quais foram as 3 decisões técnicas mais importantes que tomei e por quê?
1. **Separar claramente frontend e backend, com contratos explícitos (HTTP + WebSocket)**.  
Isso permitiu evoluir interface e regras de jogo em paralelo sem acoplamento forte. Também deixou o fluxo remoto (salas) mais previsível, com o backend como fonte de verdade do estado da partida.

2. **Manter o estado no backend em memória e o histórico do usuário no `localStorage` no frontend**.  
Como o objetivo era uma demo funcional em 2 dias, essa escolha reduziu bastante complexidade operacional e de código (sem migrations, sem camada de repositório SQL, sem setup de cache distribuído), mantendo a experiência completa para avaliação.

3. **Usar Bedrock apenas no chat e manter a jogabilidade da IA com lógica nativa (heurística/minimax)**.  
Essa decisão trouxe controle de dificuldade e previsibilidade de gameplay, sem depender da latência/custo de LLM para cada jogada. A IA generativa ficou onde agrega mais valor no projeto: personalidade e interação dos personagens. Além de tudo, usar LLM nas jogadas seria quase impossível principalmente para conciliar com o chat, uma vez que em outras experiências usando Bedrock, sei que a quota default dele gera bastante erro de throttling e solicitar mais quota poderia levar tempo e me expor a DOW (Deny of Wallet). 

### 2) O que eu faria diferente se tivesse mais tempo?
- Implementaria **testes unitários e de integração** cobrindo regras do jogo, sala remota, contratos de API e eventos WebSocket.
- Evoluiria o controle de robustez da IA com **rate limits mais finos**, fila de processamento de prompts, retry com backoff e fallback mais sofisticado para proteger contra throttling/downtime.
- Separaria infraestrutura de produção em serviços dedicados: **frontend e backend isolados**, **load balancer**, **auto scaling** no backend e regras de health mais robustas.
- Colocaria o frontend em **CDN**, com **DNS e HTTPS** (certificados) para acesso público correto.
- Montaria uma **esteira CI/CD** para build, validação e deploy automático com rollback básico.
- Adicionaria **login e conta de usuário**, com histórico persistente entre dispositivos, o que exigiria banco de dados e modelagem de domínio mais completa.
- Trabalharia otimização de IA com versionamento de prompt, cache de contexto e estratégia de custo/desempenho por modelo.

### 3) Se usei IA, como ela ajudou e onde optei por fazer diferente?
Usei IA como acelerador, mas a direção técnica foi minha do início ao fim. Eu defini a arquitetura, a separação de responsabilidades, a estrutura dos projetos e iniciei a base de frontend/backend. Em vários pontos, primeiro descrevi a lógica em alto nível e só depois usei IA para ajudar a converter em implementação na sintaxe final.

Nos pontos críticos, mantive controle manual para evitar decisões ruins de escopo:
- **Evitei overengineering**: a IA frequentemente sugeria complexidade desnecessária (por exemplo, subir banco em container sem necessidade para a proposta da demo).
- **Não usei LLM para jogadas do adversário**: mantive a IA de jogo algorítmica para preservar dificuldade previsível e evitar dependência de latência/throttling do Bedrock no loop principal do jogo.
- **Reescrevi prompts e mensagens** para fugir de respostas genéricas e manter personalidade consistente dos personagens.
- **Ajustei visual manualmente** porque a primeira direção gerada era genérica; refinei para sustentar a identidade retrô anos 90 de forma intencional.

IA ajudou na produtividade, mas as decisões de arquitetura, escopo, qualidade de UX e consistência técnica ficaram sob minha responsabilidade.

---

## Staging Deploy (EC2 + Compose)

O deploy desta demo foi executado em uma instância EC2 única, com duas aplicações containerizadas:
- `backend` (porta `8080`),
- `frontend` (porta `3000`).

A orquestração foi feita via Docker Compose, com comunicação interna entre os containers pela rede do compose e exposição das portas para acesso externo.

Essa estratégia foi escolhida para reduzir fricção operacional e permitir reprodução rápida do ambiente em um contexto de tempo curto (2 dias de desenvolvimento).

Ambiente publicado:
- `http://98.81.157.169:3000`

---

## Execução Local

### Pré-requisitos
- Docker e Docker Compose (para opção 1)
- Go `1.23+` (para opção 2)
- Node.js `22+` e npm (para opção 2)

### Opção 1 (recomendada): Docker Compose
```bash
docker compose up -d --build
```

Acessos:
- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:8080/v1/health`

### Opção 2: processos separados (modo dev)
Backend:
```bash
cd backend
go run ./cmd/server
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

---

## Estrutura de Pastas

```text
.
|- docker-compose.yml
|- .env.example
|- frontend/
|  |- Dockerfile
|  |- app/
|  |- components/
|  |- features/
|  |- hooks/
|  |- lib/
|  \- types/
\- backend/
   |- Dockerfile
   |- cmd/server/
   \- internal/
      |- api/
      |- chat/
      |- game/
      |- model/
      |- store/
      \- ws/
```

---

*Documento oficial do DFGF. Reprodução proibida sem autorização da chefia imediata.*
*Sr. Geraldo - Gerente de Operações - Matrícula 00003*
