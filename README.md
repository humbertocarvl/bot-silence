# Silence Bot

Bot oficial do servidor **Silence** no Discord.  
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
| `HOST_ROLE_ID` | ID do cargo HOST autorizado a solicitar o painel |
| `EVENT_ADMIN_IDS` | IDs Discord dos administradores, separados por vírgula |
| `SILENCE_SESSION_SECRET` | Segredo aleatório com no mínimo 32 caracteres |
| `HABBO_WIRED_BASE_URL` | `https://www.habbo.com.br/api/public` |
| `HABBO_WIRED_ROOM_ID` | ID numérico do quarto das variáveis Wired |
| `HABBO_WIRED_READ_KEY` | Chave de leitura Wired (somente Railway) |
| `HABBO_WIRED_WRITE_KEY` | Chave de escrita Wired (somente Railway) |
| `WIRED_EDITION_VARIABLE` | Nome da variável global de edição (`edicao`) |
| `WIRED_MODALITY_VARIABLE` | Nome da variável global de modalidade (`modalidade`) |
| `WIRED_GAME_VARIABLE` | Nome da variável global que seleciona o jogo (`jogo`) |
| `WIRED_GAME_STATUS_VARIABLE` | Nome da variável global de início/parada (`status_jogo`) |
| `WIRED_MOVE_USER_VARIABLE` | Nome da variável de usuário usada pelo controle Mover usuário (`mover_usuario`) |
| `WIRED_ROOM_USER_VARIABLE` | Variável usada para localizar os usuários presentes no quarto (`usuario_no_quarto`) |

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

## Painel de eventos

O comando `/evento` só funciona dentro do servidor para usuários que:

1. tenham uma conta Habbo registrada em `verified_users`;
2. possuam a role configurada em `HOST_ROLE_ID`.

Depois da confirmação, os usuários listados em `EVENT_ADMIN_IDS` recebem a
solicitação por DM. A aprovação gera um código de uso único, também enviado por
DM. O aplicativo em `desktop/` troca esse código por uma sessão exclusiva. A
chave Wired permanece no Railway e nunca é entregue ao aplicativo.

Se o próprio HOST estiver listado em `EVENT_ADMIN_IDS`, ele pode gerar seu
código sem aprovação de outra pessoa. Caso alguém já esteja usando o painel, o
bot exige uma segunda confirmação antes de encerrar a sessão ativa. O usuário
desconectado é avisado por DM.

Após publicar o código do bot, execute `npm run deploy` para registrar o novo
comando `/evento` no Discord.

Na configuração de uma nova edição, o backend lê `edicao`, soma `1` e envia
`edicao` e `modalidade` juntas em uma única atualização de perfil global. Os
valores de modalidade são: quarteto `0`, trio `1`, dupla `2` e normal `3`.

O comando **Trocar de jogo** define a variável global `jogo` com os valores de
`0` a `16`, na ordem documentada no aplicativo. Como o valor é absoluto, essa
ação usa uma única chamada à API Wired.

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
