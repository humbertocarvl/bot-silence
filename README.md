# Silence Bot

Bot oficial do servidor **Habbo Hotel BR** no Discord.  
Gerencia o fluxo de entrada de novos membros e realiza a verificação de contas do Habbo Hotel.

---

## Funcionalidades

- **Fluxo de entrada automático** — atribui o cargo de Visitante ao entrar e o cargo Player ao aceitar as regras
- **Verificação Habbo** — vincula a conta do Discord à conta do Habbo via código na missão do personagem
- **Comando `/aviso`** — admins enviam mensagens formatadas (JSON do Discohook) em qualquer canal
- **Comando `/minhaconta`** — exibe a conta do Habbo vinculada ao Discord
- **Comando `/silence`** — exibe estatísticas do bot

---

## Requisitos

- Node.js **18+**
- PostgreSQL (recomendado: [Railway](https://railway.app))
- [Aplicação no Discord Developer Portal](https://discord.com/developers/applications)

---

## Variáveis de Ambiente

Copie `.env.example` para `.env` e preencha:

| Variável | Descrição |
|---|---|
| `DISCORD_TOKEN` | Token do bot (Developer Portal → Bot → Token) |
| `CLIENT_ID` | ID da aplicação (Developer Portal → General Information) |
| `GUILD_ID` | ID do servidor Discord |
| `WELCOME_CHANNEL_ID` | Canal de boas-vindas |
| `RULES_CHANNEL_ID` | Canal de regras (tipo Rules) |
| `HABBO_VERIFY_CHANNEL_ID` | Canal de verificação do Habbo |
| `VISITOR_ROLE_ID` | Cargo atribuído ao entrar no servidor |
| `PLAYER_ROLE_ID` | Cargo atribuído ao aceitar as regras |
| `DATABASE_URL` | Connection string PostgreSQL |
| `HABBO_API_BASE` | `https://www.habbo.com.br/api/public` |

---

## Setup Local

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# edite o .env com seus valores

# 3. Registrar os slash commands no servidor
npm run deploy

# 4. Iniciar o bot
npm start
```

> **Atenção:** No [Developer Portal](https://discord.com/developers/applications), ative os **Privileged Gateway Intents**:
> - ✅ Server Members Intent

---

## Deploy no Railway

### 1. Banco de Dados

1. No Railway, crie um novo projeto e adicione o serviço **PostgreSQL**
2. Copie a `DATABASE_URL` em **Variables** do serviço PostgreSQL

### 2. Bot

1. No mesmo projeto, clique em **New Service → GitHub Repo** e selecione este repositório
2. Em **Variables**, adicione todas as variáveis do `.env`
3. Em **Settings → Deploy**, confirme que o comando de start é `npm start`
4. Faça o deploy — o bot aplicará as migrações automaticamente na inicialização

### 3. Registrar os Slash Commands

Após o primeiro deploy, rode localmente uma única vez:

```bash
npm run deploy
```

---

## Fluxo de Entrada no Servidor

```
Novo membro entra
  → Recebe cargo Visitante
  → Mensagem de boas-vindas no canal de entrada

Aceita as regras (Discord Membership Screening)
  → Recebe cargo Player
  → Acesso aos canais do servidor

[Opcional] Verifica conta Habbo
  → Acessa canal de verificação → clica "Verificar Conta Habbo"
  → Digita o nick no Habbo no modal
  → Coloca o código SLNC-XXXXXX na Missão do personagem
  → Clica "Confirmar Verificação"
  → Recebe cargo ✅ Verificado
```

---

## Permissões do Bot no Servidor

O cargo do bot deve estar **acima** dos cargos Visitante, Player e ✅ Verificado na hierarquia de cargos (**Configurações → Cargos**).

Permissões necessárias: `Manage Roles`, `Send Messages`, `Embed Links`, `Read Message History`
