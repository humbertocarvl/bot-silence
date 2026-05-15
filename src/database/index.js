const { Pool } = require('pg');

// Railway sempre usa SSL; em dev local pode ser desativado com DATABASE_SSL=false
const sslEnabled =
  process.env.DATABASE_URL?.includes('railway') ||
  process.env.DATABASE_SSL !== 'false';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslEnabled ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do PostgreSQL:', err);
});

/**
 * Executa uma query parametrizada e devolve o resultado.
 * @param {string} text
 * @param {any[]} [params]
 */
async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

module.exports = { query, pool };
