# Formulário 3x3-B
### Departamento Federal de Gestão de Formulários — DFGF
> "Todo processo precisa ser preenchido. Todo campo precisa ser ocupado."
> — Sr. Geraldo, Gerente de Operações, 27 anos de casa

---

## Arquitetura

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS |
| Backend | Go (`net/http`) |
| Tempo real | WebSocket (`gorilla/websocket`) |
| IA do chat | AWS Bedrock (Claude) via IAM |
| IA do jogo | Minimax (nativo, fase futura) |

---

## Estrutura de Pastas

```text
.
├─ docker-compose.yml
├─ .env.example
├─ frontend/
│  ├─ Dockerfile
│  ├─ app/
│  ├─ lib/
│  └─ ...
└─ backend/
   ├─ Dockerfile
   ├─ cmd/server/
   └─ internal/
```

---

## Como Subir (Docker Compose)

### Pré-requisitos
- Docker
- Docker Compose

### 1) Copie as variáveis de ambiente
```bash
cp .env.example .env
```

### 2) Suba a stack
```bash
docker compose up --build
```

### 3) Acesse
- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:8080/healthz`

---

## Variáveis de Ambiente

Arquivo base: `.env.example`

```env
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20240620-v1:0
BEDROCK_MAX_TOKENS=4096
BEDROCK_TEMPERATURE=0.3
```

Observação: a autenticação da AWS deve usar IAM Role na EC2 (sem chave hardcoded).

---

## Próximos Passos

- Gameplay completo (modos local, IA e remoto)
- Sala remota com protocolo `DFGF-XXXX`
- Integração de chat com Bedrock
- Minimax para Sr. Geraldo (modo difícil)
- Arquivo Morto com histórico estendido

---

*Documento oficial do DFGF. Reprodução proibida sem autorização da chefia imediata.*
*Sr. Geraldo — Gerente de Operações — Matrícula 00003*
