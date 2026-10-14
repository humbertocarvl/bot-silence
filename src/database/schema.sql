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

-- Solicitações de acesso ao painel de eventos.
-- Códigos e tokens nunca são persistidos em texto puro: somente seus hashes.
CREATE TABLE IF NOT EXISTS event_access_requests (
  id                       UUID         PRIMARY KEY,
  discord_id               VARCHAR(20)  NOT NULL,
  habbo_username           VARCHAR(100) NOT NULL,
  status                   VARCHAR(20)  NOT NULL DEFAULT 'pending',
  authorization_code_hash  VARCHAR(64)  UNIQUE,
  code_expires_at          TIMESTAMPTZ,
  requested_at             TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at               TIMESTAMPTZ,
  decided_by               VARCHAR(20),
  redeemed_at              TIMESTAMPTZ,
  CONSTRAINT event_access_status_check CHECK (
    status IN ('pending', 'approved', 'rejected', 'redeemed', 'expired', 'revoked')
  )
);

CREATE INDEX IF NOT EXISTS event_access_discord_idx
  ON event_access_requests (discord_id, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS event_access_one_open_request_per_user
  ON event_access_requests (discord_id)
  WHERE status IN ('pending', 'approved');

-- Uma única linha funciona como lease global: somente uma pessoa pode usar o
-- aplicativo por vez. O heartbeat renova expires_at, e sessões abandonadas expiram.
CREATE TABLE IF NOT EXISTS event_active_session (
  lock_id             SMALLINT     PRIMARY KEY CHECK (lock_id = 1),
  request_id          UUID         UNIQUE REFERENCES event_access_requests(id) ON DELETE SET NULL,
  discord_id          VARCHAR(20),
  session_token_hash  VARCHAR(64),
  created_at          TIMESTAMPTZ,
  last_heartbeat_at   TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ
);

INSERT INTO event_active_session (lock_id)
VALUES (1)
ON CONFLICT (lock_id) DO NOTHING;
