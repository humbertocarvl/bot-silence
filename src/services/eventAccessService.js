const crypto = require('crypto');
const { pool, query } = require('../database');

const DEFAULT_CODE_EXPIRY_MINUTES = 15;
const DEFAULT_SESSION_TTL_SECONDS = 120;

class EventAccessError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'EventAccessError';
    this.code = code;
    this.status = status;
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new EventAccessError(
      'service_not_configured',
      `A variável de ambiente ${name} não está configurada.`,
      503,
    );
  }
  return value;
}

function positiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function getAdminIds() {
  return new Set(
    requiredEnv('EVENT_ADMIN_IDS')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

function isEventAdmin(discordId) {
  return getAdminIds().has(String(discordId));
}

function getHostRoleId() {
  return requiredEnv('HOST_ROLE_ID');
}

function hashSecret(value) {
  const secret = requiredEnv('SILENCE_SESSION_SECRET');
  if (secret.length < 32) {
    throw new EventAccessError(
      'service_not_configured',
      'SILENCE_SESSION_SECRET deve possuir pelo menos 32 caracteres.',
      503,
    );
  }
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function generateAuthorizationCode() {
  return `SILENCE-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

async function getEligibility(discordId) {
  const result = await query(
    'SELECT discord_id, habbo_username FROM verified_users WHERE discord_id = $1',
    [discordId],
  );
  return result.rows[0] ?? null;
}

async function createAccessRequest(discordId, habboUsername) {
  const requestExpiryMinutes = positiveIntegerEnv('EVENT_REQUEST_EXPIRY_MINUTES', 30);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE event_access_requests
          SET status = 'expired'
        WHERE discord_id = $1
          AND (
            (status = 'approved' AND code_expires_at <= NOW())
            OR
            (status = 'pending' AND requested_at <= NOW() - ($2::int * INTERVAL '1 minute'))
          )`,
      [discordId, requestExpiryMinutes],
    );

    const existing = await client.query(
      `SELECT id, status
         FROM event_access_requests
        WHERE discord_id = $1
          AND status IN ('pending', 'approved')
        FOR UPDATE`,
      [discordId],
    );

    if (existing.rows[0]) {
      throw new EventAccessError(
        'request_already_open',
        existing.rows[0].status === 'pending'
          ? 'Você já possui uma solicitação aguardando análise.'
          : 'Você já possui um código de autorização válido.',
        409,
      );
    }

    const id = crypto.randomUUID();
    const result = await client.query(
      `INSERT INTO event_access_requests (id, discord_id, habbo_username)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, discordId, habboUsername],
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function cancelAccessRequest(requestId) {
  await query(
    `UPDATE event_access_requests
        SET status = 'rejected', decided_at = NOW()
      WHERE id = $1 AND status = 'pending'`,
    [requestId],
  );
}

async function getAccessRequest(requestId) {
  const result = await query('SELECT * FROM event_access_requests WHERE id = $1', [requestId]);
  return result.rows[0] ?? null;
}

async function approveAccessRequest(requestId, adminDiscordId) {
  if (!isEventAdmin(adminDiscordId)) {
    throw new EventAccessError('not_event_admin', 'Você não pode aprovar esta solicitação.', 403);
  }

  const code = generateAuthorizationCode();
  const codeHash = hashSecret(code);
  const expiryMinutes = positiveIntegerEnv(
    'EVENT_AUTH_CODE_EXPIRY_MINUTES',
    DEFAULT_CODE_EXPIRY_MINUTES,
  );

  const result = await query(
    `UPDATE event_access_requests
        SET status = 'approved',
            authorization_code_hash = $2,
            code_expires_at = NOW() + ($3::int * INTERVAL '1 minute'),
            decided_at = NOW(),
            decided_by = $4
      WHERE id = $1 AND status = 'pending'
      RETURNING *`,
    [requestId, codeHash, expiryMinutes, adminDiscordId],
  );

  if (!result.rows[0]) {
    throw new EventAccessError(
      'request_not_pending',
      'Esta solicitação já foi analisada ou não existe.',
      409,
    );
  }

  return { request: result.rows[0], code, expiryMinutes };
}

async function rejectAccessRequest(requestId, adminDiscordId) {
  if (!isEventAdmin(adminDiscordId)) {
    throw new EventAccessError('not_event_admin', 'Você não pode recusar esta solicitação.', 403);
  }

  const result = await query(
    `UPDATE event_access_requests
        SET status = 'rejected', decided_at = NOW(), decided_by = $2
      WHERE id = $1 AND status = 'pending'
      RETURNING *`,
    [requestId, adminDiscordId],
  );

  if (!result.rows[0]) {
    throw new EventAccessError(
      'request_not_pending',
      'Esta solicitação já foi analisada ou não existe.',
      409,
    );
  }

  return result.rows[0];
}

async function issueAdminAuthorization(discordId, habboUsername) {
  if (!isEventAdmin(discordId)) {
    throw new EventAccessError(
      'not_event_admin',
      'Você não está autorizado a iniciar uma sessão administrativa.',
      403,
    );
  }

  await query(
    `UPDATE event_access_requests
        SET status = 'revoked', authorization_code_hash = NULL, code_expires_at = NULL
      WHERE discord_id = $1 AND status IN ('pending', 'approved')`,
    [discordId],
  );

  const request = await createAccessRequest(discordId, habboUsername);
  return approveAccessRequest(request.id, discordId);
}

async function revokeApprovedRequest(requestId) {
  await query(
    `UPDATE event_access_requests
        SET status = 'revoked', authorization_code_hash = NULL, code_expires_at = NULL
      WHERE id = $1 AND status = 'approved'`,
    [requestId],
  );
}

async function redeemAuthorizationCode(code) {
  if (typeof code !== 'string' || code.length < 20 || code.length > 80) {
    throw new EventAccessError('invalid_code', 'Código inválido ou expirado.', 401);
  }

  const codeHash = hashSecret(code.trim().toUpperCase());
  const sessionToken = generateSessionToken();
  const sessionTokenHash = hashSecret(sessionToken);
  const ttlSeconds = positiveIntegerEnv('EVENT_SESSION_TTL_SECONDS', DEFAULT_SESSION_TTL_SECONDS);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const requestResult = await client.query(
      `SELECT *
         FROM event_access_requests
        WHERE authorization_code_hash = $1
          AND status = 'approved'
          AND code_expires_at > NOW()
        FOR UPDATE`,
      [codeHash],
    );
    const request = requestResult.rows[0];
    if (!request) {
      throw new EventAccessError('invalid_code', 'Código inválido ou expirado.', 401);
    }

    const lockResult = await client.query(
      'SELECT * FROM event_active_session WHERE lock_id = 1 FOR UPDATE',
    );
    const lock = lockResult.rows[0];
    if (lock?.session_token_hash && lock.expires_at && new Date(lock.expires_at) > new Date()) {
      throw new EventAccessError(
        'event_in_use',
        'O painel de eventos já está sendo usado por outra pessoa.',
        409,
      );
    }

    await client.query(
      `UPDATE event_access_requests
          SET status = 'redeemed', redeemed_at = NOW()
        WHERE id = $1`,
      [request.id],
    );

    await client.query(
      `UPDATE event_active_session
          SET request_id = $1,
              discord_id = $2,
              session_token_hash = $3,
              created_at = NOW(),
              last_heartbeat_at = NOW(),
              expires_at = NOW() + ($4::int * INTERVAL '1 second')
        WHERE lock_id = 1`,
      [request.id, request.discord_id, sessionTokenHash, ttlSeconds],
    );

    await client.query('COMMIT');
    return {
      accessToken: sessionToken,
      expiresIn: ttlSeconds,
      discordId: request.discord_id,
      habboUsername: request.habbo_username,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function authenticateSession(token, { renew = false } = {}) {
  if (typeof token !== 'string' || token.length < 32) {
    throw new EventAccessError('invalid_session', 'Sessão inválida ou expirada.', 401);
  }

  const tokenHash = hashSecret(token);
  const ttlSeconds = positiveIntegerEnv('EVENT_SESSION_TTL_SECONDS', DEFAULT_SESSION_TTL_SECONDS);
  const sql = renew
    ? `UPDATE event_active_session
          SET last_heartbeat_at = NOW(),
              expires_at = NOW() + ($2::int * INTERVAL '1 second')
        WHERE lock_id = 1
          AND session_token_hash = $1
          AND expires_at > NOW()
        RETURNING *`
    : `SELECT *
         FROM event_active_session
        WHERE lock_id = 1
          AND session_token_hash = $1
          AND expires_at > NOW()`;
  const params = renew ? [tokenHash, ttlSeconds] : [tokenHash];
  const result = await query(sql, params);

  if (!result.rows[0]) {
    throw new EventAccessError('invalid_session', 'Sessão inválida ou expirada.', 401);
  }
  return result.rows[0];
}

async function releaseSession(token) {
  if (typeof token !== 'string' || token.length < 32) return false;
  const result = await query(
    `UPDATE event_active_session
        SET request_id = NULL,
            discord_id = NULL,
            session_token_hash = NULL,
            created_at = NULL,
            last_heartbeat_at = NULL,
            expires_at = NULL
      WHERE lock_id = 1 AND session_token_hash = $1`,
    [hashSecret(token)],
  );
  return result.rowCount > 0;
}

async function getActiveSession() {
  const result = await query(
    `SELECT request_id, discord_id, created_at, last_heartbeat_at, expires_at
       FROM event_active_session
      WHERE lock_id = 1
        AND session_token_hash IS NOT NULL
        AND expires_at > NOW()`,
  );
  return result.rows[0] ?? null;
}

async function forceReleaseActiveSession(adminDiscordId) {
  if (!isEventAdmin(adminDiscordId)) {
    throw new EventAccessError(
      'not_event_admin',
      'Você não pode encerrar a sessão ativa.',
      403,
    );
  }

  const result = await query(
    `UPDATE event_active_session
        SET request_id = NULL,
            discord_id = NULL,
            session_token_hash = NULL,
            created_at = NULL,
            last_heartbeat_at = NULL,
            expires_at = NULL
      WHERE lock_id = 1
        AND session_token_hash IS NOT NULL
        AND expires_at > NOW()
      RETURNING discord_id`,
  );
  return result.rows[0]?.discord_id ?? null;
}

function validateEventConfiguration() {
  const required = [
    'HOST_ROLE_ID',
    'EVENT_ADMIN_IDS',
    'SILENCE_SESSION_SECRET',
    'HABBO_WIRED_ROOM_ID',
    'HABBO_WIRED_READ_KEY',
    'HABBO_WIRED_WRITE_KEY',
  ];
  return required.filter((name) => !process.env[name]?.trim());
}

module.exports = {
  EventAccessError,
  approveAccessRequest,
  authenticateSession,
  cancelAccessRequest,
  createAccessRequest,
  forceReleaseActiveSession,
  getActiveSession,
  getAccessRequest,
  getAdminIds,
  getEligibility,
  getHostRoleId,
  isEventAdmin,
  issueAdminAuthorization,
  redeemAuthorizationCode,
  rejectAccessRequest,
  releaseSession,
  revokeApprovedRequest,
  validateEventConfiguration,
};
