-- Configurações persistentes do bot (IDs de mensagens, roles, etc.)
CREATE TABLE IF NOT EXISTS bot_config (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT         NOT NULL,
  updated_at  TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
);

-- Verificações pendentes (usuário gerou o código mas ainda não confirmou)
CREATE TABLE IF NOT EXISTS verification_pending (
  id              SERIAL       PRIMARY KEY,
  discord_id      VARCHAR(20)  NOT NULL UNIQUE,
  habbo_username  VARCHAR(100) NOT NULL,
  code            VARCHAR(20)  NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
  expires_at      TIMESTAMPTZ  NOT NULL
);

-- Usuários com conta do Habbo já verificada
CREATE TABLE IF NOT EXISTS verified_users (
  id              SERIAL       PRIMARY KEY,
  discord_id      VARCHAR(20)  NOT NULL UNIQUE,
  habbo_username  VARCHAR(100) NOT NULL,
  habbo_unique_id VARCHAR(100),
  verified_at     TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP
);
