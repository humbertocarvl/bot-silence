const axios = require('axios');

const BASE_URL = process.env.HABBO_API_BASE || 'https://www.habbo.com.br/api/public';
const IMAGING_URL = 'https://www.habbo.com.br/habbo-imaging/avatarimage';

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

/**
 * Retorna a URL da imagem do avatar do personagem no Habbo.
 *
 * @param {string} username
 * @returns {string}
 */
function getAvatarUrl(username) {
  const params = new URLSearchParams({
    user: username,
    size: 'l',
    gesture: 'sml',
    direction: '2',
    head_direction: '3',
  });
  return `${IMAGING_URL}?${params.toString()}`;
}

module.exports = { getUserByName, getAvatarUrl };
