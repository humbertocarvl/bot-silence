const { query } = require('../database/index');
const { generateCode } = require('../utils/codeGenerator');

const CODE_EXPIRY_MINUTES = 60;

/**
 * Cria ou atualiza uma verificação pendente para o usuário.
 * Retorna o código gerado.
 *
 * @param {string} discordId
 * @param {string} habboUsername  nick exato retornado pela API do Habbo
 * @returns {Promise<string>}
 */
async function createOrUpdateVerification(discordId, habboUsername) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

  await query(
    `INSERT INTO verification_pending (discord_id, habbo_username, code, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (discord_id) DO UPDATE
       SET habbo_username = $2,
           code           = $3,
           expires_at     = $4,
           created_at     = CURRENT_TIMESTAMP`,
    [discordId, habboUsername, code, expiresAt],
  );

  return code;
}

/**
 * Retorna a verificação pendente e não expirada do usuário, ou null.
 *
 * @param {string} discordId
 * @returns {Promise<object|null>}
 */
async function getPending(discordId) {
  const result = await query(
    'SELECT * FROM verification_pending WHERE discord_id = $1 AND expires_at > NOW()',
    [discordId],
  );
  return result.rows[0] ?? null;
}

/**
 * Retorna os dados de verificação de um usuário já verificado, ou null.
 *
 * @param {string} discordId
 * @returns {Promise<object|null>}
 */
async function getVerifiedUser(discordId) {
  const result = await query(
    'SELECT * FROM verified_users WHERE discord_id = $1',
    [discordId],
  );
  return result.rows[0] ?? null;
}

/**
 * Persiste o usuário verificado e remove a verificação pendente.
 *
 * @param {string} discordId
 * @param {string} habboUsername
 * @param {string} habboUniqueId
 */
async function saveVerifiedUser(discordId, habboUsername, habboUniqueId) {
  await query(
    `INSERT INTO verified_users (discord_id, habbo_username, habbo_unique_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (discord_id) DO UPDATE
       SET habbo_username  = $2,
           habbo_unique_id = $3,
           verified_at     = CURRENT_TIMESTAMP`,
    [discordId, habboUsername, habboUniqueId],
  );

  await query('DELETE FROM verification_pending WHERE discord_id = $1', [discordId]);
}

/**
 * Remove o vínculo verificado de um usuário (e qualquer pendente).
 * Retorna true se havia vínculo, false se não havia.
 *
 * @param {string} discordId
 * @returns {Promise<boolean>}
 */
async function removeVerifiedUser(discordId) {
  const result = await query(
    'DELETE FROM verified_users WHERE discord_id = $1 RETURNING id',
    [discordId],
  );
  await query('DELETE FROM verification_pending WHERE discord_id = $1', [discordId]);
  return result.rowCount > 0;
}

module.exports = { createOrUpdateVerification, getPending, getVerifiedUser, saveVerifiedUser, removeVerifiedUser };
