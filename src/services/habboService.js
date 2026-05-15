const axios = require('axios');

const BASE_URL = process.env.HABBO_API_BASE || 'https://www.habbo.com.br/api/public';

/**
 * Busca um usuário do Habbo pelo nick.
 * Retorna null se o usuário não for encontrado.
 * Lança erro em falhas de rede ou servidor.
 *
 * @param {string} username
 * @returns {Promise<object|null>}
 */
async function getUserByName(username) {
  try {
    const response = await axios.get(`${BASE_URL}/users`, {
      params: { name: username },
      timeout: 10_000,
    });
    return response.data ?? null;
  } catch (error) {
    if (error.response?.status === 404) return null;
    throw error;
  }
}

module.exports = { getUserByName };
